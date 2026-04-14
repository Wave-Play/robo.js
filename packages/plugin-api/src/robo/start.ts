/**
 * Start Hook - Server Initialization
 *
 * This hook runs during Robo.start() to:
 * 1. Register all API routes
 * 2. Start the server
 * 3. Optionally start a tunnel for external access
 *
 * Note: The server engine, router, and Vite are initialized in the prepare hook
 * (prepare.ts) so they're available to other plugins during their start hooks.
 */
import { createMethodDispatcher, createRegisteredApiRoutes, normalizeServerPrefix } from '../core/api-routing.js'
import { getApiRuntime } from '../core/api-runtime.js'
import { logger } from '../core/logger.js'
import { findAvailablePort, DEFAULT_MAX_PORT_ATTEMPTS } from '../core/port-utils.js'
import { Mode, portal, Robo } from 'robo.js'
import { emit, isCapable } from 'robo.js/ipc'
import { Nanocore } from 'robo.js/unstable.js'
import type { StartContext, HandlerRecord } from 'robo.js'
import type { TunnelConfig, TunnelInstance, TunnelProvider } from '../core/tunnel/types.js'
import type { ApiHandler, ApiHandlerModule } from './routes/api.js'
import { pluginOptions, type PluginConfig } from './prepare.js'

/**
 * Start hook - Registers API routes, starts the HTTP server, and optionally starts a tunnel
 *
 * Note: Engine, router, and Vite are initialized in prepare.ts
 */
export default async (_context: StartContext<PluginConfig>) => {
	// Get engine and options from prepare hook
	const {
		engine,
		hostname = process.env.ROBO_HOSTNAME,
		port: configuredPort = parseInt(process.env.PORT ?? '3000'),
		maxPortAttempts = DEFAULT_MAX_PORT_ATTEMPTS
	} = pluginOptions

	// Find available port (auto-increment if enabled and port is in use)
	let port = configuredPort
	if (maxPortAttempts > 1) {
		const result = await findAvailablePort({
			port: configuredPort,
			hostname: hostname ?? 'localhost',
			maxAttempts: maxPortAttempts
		})
		port = result.port
	}

	// Use lazy loading in dev mode for instant HMR updates
	const isDev = Mode.isDev()
	const paths: string[] = []
	const prefix = normalizeServerPrefix(pluginOptions.prefix)

	if (isDev) {
		const apiRuntime = getApiRuntime()
		await apiRuntime.initialize(engine, prefix)
		paths.push(...apiRuntime.getRegisteredPaths())
		logger.debug(`Registering ${paths.length} API routes...`)
		globalThis.roboServer.hmrCapabilities = apiRuntime.getCapabilities()
	} else {
		const apiRoutes = Object.values(await loadApiRecords())
		logger.debug(`Registering ${apiRoutes.length} API routes...`)

		for (const route of apiRoutes) {
			await portal.importHandler('server', 'api', route.key)

			const wrappedHandler = createMethodDispatcher(route.handler as ApiHandlerModule | null)
			if (!wrappedHandler) {
				continue
			}

			for (const registeredRoute of createRegisteredApiRoutes(
				{
					key: route.key,
					path: route.path,
					exports: route.exports,
					metadata: route.metadata,
					plugin: route.plugin?.name ?? null,
					pluginVersion: route.plugin?.version,
					module: route.module,
					auto: route.auto
				},
				prefix
			)) {
				engine.registerRoute(registeredRoute.path, wrappedHandler)
				paths.push(registeredRoute.path)
			}
		}

		globalThis.roboServer.hmrCapabilities = {
			serverApiTopology: false,
			serverApiMutableRoutes: false
		}
	}

	logger.debug(`Starting server...`)
	await engine.start({ hostname, port })
	globalThis.roboServer.port = port
	globalThis.roboServer.hostname = hostname ?? 'localhost'
	globalThis.roboServer.startedAt = Date.now()
	globalThis.roboServer.registeredPaths = paths

	// Let the rest of the app know that the server is ready
	globalThis.roboServer.ready = true
	const localUrl = `http://${hostname ?? 'localhost'}:${port}`
	Nanocore.update('watch', { localUrl })

	// Emit IPC event if host supports it (for sandboxed environments like WebContainers)
	if (isCapable('open:url')) {
		emit('open:url', { url: localUrl, target: 'preview', source: 'server' })
	}

	// Start tunnel if enabled via CLI flag or plugin config
	const tunnelEnabled = process.env.__ROBO_TUNNEL_ENABLED === 'true' || pluginOptions.tunnel?.enabled

	if (tunnelEnabled) {
		await startTunnel(port, pluginOptions.tunnel)
	}
}

async function loadApiRecords(): Promise<Record<string, HandlerRecord<ApiHandler>>> {
	await portal.ensureRoute('server', 'api')
	return portal.getByType('server:api') as Record<string, HandlerRecord<ApiHandler>>
}

/**
 * Start the tunnel using the configured provider
 */
async function startTunnel(port: number, config?: TunnelConfig): Promise<void> {
	try {
		let provider: TunnelProvider

		// Get provider from config or default to Cloudflare
		if (config?.provider && typeof config.provider !== 'string') {
			provider = config.provider
		} else {
			const { CloudflareProvider } = await import('../core/tunnel/index.js')
			provider = new CloudflareProvider()
		}

		const tunnelUrl = `http://localhost:${port}`

		logger.event('Starting tunnel...')
		const instance: TunnelInstance = await provider.start(tunnelUrl, {
			domain: config?.cloudflare?.domain ?? process.env.CLOUDFLARE_DOMAIN,
			apiKey: config?.cloudflare?.apiKey ?? process.env.CLOUDFLARE_API_KEY,
			zoneId: config?.cloudflare?.zoneId ?? process.env.CLOUDFLARE_ZONE_ID,
			accountId: config?.cloudflare?.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID,
			tunnelId: process.env.CLOUDFLARE_TUNNEL_ID,
			tunnelToken: process.env.CLOUDFLARE_TUNNEL_TOKEN
		})

		// Store for cleanup in stop hook
		globalThis.roboServer.tunnelInstance = instance
		globalThis.roboServer.tunnelProvider = provider
		Robo.status.set('server', `Tunnel live at ${instance.url}`, { priority: 2 })
	} catch (error) {
		logger.error('Failed to start tunnel:', error)
	}
}
