/**
 * Mock CLI Command - Standalone Server Mode
 *
 * Starts a standalone mock Discord server for testing bots.
 * Bots connect via `robo dev --mock-session <id>`.
 *
 * This command uses Robo's hook system:
 * 1. executePrepareHooks() - @robojs/server creates engine, @robojs/mock registers WS handlers
 * 2. executeStartHooks() - @robojs/server loads API routes and starts server
 *
 * The only manual registration is control routes (session management API)
 * which are standalone-specific and not part of the plugin's normal routes.
 *
 * Unlike `robo dev --mock`, this does NOT:
 * - Build or start a bot
 * - Create sessions automatically (sessions created when bots connect)
 */
import { execSync } from 'node:child_process'
import { createCliCommandConfig, color, Env, Manifest } from 'robo.js'
import { loadConfig, populatePortal, executePrepareHooks, executeStartHooks, loadPluginData } from 'robo.js/unstable.js'
import { writeServerInfo, deleteServerInfo, STANDALONE_MOCK_PORT } from '../../../../utils/server-info.js'
import { mockLogger } from '../../../../core/logger.js'
import { getGatewayServer } from '../../../../core/gateway.js'
import { getStageServer } from '../../../../core/stage.js'
import { getStageBridge } from '../../../../core/stage-bridge.js'
import { startVoiceGateway, VOICE_GATEWAY_PORT } from '../../../../core/voice-gateway.js'
import { sessionManager } from '../../../../core/manager.js'
import { getMockPluginPrefix } from '../../../../utils/server.js'
import {
	dispatchInteractionToSession,
	type DispatchInteractionInput
} from '../../../../session/interaction-dispatch.js'
import type { CliContext } from 'robo.js'
import type { ActionType, CreateSessionOptions, MockAttachment, SessionConfig } from '../../../../types/index.js'
import { serializeSessionState } from '../../../../session/state.js'

// Dynamic imports for @robojs/server
type BaseEngine = import('@robojs/server/engines').BaseEngine

export const config = createCliCommandConfig({
	description: 'Start standalone mock Discord server for testing',
	options: [
		{
			alias: '-p',
			name: '--port',
			description: 'Port to run the mock server on',
			type: 'number'
		},
		{
			alias: '-m',
			name: '--mode',
			description: 'Mode to run in (dev, prod, etc.)',
			type: 'string'
		},
		{
			alias: '-s',
			name: '--silent',
			description: 'Suppress output',
			type: 'boolean',
			default: false
		},
		{
			alias: '-v',
			name: '--verbose',
			description: 'Verbose debug output',
			type: 'boolean',
			default: false
		},
		{
			alias: '-n',
			name: '--no-browser',
			description: 'Skip opening Stage UI in browser',
			type: 'boolean',
			default: false
		}
	]
} as const)

export default async function mockCommand({ options, logger }: CliContext) {
	const { mode, silent, verbose } = options as {
		port?: number
		mode?: string
		silent?: boolean
		verbose?: boolean
		'no-browser'?: boolean
	}
	const port = (options.port as number | undefined) ?? STANDALONE_MOCK_PORT
	const noBrowser = options['no-browser'] as boolean | undefined

	// Configure logger
	if (verbose) {
		mockLogger.setup({ level: 'debug' })
	}

	// Set NODE_ENV if not already set
	if (!process.env.NODE_ENV) {
		process.env.NODE_ENV = 'development'
	}

	// Set environment variables for standalone mode
	// These are read by prepare.ts and start.ts hooks
	process.env.PORT = String(port)
	process.env.ROBO_MOCK_MODE = 'true'
	process.env.__ROBO_MOCK_STANDALONE = 'true'

	// Load environment variables with mode support
	const envMode = mode ?? process.env.NODE_ENV
	await Env.load({ mode: envMode })

	if (!silent) {
		logger.log('')
		logger.log(color.bold(`  Starting standalone mock server`))
		logger.log('')
	}

	// 1. Load config (required for loadPluginData)
	await loadConfig()

	// 2. Get plugin data from config
	const plugins = loadPluginData()
	mockLogger.debug(`Loaded ${plugins.size} plugin(s) from config`)

	// 3. Initialize manifest for portal access
	// Always use 'production' mode since plugins only have production builds
	// (there's no .robo/manifest/development/ in plugin packages)
	const manifestMode = 'production'
	await Manifest.initialize(manifestMode)

	// 4. Populate portal (loads commands, events, API routes from manifest)
	await populatePortal(manifestMode)
	mockLogger.debug('Portal populated')

	// 5. Initialize mock infrastructure BEFORE hooks run
	// This ensures gateway/stage servers exist when prepare hook registers WS handlers
	getGatewayServer()
	getStageServer()
	getStageBridge()

	// Start Voice Gateway on separate port
	try {
		await startVoiceGateway(VOICE_GATEWAY_PORT)
		mockLogger.debug(`Voice Gateway started on port ${VOICE_GATEWAY_PORT}`)
	} catch (error) {
		mockLogger.warn(`Failed to start Voice Gateway: ${(error as Error).message}`)
	}

	// Start Activity Proxy server on separate port
	// NOTE: In standalone mode, @robojs/mock start hook is skipped, so we must start the proxy here.
	try {
		const { getActivityProxyServer, ACTIVITY_PROXY_PORT } = await import('../../../../core/activity-proxy/server.js')
		const proxyServer = getActivityProxyServer()
		const actualPort = await proxyServer.start(ACTIVITY_PROXY_PORT)
		mockLogger.debug(`Activity Proxy started on port ${actualPort}`)
	} catch (error) {
		mockLogger.warn(`Failed to start Activity Proxy: ${(error as Error).message}`)
	}

	// 6. Execute prepare hooks
	// - @robojs/server's prepare: creates engine, sets globalThis.roboServer.engine
	// - @robojs/mock's prepare: registers WebSocket handlers via callback
	mockLogger.debug('Executing prepare hooks...')
	await executePrepareHooks(plugins, manifestMode)

	// 6b. Register mock plugin prefix in the route registry
	// The manifest may not have this info in standalone mode (no build required),
	// so we register it manually to ensure Stage UI static files are served correctly
	try {
		const { getPluginRouteRegistry } = await import('@robojs/server')
		const registry = getPluginRouteRegistry()
		const prefix = getMockPluginPrefix()
		registry.register({ '@robojs/mock': prefix })
		mockLogger.debug(`Registered mock plugin prefix: ${prefix}`)
	} catch (error) {
		mockLogger.warn(`Could not register plugin prefix: ${(error as Error).message}`)
	}

	// 7. Get engine from @robojs/server
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const engine = (globalThis as any).roboServer?.engine as BaseEngine | undefined
	if (!engine) {
		logger.error('Failed to initialize server engine - @robojs/server prepare hook may have failed')
		logger.error('Make sure @robojs/server is installed and configured')
		process.exit(1)
	}

	// 8. Register control API routes BEFORE start hooks
	// These must be registered before @robojs/server's start hook which calls engine.start()
	// They're at non-prefixed paths because Discord.js clients expect /api/v10/gateway/bot
	registerControlRoutes(engine)

	// 9. Execute start hooks
	// - @robojs/server's start: loads API routes from portal (with /mock prefix), starts server
	// - @robojs/mock's start: skipped in standalone mode (via __ROBO_MOCK_STANDALONE check)
	mockLogger.debug('Executing start hooks...')
	await executeStartHooks(plugins, manifestMode)

	// 9. Write server info for port discovery by --mock-session
	// Control routes from the plugin are registered WITH the prefix (e.g., /mock/api/control/...)
	const pluginPrefix = getMockPluginPrefix()
	await writeServerInfo({
		port,
		startedAt: new Date().toISOString(),
		pid: process.pid,
		gatewayUrl: `ws://localhost:${port}/?v=10&encoding=json`,
		restApiUrl: `http://localhost:${port}${pluginPrefix}/api`,
		controlUrl: `http://localhost:${port}${pluginPrefix}/api/control`
	})

	// Get Stage UI URL
	const stageUrl = pluginPrefix ? `http://localhost:${port}${pluginPrefix}/stage/` : `http://localhost:${port}/stage/`

	if (!silent) {
		logger.info(`Mock server running on port ${color.cyan(String(port))}`)
		logger.log('')
		logger.info('To connect a bot:')
		logger.log(`  ${color.dim('1.')} Create a session: ${color.cyan(`curl -X POST http://localhost:${port}${pluginPrefix}/api/control/sessions`)}`)
		logger.log(`  ${color.dim('2.')} Start bot with:   ${color.cyan(`robo dev --mock-session <session_id>`)}`)
		logger.log('')
	}

	// 10. Open Stage UI
	const shouldOpenBrowser = !noBrowser
	if (shouldOpenBrowser) {
		await new Promise((r) => setTimeout(r, 500))

		try {
			openBrowser(stageUrl)
			if (!silent) {
				logger.info(`Stage UI: ${color.cyan(stageUrl)}`)
			}
		} catch (error) {
			if (!silent) {
				logger.warn(`Could not open browser: ${(error as Error).message}`)
				logger.info(`Stage UI: ${stageUrl}`)
			}
		}
	}

	// 11. Setup shutdown handlers
	const shutdown = async (signal: string) => {
		if (!silent) {
			logger.log('')
			logger.info(`Received ${signal}, shutting down...`)
		}

		// Clean up
		await deleteServerInfo()
		try {
			const { stopActivityProxyServer } = await import('../../../../core/activity-proxy/server.js')
			await stopActivityProxyServer()
		} catch {
			// Proxy may not be available
		}
		await engine.stop()
		process.exit(0)
	}

	process.on('SIGINT', () => shutdown('SIGINT'))
	process.on('SIGTERM', () => shutdown('SIGTERM'))

	// Keep process alive
	await new Promise(() => {})
}

/**
 * Register control API routes for session management.
 * These are standalone-specific and not part of the plugin's normal routes.
 */
function registerControlRoutes(engine: BaseEngine): void {
	// Gateway bot endpoint - returns WebSocket URL for Discord.js client
	engine.registerRoute('/api/gateway/bot', async (req) => {
		const host = req.headers.get('host') || `localhost:${STANDALONE_MOCK_PORT}`
		const protocol = host.includes('localhost') || host.startsWith('127.') ? 'ws' : 'wss'
		return {
			url: `${protocol}://${host}`,
			shards: 1,
			session_start_limit: { total: 1000, remaining: 1000, reset_after: 0, max_concurrency: 1 }
		}
	})
	engine.registerRoute('/api/v10/gateway/bot', async (req) => {
		const host = req.headers.get('host') || `localhost:${STANDALONE_MOCK_PORT}`
		const protocol = host.includes('localhost') || host.startsWith('127.') ? 'ws' : 'wss'
		return {
			url: `${protocol}://${host}`,
			shards: 1,
			session_start_limit: { total: 1000, remaining: 1000, reset_after: 0, max_concurrency: 1 }
		}
	})

	// Session management endpoints
	engine.registerRoute('/api/control/sessions', async (req) => {
		if (req.method === 'GET') {
			const sessions = sessionManager.getAll()
			return {
				sessions: sessions.map((s) => ({
					session_id: s.id,
					token: s.token,
					name: s.name,
					created_at: s.createdAt,
					expires_at: s.expiresAt,
					connections: s.connections.size
				}))
			}
		}

		if (req.method === 'POST') {
			let body: { name?: string; ttl?: number; config?: SessionConfig } = {}
			try {
				body = await req.json()
			} catch {
				// Empty body is fine
			}

			const sessionOptions: CreateSessionOptions = {
				name: body.name,
				ttl: body.ttl,
				config: body.config
			}

			const session = await sessionManager.create(sessionOptions)
			return {
				session_id: session.id,
				token: session.token,
				expires_at: session.expiresAt,
				state: serializeSessionState(session.state)
			}
		}

		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	})

	engine.registerRoute('/api/control/sessions/:id', async (req) => {
		const sessionId = req.params.id as string
		const session = sessionManager.get(sessionId)

		if (!session) {
			return new Response(JSON.stringify({ error: 'Session not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		return {
			session_id: session.id,
			token: session.token,
			name: session.name,
			created_at: session.createdAt,
			expires_at: session.expiresAt,
			connections: session.connections.size
		}
	})

	// Actions endpoint - get recorded actions for a session
	engine.registerRoute('/api/control/sessions/:id/actions', async (req) => {
		if (req.method !== 'GET') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), {
				status: 405,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const sessionId = req.params.id as string
		const session = sessionManager.get(sessionId)

		if (!session) {
			return new Response(JSON.stringify({ error: 'Session not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const url = new URL(req.url, 'http://localhost')
		const type = url.searchParams.get('type') as ActionType | null
		const since = url.searchParams.get('since')
		const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
		const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

		let actions = session.getActions()

		// Apply filters
		if (type) {
			actions = actions.filter((a) => a.type === type)
		}
		if (since) {
			const sinceTs = parseInt(since, 10)
			actions = actions.filter((a) => a.timestamp >= sinceTs)
		}

		// Get total before pagination
		const total = actions.length

		// Apply pagination
		actions = actions.slice(offset, offset + limit)

		return {
			actions,
			total,
			limit,
			offset
		}
	})

	// Dispatch endpoint - dispatch events to session connections
	engine.registerRoute('/api/control/sessions/:id/dispatch', async (req) => {
		if (req.method !== 'POST') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), {
				status: 405,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const sessionId = req.params.id as string
		const session = sessionManager.get(sessionId)

		if (!session) {
			return new Response(JSON.stringify({ error: 'Session not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Parse request body
		let body: {
			event: string
			data: Record<string, unknown>
		}

		try {
			body = await req.json()
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate required fields
		if (!body.event || typeof body.event !== 'string') {
			return new Response(JSON.stringify({ error: 'Missing or invalid "event" field' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!body.data || typeof body.data !== 'object') {
			return new Response(JSON.stringify({ error: 'Missing or invalid "data" field' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Handle MESSAGE_CREATE specially
		if (body.event === 'MESSAGE_CREATE') {
			const data = body.data as {
				id?: string
				channel_id?: string
				content?: string
				author?: {
					id?: string
					username?: string
					bot?: boolean
				}
				embeds?: unknown[]
				attachments?: unknown[]
				components?: unknown[]
				mentions?: Array<{ id?: string; username?: string }>
				type?: number
			}

			if (!data.channel_id) {
				return new Response(JSON.stringify({ error: 'MESSAGE_CREATE requires "channel_id" in data' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}

			// Check if this is a raw dispatch with full mention data
			const hasFullMentionData = data.mentions?.some((m) => m.username !== undefined)

			if (hasFullMentionData) {
				// Dispatch raw MESSAGE_CREATE payload
				await session.dispatch(body.event, body.data)
				return {
					success: true,
					dispatched: session.connections.size,
					message_id: data.id ?? 'unknown'
				}
			}

			// Extract mention user IDs from the mentions array
			const mentionIds = data.mentions?.map((m) => m.id).filter((id): id is string => !!id) ?? []

			try {
				const message = await session.dispatchMessage({
					id: data.id,
					channelId: data.channel_id,
					content: data.content,
					author: data.author,
					embeds: data.embeds,
					attachments: data.attachments as MockAttachment[] | undefined,
					components: data.components,
					mentions: mentionIds,
					type: data.type
				})

				return {
					success: true,
					dispatched: session.connections.size,
					message_id: message.id
				}
			} catch (error) {
				return new Response(JSON.stringify({ error: (error as Error).message }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}

		// Handle INTERACTION_CREATE specially for slash commands
		if (body.event === 'INTERACTION_CREATE') {
			const data = body.data as {
				id?: string
				type?: number
				application_id?: string
				token?: string
				data?: unknown
				command_name?: string
				options?: Record<string, string | number | boolean>
				custom_id?: string
				message_id?: string
				values?: string[]
				user?: {
					id?: string
					username?: string
					bot?: boolean
				}
				channel_id?: string
				guild_id?: string
			}

			// Raw INTERACTION_CREATE payload (from integration tests)
			if (data.id && data.type !== undefined && data.application_id && data.token) {
				const interactionData = data.data as { name?: string; custom_id?: string; values?: string[] } | undefined
				const userId = data.user?.id || session.state.currentUser.id
				const channelId = data.channel_id || session.state.channels.values().next().value?.id || ''

				// Create interaction in state
				session.state.addInteraction({
					id: data.id,
					applicationId: data.application_id,
					type: data.type,
					token: data.token,
					channelId,
					guildId: data.guild_id,
					userId,
					commandName: interactionData?.name,
					customId: interactionData?.custom_id,
					values: interactionData?.values,
					createdAt: Date.now(),
					expiresAt: Date.now() + 15 * 60 * 1000
				})

				// Get channel info from state for the channel object (Discord API spec)
				const channel = session.state.channels.get(channelId)

				// Ensure required fields are present for discord.js compatibility
				const rawPayload = body.data as Record<string, unknown>
				const enrichedPayload = {
					...rawPayload,
					entitlements: rawPayload.entitlements ?? [],
					app_permissions: rawPayload.app_permissions ?? '562949953421311',
					locale: rawPayload.locale ?? 'en-US',
					guild_locale: rawPayload.guild_locale ?? 'en-US',
					// Add channel object if not present (Discord API spec)
					channel: rawPayload.channel ?? {
						id: channelId,
						type: channel?.type ?? 0,
						name: channel?.name,
						guild_id: data.guild_id,
						permissions: '562949953421311'
					}
				}

				await session.dispatch(body.event, enrichedPayload)

				return {
					success: true,
					dispatched: session.connections.size,
					interaction_id: data.id,
					interaction_token: data.token
				}
			}

			// Select menu interaction
			if (data.custom_id && data.values !== undefined) {
				if (!data.message_id) {
					return new Response(JSON.stringify({ error: 'Select menu interaction requires "message_id" in data' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					})
				}

				try {
					const interaction = await session.dispatchSelectMenu({
						customId: data.custom_id,
						messageId: data.message_id,
						values: data.values,
						user: data.user,
						channelId: data.channel_id,
						guildId: data.guild_id
					})

					return {
						success: true,
						dispatched: session.connections.size,
						interaction_id: interaction.id,
						interaction_token: interaction.token
					}
				} catch (error) {
					return new Response(JSON.stringify({ error: (error as Error).message }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					})
				}
			}

			// Button click interaction
			if (data.custom_id) {
				if (!data.message_id) {
					return new Response(JSON.stringify({ error: 'Button click requires "message_id" in data' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					})
				}

				try {
					const interaction = await session.dispatchButtonClick({
						customId: data.custom_id,
						messageId: data.message_id,
						user: data.user,
						channelId: data.channel_id,
						guildId: data.guild_id
					})

					return {
						success: true,
						dispatched: session.connections.size,
						interaction_id: interaction.id,
						interaction_token: interaction.token
					}
				} catch (error) {
					return new Response(JSON.stringify({ error: (error as Error).message }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					})
				}
			}

			// Slash command interaction
			if (data.command_name) {
				try {
					const interaction = await session.dispatchSlashCommand({
						commandName: data.command_name,
						options: data.options,
						user: data.user,
						channelId: data.channel_id,
						guildId: data.guild_id
					})

					return {
						success: true,
						dispatched: session.connections.size,
						interaction_id: interaction.id,
						interaction_token: interaction.token
					}
				} catch (error) {
					return new Response(JSON.stringify({ error: (error as Error).message }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					})
				}
			}

			return new Response(JSON.stringify({ error: 'INTERACTION_CREATE requires "command_name", "custom_id", or raw payload' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// For other events, dispatch raw data
		await session.dispatch(body.event, body.data)

		return {
			success: true,
			dispatched: session.connections.size
		}
	})

	// Interaction endpoint - convenience API for dispatching interactions
	engine.registerRoute('/api/control/sessions/:id/interaction', async (req) => {
		if (req.method !== 'POST') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), {
				status: 405,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const sessionId = req.params.id as string
		const session = sessionManager.get(sessionId)

		if (!session) {
			return new Response(JSON.stringify({ error: 'Session not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Parse request body
		let body: DispatchInteractionInput

		try {
			body = await req.json()
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate required fields
		if (body.type === undefined || typeof body.type !== 'number') {
			return new Response(JSON.stringify({ error: 'Missing or invalid "type" field (must be a number)' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Use shared handler
		return dispatchInteractionToSession(session, body)
	})
}

/**
 * Opens a URL in the default browser.
 * Cross-platform implementation.
 */
function openBrowser(url: string): void {
	const platform = process.platform

	let command: string
	if (platform === 'win32') {
		command = `start "" "${url}"`
	} else if (platform === 'darwin') {
		command = `open "${url}"`
	} else {
		command = `xdg-open "${url}"`
	}

	execSync(command, { stdio: 'ignore', windowsHide: true })
}
