import { execSync } from 'node:child_process'
import { getServerEngine } from '@robojs/server'
import type { StartContext, DrainHandle } from 'robo.js'
import { logger } from 'robo.js'
import { emit, isCapable } from 'robo.js/ipc'
import { getStageBridge } from '../core/stage-bridge.js'
import { startVoiceGateway, VOICE_GATEWAY_PORT } from '../core/voice-gateway.js'
import { mockLogger } from '../core/logger.js'
import { getMockModeState } from './init.js'
import { sessionManager } from '../core/manager.js'
import { getStageUIUrl } from '../utils/server.js'
import { resolveBotUser } from '../utils/bot-user-resolver.js'
import { DEFAULT_MOCK_PLUGIN_CONFIG, type MockPluginConfig } from '../types/plugin.js'
import { registerWebSocketHandlers, areHandlersRegistered, markHandlersRegistered } from './prepare.js'
import type { Session } from '../session/session.js'
import { createSessionLogDrain } from '../session/log-drain.js'
import type { SessionLogLevel } from '../types/index.js'

/**
 * Global reference to the mock mode session.
 * Used for shutdown cleanup and summary.
 */
let mockModeSession: Session | null = null

/**
 * Global reference to the log drain handle.
 * Used for cleanup when the session ends.
 */
let mockModeLogDrainHandle: DrainHandle | null = null

/**
 * Gets the current mock mode session (if any).
 * Used by the CLI command for shutdown handling.
 */
export function getMockModeSession(): Session | null {
	return mockModeSession
}

/**
 * Clears the mock mode session reference.
 * Called during cleanup.
 */
export function clearMockModeSession(): void {
	// Clean up log drain if it exists
	if (mockModeLogDrainHandle) {
		mockModeLogDrainHandle.remove()
		mockModeLogDrainHandle = null
	}
	mockModeSession = null
}

/**
 * Lifecycle hook: Called when the Robo starts
 * Registers WebSocket handlers, starts Voice Gateway server, and creates mock mode session.
 *
 * For embedded mode (robo dev --mock): WebSocket handlers are registered here
 * For standalone mode (robo mock start): Handlers were registered via prepare hook callback
 */
export default async (context: StartContext<MockPluginConfig>) => {
	const { pluginConfig } = context
	const config = { ...DEFAULT_MOCK_PLUGIN_CONFIG, ...pluginConfig }

	// In standalone mode, skip all start hook logic.
	// The CLI command (robo mock start) manages server lifecycle directly.
	if (process.env.__ROBO_MOCK_STANDALONE === 'true') {
		mockLogger.debug('Standalone mode - start hook deferred to CLI command')
		return
	}

	// Check mock mode state
	const mockModeState = getMockModeState()

	// If not in mock mode at all, skip everything
	if (!mockModeState.enabled) {
		mockLogger.debug('Not in mock mode, skipping start hook')
		return
	}

	// If connecting to existing external mock server, skip local server setup.
	// The bot will connect to the external server via DISCORD_REST_API env var.
	if (mockModeState.connectingToExisting) {
		mockLogger.info(`Connecting to external mock server on port ${mockModeState.externalServerPort}`)
		// Bot connects to external server - no local infrastructure needed
		return
	}

	// Register WebSocket handlers if not already registered.
	// For embedded mode (robo dev --mock): This is the primary registration path
	//   - Prepare hook skips callback to avoid race conditions
	//   - Server engine is guaranteed to exist here (all prepare hooks completed)
	// For standalone mode: Handlers were registered via prepare hook callback
	if (!areHandlersRegistered()) {
		const engine = getServerEngine()
		if (!engine) {
			mockLogger.error('Server engine not available - @robojs/server may not be installed')
			return
		}
		mockLogger.debug('Registering WebSocket handlers in start hook')
		registerWebSocketHandlers(engine)
		markHandlersRegistered()
	}

	// Initialize the stage bridge (connects session events to stage server)
	getStageBridge()

	// Start Voice Gateway server on separate port
	// @discordjs/voice connects to: ws://host:50001/?v=4
	try {
		await startVoiceGateway(VOICE_GATEWAY_PORT)
	} catch (error) {
		// Voice gateway is optional - log warning but don't fail startup
		mockLogger.warn(`Failed to start Voice Gateway: ${(error as Error).message}`)
	}

	mockLogger.info('Gateway WebSocket server ready')
	mockLogger.info('Stage WebSocket server ready')

	// Handle mock mode session creation
	if (mockModeState.enabled && mockModeState.sessionId) {
		mockLogger.debug('Creating mock mode session...')

		// Resolve bot user using fallback chain:
		// 1. Explicit config from defaultSessionConfig.botUser
		// 2. Fetch from Discord API using real token
		// 3. Default "MockBot"
		const resolvedBotUser = await resolveBotUser(config.defaultSessionConfig?.botUser)
		mockLogger.info(`Bot identity: ${resolvedBotUser.config.username} (${resolvedBotUser.source})`)

		// Merge resolved bot user with session config
		const sessionConfig = {
			...config.defaultSessionConfig,
			botUser: resolvedBotUser.config
		}

		// Create the session with the pre-generated ID
		mockModeSession = await sessionManager.create({
			id: mockModeState.sessionId,
			name: mockModeState.sessionName ?? undefined,
			config: sessionConfig
		})

		// Override DISCORD_TOKEN with the mock session token.
		// This ensures @robojs/discordjs uses the correct token format for REST API calls.
		// The mock server expects tokens in a specific format that includes the session ID.
		process.env.DISCORD_TOKEN = mockModeSession.token
		mockLogger.debug('Set DISCORD_TOKEN to mock session token for REST API authentication')

		// Override DISCORD_CLIENT_ID to match the session's application ID.
		// This ensures command registration works even with fake/missing credentials.
		// The session's applicationId is derived from the resolved bot user (real API, explicit config, or generated).
		process.env.DISCORD_CLIENT_ID = mockModeSession.state.applicationId
		mockLogger.debug('Set DISCORD_CLIENT_ID to match session applicationId for command registration')

		// Wire log drain to capture logs from the Robo process
		// This enables the Stage UI to display logs in real-time
		const sessionForDrain = mockModeSession
		const logDrain = createSessionLogDrain({
			sessionId: sessionForDrain.id,
			connectionId: 'dev-mode', // Single connection in dev mode
			botInfo: {
				userId: resolvedBotUser.config.id,
				username: resolvedBotUser.config.username
			},
			onLog: (entry) => {
				// Record to session's log recorder which forwards to Stage UI
				sessionForDrain.recordLog(entry)
			}
		})

		// Capture cutoff time before drain processes new logs
		const drainCutoff = Date.now()

		// Add drain to the main logger and store handle for cleanup
		mockModeLogDrainHandle = logger().addDrain(logDrain, `mock-session-${sessionForDrain.id}`)

		// Replay buffered historical logs (from before drain was installed)
		replayHistoricalLogs(sessionForDrain, drainCutoff, {
			id: resolvedBotUser.config.id ?? '',
			username: resolvedBotUser.config.username ?? 'MockBot'
		})

		mockLogger.debug('Log drain installed for dev mode')

		// Commands are registered by @robojs/discordjs in its start hook
		// Stage UI gets state via state_sync when it connects

		// Log the Stage UI URL for easy access
		const stageUrl = getStageUIUrl(mockModeSession.token)
		mockLogger.info(`Stage UI: ${stageUrl}`)

		// Open browser if flagged by CLI extension (--mock flag)
		if (mockModeState.shouldOpenBrowser) {
			// Small delay to ensure server is fully ready
			await new Promise((resolve) => setTimeout(resolve, 500))

			// Try IPC first (for sandboxed environments like WebContainers)
			if (isCapable('open:url')) {
				emit('open:url', { url: stageUrl, target: 'preview', source: 'mock-stage' })
				mockLogger.debug('Emitted IPC open:url for Stage UI')
			} else {
				// Fallback to native browser open
				try {
					openBrowser(stageUrl)
					mockLogger.debug('Opened Stage UI in browser')
				} catch (error) {
					mockLogger.warn(`Could not open browser: ${(error as Error).message}`)
				}
			}
		}
	}
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

/**
 * Replays buffered historical logs to the session.
 * These are logs that occurred before the drain was installed.
 */
function replayHistoricalLogs(
	session: Session,
	cutoffTime: number,
	botUser: { id: string; username: string }
): void {
	// Get buffered logs (returns newest-first, may contain undefined slots)
	const bufferedLogs = logger().getRecentLogs(100)

	// Filter and reverse to get chronological order
	const historicalLogs = bufferedLogs
		.filter((entry) => entry && entry.timestamp.getTime() < cutoffTime)
		.reverse()

	if (historicalLogs.length === 0) {
		return
	}

	mockLogger.debug(`Replaying ${historicalLogs.length} historical logs`)

	for (const entry of historicalLogs) {
		// Build message from data array (same as log-drain.ts)
		const message = entry.data
			.map((item) => {
				if (item instanceof Error) {
					return `${item.message}${item.stack ? '\n' + item.stack : ''}`
				}
				if (typeof item === 'string') {
					return item
				}
				try {
					return JSON.stringify(item)
				} catch {
					return '[unserializable]'
				}
			})
			.join(' ')

		// Record to session (id will be assigned by LogRecorder)
		session.recordLog({
			timestamp: entry.timestamp.getTime(),
			level: entry.level as SessionLogLevel,
			message,
			source: {
				connectionId: 'dev-mode',
				sessionId: session.id,
				botUserId: botUser.id,
				botUsername: botUser.username
			}
		})
	}
}
