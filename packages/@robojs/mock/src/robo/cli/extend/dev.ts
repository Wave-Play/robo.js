/**
 * CLI Extension for `robo dev` command
 *
 * Adds mock mode option:
 * - --mock (-M): Enable mock mode
 *   - No value: Auto-detect - connect to existing server if running, else start embedded
 *   - Session ID: Connect to specific session on external server
 *   - "new": Create new session on external server
 */
import path from 'node:path'
import type { CliExtendConfig, CliBeforeHook } from 'robo.js'
import { generateSessionId, createMockToken, parseMockToken } from '../../../utils/id.js'
import { getServerPort, getMockPluginPrefix } from '../../../utils/server.js'
import { readServerInfo, STANDALONE_MOCK_PORT } from '../../../utils/server-info.js'

export const config: CliExtendConfig = {
	options: [
		{
			alias: '-M',
			name: '--mock',
			description: 'Enable mock mode (optional: session ID to connect to external server)',
			type: 'string'
		}
	],
	priority: 10
}

export const before: CliBeforeHook = async (ctx) => {
	const { mock } = ctx.options as { mock?: string | boolean }

	// Not specified - continue normally (no mock mode)
	if (mock === undefined) {
		return
	}

	// Set mock mode flag
	process.env.ROBO_MOCK_MODE = 'true'

	// Determine mode based on value:
	// - true or '' (empty string) = auto-detect mode
	// - 'new' = external mode, create new session
	// - 'sess_xxx' or token = external mode, connect to existing session
	const isAutoDetect = mock === true || mock === ''
	const forceEmbedded = process.env.__ROBO_MOCK_FORCE_EMBEDDED === 'true'

	if (isAutoDetect) {
		// Force embedded mode (skip external server auto-detection).
		// This is used by RoboKit when starting a robo for deterministic simulation UX.
		if (forceEmbedded) {
			ctx.logger.debug('Mock mode enabled (forced embedded)')
			await setupEmbeddedMode(ctx)
			return
		}

		// Auto-detect: check if a mock server is already running
		const isServerRunning = await checkMockServerRunning(ctx)

		if (isServerRunning) {
			// Connect to existing server and auto-create session
			ctx.logger.info('Detected running mock server, connecting...')
			await setupExternalConnection(ctx, 'new')
		} else {
			// Start embedded server + bot
			await setupEmbeddedMode(ctx)
		}
	} else {
		// Explicit session ID or "new" - connect to external server
		await setupExternalConnection(ctx, mock as string)
	}
}

/**
 * Check if a mock server is already running.
 * First checks server-info file, then does a health check.
 */
async function checkMockServerRunning(ctx: { logger: { debug: (msg: string) => void } }): Promise<boolean> {
	// Check server-info file first
	const serverInfo = await readServerInfo()

	if (!serverInfo) {
		ctx.logger.debug('No server-info file found')
		return false
	}

	// Verify the server is actually responding
	const port = serverInfo.port
	const prefix = getMockPluginPrefix()
	const healthUrl = `http://localhost:${port}${prefix}/api/v10/gateway/bot`

	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 1000)

		const response = await fetch(healthUrl, {
			method: 'GET',
			signal: controller.signal
		})

		clearTimeout(timeoutId)

		if (response.ok) {
			ctx.logger.debug(`Mock server responding on port ${port}`)
			return true
		}
	} catch {
		ctx.logger.debug(`Mock server not responding on port ${port}`)
	}

	return false
}

/**
 * Setup embedded mock mode - server and bot run in the same process.
 * Used when no external server is running.
 */
async function setupEmbeddedMode(ctx: { logger: { debug: (msg: string) => void } }) {
	const sessionId = generateSessionId()
	const sessionToken = createMockToken(sessionId)
	const projectName = path.basename(process.cwd())
	const sessionName = `${projectName}-mock`

	// Store real Discord token before overwriting
	const realDiscordToken = process.env.DISCORD_TOKEN

	// Set environment variables for init/start hooks
	process.env.ROBO_MOCK_SESSION_ID = sessionId
	process.env.ROBO_MOCK_SESSION_NAME = sessionName
	process.env.ROBO_MOCK_REAL_TOKEN = realDiscordToken ?? ''
	process.env.DISCORD_TOKEN = sessionToken

	// Set REST API URL (will be resolved at runtime with embedded server)
	const port = getServerPort()
	const prefix = getMockPluginPrefix()
	process.env.DISCORD_REST_API = `http://localhost:${port}${prefix}/api`

	// Signal to open browser after start
	process.env.__ROBO_MOCK_OPEN_BROWSER = 'true'

	ctx.logger.debug(`Mock mode enabled (embedded, session: ${sessionId})`)
}

/**
 * Setup external connection mode - connect bot to an existing mock server.
 * Used when a standalone mock server is already running.
 */
async function setupExternalConnection(
	ctx: { logger: { debug: (msg: string) => void; info: (msg: string) => void; error: (msg: string) => void } },
	sessionInput: string
) {
	// Try to read server info file or env var for port discovery
	const envPort = process.env.ROBO_MOCK_PORT
	const serverInfo = await readServerInfo()
	const port = envPort ? parseInt(envPort, 10) : serverInfo?.port ?? STANDALONE_MOCK_PORT
	const baseUrl = `http://localhost:${port}`

	let sessionId: string

	// Handle "new" or empty value - create a new session on the external server
	if (sessionInput === 'new' || sessionInput === '') {
		ctx.logger.info(`Creating new session on mock server at port ${port}...`)

		try {
			const response = await fetch(`${baseUrl}/api/control/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: `${path.basename(process.cwd())}-bot` })
			})

			if (!response.ok) {
				ctx.logger.error(`Failed to create session: ${response.status} ${response.statusText}`)
				process.exit(1)
			}

			const data = (await response.json()) as { session_id: string; token: string }
			sessionId = data.session_id
			ctx.logger.info(`Created session: ${sessionId}`)
		} catch (error) {
			ctx.logger.error(`Failed to connect to mock server at ${baseUrl}: ${(error as Error).message}`)
			ctx.logger.info('Make sure the mock server is running: robo mock start')
			process.exit(1)
		}
	} else {
		// Parse session ID from input (supports sess_xxx or mock:sess_xxx formats)
		sessionId = sessionInput

		// Try parsing as mock token first
		const parsed = parseMockToken(sessionInput)
		if (parsed) {
			sessionId = parsed
		} else if (sessionInput.startsWith('mock:')) {
			sessionId = sessionInput.slice(5)
		}
	}

	// Create mock token for this session
	const sessionToken = createMockToken(sessionId)

	// Store real Discord token
	const realDiscordToken = process.env.DISCORD_TOKEN

	// Set environment variables
	process.env.ROBO_MOCK_SESSION_ID = sessionId
	process.env.ROBO_MOCK_REAL_TOKEN = realDiscordToken ?? ''
	process.env.DISCORD_TOKEN = sessionToken

	// Set REST API URL with mock prefix
	// The mock plugin registers routes at /mock/api/v10/* so Discord.js must hit the prefixed path
	const prefix = getMockPluginPrefix()
	process.env.DISCORD_REST_API = `${baseUrl}${prefix}/api`

	// Mark as connecting to existing (don't open browser, don't create session)
	process.env.__ROBO_MOCK_CONNECT_EXISTING = 'true'
	process.env.__ROBO_MOCK_SERVER_PORT = String(port)

	ctx.logger.info(`Connecting to mock session: ${sessionId} on port ${port}`)
}
