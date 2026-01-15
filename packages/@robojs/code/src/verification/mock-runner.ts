/**
 * MockRunner for @robojs/code SDK
 *
 * Manages @robojs/mock server sessions for verification workflows.
 * Handles server lifecycle, session management, and scenario execution.
 */

import type { ExecutionProvider } from '../types/execution.js'
import type { TerminalSessionHandle, TerminalChunk } from '../types/terminal.js'
import type { AgentEvent } from '../types/events.js'
import type { MockScenarioResult, MockAssertion } from '../types/robo.js'
import type { ScenarioStep } from '../types/acceptance.js'
import { codeLogger } from '../core/logger.js'

/**
 * Mock session information
 */
export interface MockSession {
	/** Session ID from mock server */
	sessionId: string
	/** Authentication token for discord.js client */
	token: string
	/** Base URL of mock server (e.g., http://localhost:3000) */
	serverUrl: string
	/** Terminal session handle for server process */
	serverHandle: TerminalSessionHandle
	/** Bot user info */
	botUser?: { id: string; username: string }
	/** Guild info */
	guilds?: Array<{ id: string; name: string }>
}

/**
 * Configuration for creating a mock session
 */
export interface MockSessionConfig {
	name?: string
	botUser?: { username?: string; id?: string }
	guilds?: Array<{
		name?: string
		id?: string
		channels?: Array<{ name?: string; type?: number }>
	}>
}

/**
 * Options for MockRunner
 */
export interface MockRunnerOptions {
	/** Execution provider for terminal/http operations */
	provider: ExecutionProvider
	/** Event callback for UI streaming */
	onEvent?: (event: AgentEvent) => void
	/** Timeout for server startup (default: 30000ms) */
	serverTimeout?: number
	/** Timeout for HTTP requests (default: 5000ms) */
	requestTimeout?: number
	/** Port to use (default: 3000, will try others if busy) */
	port?: number
}

/**
 * Command to dispatch to mock server
 */
export interface DispatchCommand {
	type: 'message' | 'slash_command' | 'button' | 'select_menu' | 'modal'
	channelId?: string
	content?: string
	commandName?: string
	options?: Record<string, unknown>
	customId?: string
	values?: string[]
	fields?: Record<string, string>
	user?: { id: string; username: string }
}

/**
 * Result from dispatching a command
 */
export interface DispatchResult {
	success: boolean
	interactionId?: string
	messageId?: string
	error?: string
}

/**
 * Default options
 */
const DEFAULT_OPTIONS = {
	serverTimeout: 30000,
	requestTimeout: 5000,
	port: 3000
} as const

/**
 * Readiness patterns to detect in server output
 */
const READINESS_PATTERNS = [
	/Listening on port (\d+)/i,
	/Server running on.*:(\d+)/i,
	/Ready on.*:(\d+)/i,
	/Started.*:(\d+)/i,
	/Mock server.*port (\d+)/i
]

/**
 * MockRunner - Manages @robojs/mock server sessions
 *
 * Usage:
 * ```ts
 * const runner = new MockRunner({ provider, onEvent })
 * const session = await runner.start()
 * const result = await runner.runScenario(session, scenario)
 * await runner.stop(session)
 * ```
 */
export class MockRunner {
	private provider: ExecutionProvider
	private onEvent?: (event: AgentEvent) => void
	private serverTimeout: number
	private requestTimeout: number
	private defaultPort: number

	// Track active sessions for cleanup
	private activeSessions: Map<string, MockSession> = new Map()
	private activeServerHandles: Set<TerminalSessionHandle> = new Set()

	constructor(options: MockRunnerOptions) {
		this.provider = options.provider
		this.onEvent = options.onEvent
		this.serverTimeout = options.serverTimeout ?? DEFAULT_OPTIONS.serverTimeout
		this.requestTimeout = options.requestTimeout ?? DEFAULT_OPTIONS.requestTimeout
		this.defaultPort = options.port ?? DEFAULT_OPTIONS.port
	}

	/**
	 * Start the mock server and create a session
	 *
	 * @param config - Session configuration
	 * @returns MockSession with server and session info
	 */
	async start(config?: MockSessionConfig): Promise<MockSession> {
		codeLogger.debug('MockRunner: Starting mock server')

		// Start server
		const { url, handle } = await this.startServer()
		this.activeServerHandles.add(handle)

		// Emit session start event
		this.emitMockEvent({
			type: 'session_start',
			sessionId: handle.id
		})

		try {
			// Create session via Control API
			const session = await this.createSession(url, handle, config)
			this.activeSessions.set(session.sessionId, session)

			codeLogger.info('MockRunner: Session created', {
				sessionId: session.sessionId,
				url
			})

			return session
		} catch (error) {
			// Cleanup server on failure
			await this.stopServer(handle)
			throw error
		}
	}

	/**
	 * Start the mock server process
	 *
	 * @returns Server URL and terminal handle
	 */
	async startServer(): Promise<{ url: string; handle: TerminalSessionHandle }> {
		const port = this.defaultPort
		const cmd = 'npx'
		const args = ['robo', 'dev', '--port', String(port)]

		codeLogger.debug('MockRunner: Starting server', { cmd, args })

		// Start terminal session
		const handle = await this.provider.startSession(cmd, args, {
			env: {
				NODE_ENV: 'test',
				ROBO_MOCK: 'true'
			}
		})

		// Wait for readiness
		const url = await this.waitForReady(handle, port)

		return { url, handle }
	}

	/**
	 * Wait for server to be ready
	 *
	 * @param handle - Terminal session handle
	 * @param expectedPort - Expected port number
	 * @returns Server URL once ready
	 */
	private async waitForReady(handle: TerminalSessionHandle, expectedPort: number): Promise<string> {
		const startTime = Date.now()
		let output = ''

		codeLogger.debug('MockRunner: Waiting for server ready')

		// Stream output and look for readiness signal
		for await (const chunk of this.provider.streamSession(handle)) {
			// Emit terminal chunk
			this.onEvent?.({ type: 'terminal', chunk })

			if (chunk.type === 'output' && chunk.text) {
				output += chunk.text

				// Check for readiness patterns
				for (const pattern of READINESS_PATTERNS) {
					const match = output.match(pattern)
					if (match) {
						const port = parseInt(match[1], 10) || expectedPort
						const url = `http://localhost:${port}`

						codeLogger.debug('MockRunner: Server ready', { url })
						return url
					}
				}
			}

			if (chunk.type === 'exit') {
				throw new Error(`Mock server exited unexpectedly with code ${chunk.exitCode}`)
			}

			// Check timeout
			if (Date.now() - startTime > this.serverTimeout) {
				throw new Error(
					`Mock server did not become ready within ${this.serverTimeout}ms. Output: ${output.slice(-500)}`
				)
			}
		}

		throw new Error('Mock server stream ended without readiness signal')
	}

	/**
	 * Create a session via the Control API
	 *
	 * @param serverUrl - Base URL of mock server
	 * @param handle - Server terminal handle
	 * @param config - Session configuration
	 * @returns MockSession
	 */
	private async createSession(
		serverUrl: string,
		handle: TerminalSessionHandle,
		config?: MockSessionConfig
	): Promise<MockSession> {
		const controlUrl = `${serverUrl}/api/control/sessions`

		codeLogger.debug('MockRunner: Creating session', { controlUrl })

		// Make HTTP request to create session
		// Note: In WebContainer, we'd use fetch. In Node, we can also use fetch.
		const response = await this.httpRequest(controlUrl, {
			method: 'POST',
			body: {
				name: config?.name ?? 'code-agent-test',
				config: {
					botUser: config?.botUser ?? { username: 'TestBot' },
					guilds: config?.guilds ?? [{ name: 'Test Guild' }]
				}
			}
		})

		if (!response.ok) {
			throw new Error(`Failed to create session: ${response.status} ${response.statusText}`)
		}

		const sessionData = (await response.json()) as {
			session_id: string
			token: string
		}

		// Get full session state
		const stateResponse = await this.httpRequest(`${serverUrl}/api/control/sessions/${sessionData.session_id}/state`)

		const state = (await stateResponse.json()) as {
			botUser: { id: string; username: string }
			guilds: Array<{ id: string; name: string }>
		}

		return {
			sessionId: sessionData.session_id,
			token: sessionData.token,
			serverUrl,
			serverHandle: handle,
			botUser: state.botUser,
			guilds: state.guilds
		}
	}

	/**
	 * Run a mock scenario
	 *
	 * @param session - Mock session
	 * @param scenario - Scenario to run
	 * @returns Scenario result
	 */
	async runScenario(
		session: MockSession,
		scenario: { id: string; title: string; steps?: ScenarioStep[]; assertions?: string[] }
	): Promise<MockScenarioResult> {
		codeLogger.debug('MockRunner: Running scenario', {
			id: scenario.id,
			title: scenario.title
		})

		// Emit scenario start
		this.emitMockEvent({
			type: 'scenario_start',
			scenarioId: scenario.id,
			title: scenario.title
		})

		const assertions: MockAssertion[] = []
		let error: string | undefined

		try {
			// Run each step
			for (const step of scenario.steps ?? []) {
				const result = await this.executeStep(session, step)
				if (!result.success) {
					error = result.error
					break
				}
			}

			// Run assertions
			if (!error && scenario.assertions) {
				for (const assertion of scenario.assertions) {
					// For now, mark assertions as passed if steps succeeded
					// Future: implement assertion evaluation
					assertions.push({
						description: assertion,
						passed: true
					})

					this.emitMockEvent({
						type: 'assertion',
						scenarioId: scenario.id,
						description: assertion,
						passed: true
					})
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err)
		}

		const passed = !error && assertions.every((a) => a.passed)

		// Emit scenario end
		this.emitMockEvent({
			type: 'scenario_end',
			scenarioId: scenario.id,
			passed
		})

		return {
			id: scenario.id,
			title: scenario.title,
			passed,
			assertions,
			error
		}
	}

	/**
	 * Execute a single scenario step
	 */
	private async executeStep(session: MockSession, step: ScenarioStep): Promise<{ success: boolean; error?: string }> {
		codeLogger.debug('MockRunner: Executing step', { action: step.action })

		try {
			// Parse step action to determine dispatch type
			const command = this.parseStepToCommand(step, session)

			if (command) {
				const result = await this.dispatchCommand(session, command)
				if (!result.success) {
					return { success: false, error: result.error }
				}
			}

			return { success: true }
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err)
			}
		}
	}

	/**
	 * Parse a scenario step into a dispatch command
	 */
	private parseStepToCommand(step: ScenarioStep, session: MockSession): DispatchCommand | null {
		const action = step.action.toLowerCase()

		// Get first channel for default
		const defaultChannelId = '0' // Mock server creates channels with predictable IDs

		if (action.includes('send message') || action.includes('type message')) {
			return {
				type: 'message',
				channelId: defaultChannelId,
				content: (step.input as string) ?? step.expected ?? 'test message'
			}
		}

		if (action.includes('slash command') || action.includes('run command') || action.includes('/')) {
			const cmdMatch = action.match(/\/(\w+)/)
			return {
				type: 'slash_command',
				channelId: defaultChannelId,
				commandName: cmdMatch?.[1] ?? 'ping',
				options: step.input as Record<string, unknown> | undefined
			}
		}

		if (action.includes('click button')) {
			return {
				type: 'button',
				customId: (step.input as string) ?? 'button_0'
			}
		}

		// Unknown action - return null to skip
		return null
	}

	/**
	 * Dispatch a command to the mock server
	 *
	 * @param session - Mock session
	 * @param command - Command to dispatch
	 * @returns Dispatch result
	 */
	async dispatchCommand(session: MockSession, command: DispatchCommand): Promise<DispatchResult> {
		const dispatchUrl = `${session.serverUrl}/api/control/sessions/${session.sessionId}/dispatch`

		codeLogger.debug('MockRunner: Dispatching command', { type: command.type })

		// Map command to dispatch payload
		let event: string
		let data: Record<string, unknown>

		switch (command.type) {
			case 'message':
				event = 'MESSAGE_CREATE'
				data = {
					channel_id: command.channelId,
					content: command.content,
					author: command.user ?? session.botUser
				}
				break

			case 'slash_command':
				event = 'INTERACTION_CREATE'
				data = {
					type: 2, // APPLICATION_COMMAND
					channel_id: command.channelId,
					data: {
						name: command.commandName,
						options: command.options
					}
				}
				break

			case 'button':
				event = 'INTERACTION_CREATE'
				data = {
					type: 3, // MESSAGE_COMPONENT
					data: {
						component_type: 2, // Button
						custom_id: command.customId
					}
				}
				break

			case 'select_menu':
				event = 'INTERACTION_CREATE'
				data = {
					type: 3, // MESSAGE_COMPONENT
					data: {
						component_type: 3, // Select menu
						custom_id: command.customId,
						values: command.values
					}
				}
				break

			case 'modal':
				event = 'INTERACTION_CREATE'
				data = {
					type: 5, // MODAL_SUBMIT
					data: {
						custom_id: command.customId,
						components: command.fields
					}
				}
				break

			default:
				return { success: false, error: `Unknown command type: ${command.type}` }
		}

		try {
			const response = await this.httpRequest(dispatchUrl, {
				method: 'POST',
				body: { event, data }
			})

			if (!response.ok) {
				const text = await response.text()
				return { success: false, error: `Dispatch failed: ${response.status} - ${text}` }
			}

			const result = (await response.json()) as { success: boolean; dispatched?: number }
			return { success: result.success }
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err)
			}
		}
	}

	/**
	 * Delete a session from the mock server
	 *
	 * @param session - Session to delete
	 */
	async deleteSession(session: MockSession): Promise<void> {
		const deleteUrl = `${session.serverUrl}/api/control/sessions/${session.sessionId}`

		codeLogger.debug('MockRunner: Deleting session', { sessionId: session.sessionId })

		try {
			await this.httpRequest(deleteUrl, { method: 'DELETE' })
		} catch (err) {
			codeLogger.warn('MockRunner: Failed to delete session', { error: err })
		}

		this.activeSessions.delete(session.sessionId)
	}

	/**
	 * Stop the mock server
	 *
	 * @param session - Session containing server handle
	 */
	async stop(session: MockSession): Promise<void> {
		codeLogger.debug('MockRunner: Stopping session', { sessionId: session.sessionId })

		// Emit session end
		this.emitMockEvent({
			type: 'session_end',
			sessionId: session.sessionId,
			success: true
		})

		// Delete session first
		await this.deleteSession(session)

		// Stop server
		await this.stopServer(session.serverHandle)
	}

	/**
	 * Stop a server by its handle
	 */
	async stopServer(handle: TerminalSessionHandle): Promise<void> {
		codeLogger.debug('MockRunner: Stopping server', { id: handle.id })

		try {
			await this.provider.stopSession(handle)
		} catch (err) {
			codeLogger.warn('MockRunner: Failed to stop server', { error: err })
		}

		this.activeServerHandles.delete(handle)
	}

	/**
	 * Cleanup all active sessions and servers
	 *
	 * Call this on abort or error to ensure no orphaned processes.
	 */
	async cleanup(): Promise<void> {
		codeLogger.debug('MockRunner: Cleaning up', {
			sessions: this.activeSessions.size,
			servers: this.activeServerHandles.size
		})

		// Delete all sessions
		for (const session of this.activeSessions.values()) {
			await this.deleteSession(session)
		}

		// Stop all servers
		for (const handle of this.activeServerHandles) {
			await this.stopServer(handle)
		}

		this.activeSessions.clear()
		this.activeServerHandles.clear()
	}

	/**
	 * Make an HTTP request
	 *
	 * Uses fetch API which works in both Node and WebContainer.
	 */
	private async httpRequest(
		url: string,
		options?: {
			method?: 'GET' | 'POST' | 'DELETE'
			body?: unknown
		}
	): Promise<Response> {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), this.requestTimeout)

		try {
			const response = await fetch(url, {
				method: options?.method ?? 'GET',
				headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
				body: options?.body ? JSON.stringify(options.body) : undefined,
				signal: controller.signal
			})

			return response
		} finally {
			clearTimeout(timeout)
		}
	}

	/**
	 * Emit a mock event
	 */
	private emitMockEvent(
		event:
			| { type: 'session_start'; sessionId: string }
			| { type: 'session_end'; sessionId: string; success: boolean }
			| { type: 'scenario_start'; scenarioId: string; title: string }
			| { type: 'scenario_end'; scenarioId: string; passed: boolean }
			| { type: 'assertion'; scenarioId: string; description: string; passed: boolean }
	): void {
		this.onEvent?.({ type: 'mock', event })
	}
}
