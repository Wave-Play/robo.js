/**
 * WebContainer Service Discovery implementation for @robojs/code SDK
 *
 * Handles starting services, waiting for their URLs via WebContainer's
 * server-ready events, and stopping them. Supports concurrent services
 * (mock, dev, mcp) without URL mix-ups.
 */

import type { LocalServiceDiscovery, ServiceType } from '../../types/execution.js'
import type { ServiceStartOptions, TerminalSessionHandle } from '../../types/terminal.js'
import { CodeAgentError } from '../../errors/index.js'
import { codeLogger } from '../../core/logger.js'

/**
 * WebContainer instance interface (minimal subset needed for discovery)
 */
interface WebContainerInstance {
	spawn(
		command: string,
		args?: string[],
		options?: { cwd?: string; env?: Record<string, string> }
	): Promise<{
		output: ReadableStream<string>
		exit: Promise<number>
		kill(): void
	}>
	on(event: 'server-ready', callback: (port: number, url: string) => void): void
	on(event: 'port', callback: (port: number, type: 'open' | 'close', url: string) => void): void
}

/**
 * Configuration for WebContainerServiceDiscovery
 */
export interface WebContainerServiceDiscoveryConfig {
	/**
	 * WebContainer instance to use
	 */
	container: WebContainerInstance

	/**
	 * Root directory for service commands
	 */
	rootDir?: string

	/**
	 * Default timeout for waiting for service URLs (ms)
	 */
	defaultTimeout?: number

	/**
	 * Service-specific configurations
	 */
	services?: {
		mock?: ServiceConfig
		mcp?: ServiceConfig
		dev?: ServiceConfig
	}
}

/**
 * Configuration for a specific service type
 */
export interface ServiceConfig {
	/**
	 * Command to run (e.g., 'npx')
	 */
	command: string

	/**
	 * Arguments for the command
	 */
	args: string[]

	/**
	 * Default port the service uses
	 */
	defaultPort?: number

	/**
	 * Environment variables
	 */
	env?: Record<string, string>
}

/**
 * Internal state for a running service
 */
interface ServiceState {
	serviceId: string
	type: ServiceType
	port: number
	process: {
		output: ReadableStream<string>
		exit: Promise<number>
		kill(): void
	}
	url: string | null
	urlPromise: Promise<{ url: string }>
	urlResolve: (result: { url: string }) => void
	urlReject: (error: Error) => void
	stopped: boolean
}

/**
 * Default service configurations
 */
const DEFAULT_SERVICES: Record<ServiceType, ServiceConfig> = {
	mock: {
		command: 'npx',
		args: ['robo', 'mock'],
		defaultPort: 3000
	},
	dev: {
		command: 'npx',
		args: ['robo', 'dev'],
		defaultPort: 3000
	},
	mcp: {
		command: 'npx',
		args: ['robo', 'mcp'],
		defaultPort: 3001
	}
}

/**
 * WebContainer implementation of LocalServiceDiscovery
 */
export class WebContainerServiceDiscovery implements LocalServiceDiscovery {
	private readonly container: WebContainerInstance
	private readonly rootDir: string
	private readonly defaultTimeout: number
	private readonly serviceConfigs: Record<ServiceType, ServiceConfig>
	private readonly services: Map<string, ServiceState> = new Map()
	private readonly portToService: Map<number, string> = new Map()
	private serviceCounter: number = 0
	private listenerSetup: boolean = false

	constructor(config: WebContainerServiceDiscoveryConfig) {
		this.container = config.container
		this.rootDir = config.rootDir || '/'
		this.defaultTimeout = config.defaultTimeout || 60000

		// Merge default and custom service configs
		this.serviceConfigs = {
			mock: { ...DEFAULT_SERVICES.mock, ...config.services?.mock },
			dev: { ...DEFAULT_SERVICES.dev, ...config.services?.dev },
			mcp: { ...DEFAULT_SERVICES.mcp, ...config.services?.mcp }
		}
	}

	/**
	 * Set up WebContainer event listeners (idempotent)
	 */
	private setupListeners(): void {
		if (this.listenerSetup) return

		this.container.on('server-ready', (port, url) => {
			codeLogger.debug(`Server ready event: port=${port}, url=${url}`)
			this.handleServerReady(port, url)
		})

		this.container.on('port', (port, type, url) => {
			codeLogger.debug(`Port event: port=${port}, type=${type}, url=${url}`)
			if (type === 'open') {
				this.handleServerReady(port, url)
			}
		})

		this.listenerSetup = true
	}

	/**
	 * Handle server-ready events and resolve waiting services
	 */
	private handleServerReady(port: number, url: string): void {
		// Find service expecting this port
		const serviceId = this.portToService.get(port)
		if (serviceId) {
			const service = this.services.get(serviceId)
			if (service && !service.url && !service.stopped) {
				codeLogger.debug(`Resolving URL for service ${serviceId}: ${url}`)
				service.url = url
				service.urlResolve({ url })
			}
			return
		}

		// Try to match to any service waiting for a URL
		// (fallback for when port isn't exactly known)
		for (const service of this.services.values()) {
			if (!service.url && !service.stopped) {
				codeLogger.debug(`Resolving URL for service ${service.serviceId} (fallback): ${url}`)
				service.url = url
				service.urlResolve({ url })
				this.portToService.set(port, service.serviceId)
				return
			}
		}
	}

	/**
	 * Start a named service in the container
	 */
	async start(service: ServiceType, opts?: ServiceStartOptions): Promise<{ serviceId: string }> {
		this.setupListeners()

		const config = this.serviceConfigs[service]
		const serviceId = `${service}-${++this.serviceCounter}-${Date.now()}`
		const port = opts?.port || config.defaultPort || 3000

		codeLogger.debug(`Starting service: ${serviceId} (${service}) on port ${port}`)

		// Build command with port override if needed
		let args = [...config.args]
		if (opts?.port) {
			// Add port argument (service-specific)
			if (service === 'mock' || service === 'dev') {
				args.push('--port', String(opts.port))
			} else if (service === 'mcp') {
				args.push('--port', String(opts.port))
			}
		}

		const spawnOpts = {
			cwd: opts?.cwd || this.rootDir,
			env: { ...config.env, ...opts?.env }
		}

		let process: ServiceState['process']
		try {
			process = await this.container.spawn(config.command, args, spawnOpts)
		} catch (error) {
			throw new CodeAgentError('EXECUTION_FAILED', `Failed to start service: ${service}`, {
				cause: error as Error,
				details: { service, serviceId }
			})
		}

		// Create URL promise with resolve/reject
		let urlResolve!: (result: { url: string }) => void
		let urlReject!: (error: Error) => void
		const urlPromise = new Promise<{ url: string }>((resolve, reject) => {
			urlResolve = resolve
			urlReject = reject
		})

		// Attach a no-op catch handler to prevent unhandled rejection errors during cleanup.
		// This doesn't prevent real rejections from being caught by callers who await urlPromise.
		urlPromise.catch(() => {
			// Intentionally empty - silences unhandled rejection warnings
		})

		const state: ServiceState = {
			serviceId,
			type: service,
			port,
			process,
			url: null,
			urlPromise,
			urlResolve,
			urlReject,
			stopped: false
		}

		this.services.set(serviceId, state)
		this.portToService.set(port, serviceId)

		// Handle process exit
		process.exit.then((exitCode) => {
			codeLogger.debug(`Service ${serviceId} exited with code ${exitCode}`)
			if (!state.url && !state.stopped) {
				state.urlReject(
					new CodeAgentError('EXECUTION_FAILED', `Service ${service} exited before becoming ready`, {
						details: { exitCode, serviceId }
					})
				)
			}
		})

		// Consume output to prevent backpressure
		;(async () => {
			const reader = process.output.getReader()
			try {
				while (true) {
					const { done } = await reader.read()
					if (done) break
				}
			} catch {
				// Stream closed
			} finally {
				reader.releaseLock()
			}
		})()

		return { serviceId }
	}

	/**
	 * Wait for the service to be ready and return its externally reachable URL
	 */
	async waitForUrl(serviceId: string): Promise<{ url: string }> {
		const service = this.services.get(serviceId)
		if (!service) {
			throw new CodeAgentError('INVALID_STATE', `Service not found: ${serviceId}`)
		}

		if (service.url) {
			return { url: service.url }
		}

		if (service.stopped) {
			throw new CodeAgentError('INVALID_STATE', `Service was stopped: ${serviceId}`)
		}

		// Race between URL discovery and timeout
		const timeout = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new CodeAgentError('TIMEOUT', `Timed out waiting for service URL: ${serviceId}`))
			}, this.defaultTimeout)
		})

		return Promise.race([service.urlPromise, timeout])
	}

	/**
	 * Stop a running service and clean up resources
	 */
	async stop(serviceId: string): Promise<void> {
		const service = this.services.get(serviceId)
		if (!service) {
			return // Already stopped or never existed
		}

		codeLogger.debug(`Stopping service: ${serviceId}`)

		service.stopped = true

		// Kill the process
		try {
			service.process.kill()
		} catch {
			// Process may have already exited
		}

		// Reject URL promise if still pending
		if (!service.url) {
			service.urlReject(new CodeAgentError('ABORT', `Service was stopped: ${serviceId}`))
		}

		// Clean up
		this.services.delete(serviceId)
		this.portToService.delete(service.port)
	}

	/**
	 * Stop all running services
	 */
	async stopAll(): Promise<void> {
		const serviceIds = Array.from(this.services.keys())
		await Promise.all(serviceIds.map((id) => this.stop(id)))
	}

	/**
	 * Get the number of active services
	 */
	getActiveServiceCount(): number {
		return this.services.size
	}

	/**
	 * Check if a service is running
	 */
	isRunning(serviceId: string): boolean {
		const service = this.services.get(serviceId)
		return service !== undefined && !service.stopped
	}

	/**
	 * Get the URL for a service if it's ready
	 */
	getUrl(serviceId: string): string | null {
		return this.services.get(serviceId)?.url || null
	}
}
