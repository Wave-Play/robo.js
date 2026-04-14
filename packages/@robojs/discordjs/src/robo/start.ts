/**
 * Start Hook - Discord Client Login
 *
 * This hook runs during Robo.start() AFTER the prepare hook to:
 * 1. Wait for @robojs/server if installed (ensures server is listening)
 * 2. Validate the Discord token
 * 3. Login to Discord
 *
 * The client instance is created in the prepare hook, allowing other plugins
 * to access it during their start hooks before the bot goes online.
 */
import { color, Manifest, Mode, Robo } from 'robo.js'
import { getClient } from '../core/client.js'
import { checkIntents, checkPrefixIntents } from '../core/intents.js'
import { discordLogger } from '../core/logger.js'
import { getRegisteredDiscordEventNames } from './event-topology.js'

/**
 * Start hook - Logs the Discord client into Discord
 */
export default async function startHook(): Promise<void> {
	// In standalone mock mode (robo mock start), skip login entirely.
	// The mock server runs without a bot - bots connect separately via --mock-session.
	if (process.env.__ROBO_MOCK_STANDALONE === 'true') {
		discordLogger.debug('Standalone mock mode - skipping Discord login')
		return
	}

	// Get the bot token from environment
	const token = process.env.DISCORD_TOKEN
	if (!token) {
		throw new Error('Missing DISCORD_TOKEN environment variable. Set it in your .env file.')
	}

	// If @robojs/server is installed, wait for it to be ready before connecting.
	// This ensures the server is listening (important for mock mode where
	// Discord.js needs to connect to the mock server's gateway).
	await waitForServerIfAvailable()

	// Get the client (created in prepare hook)
	const client = getClient()

	// Register ready listener BEFORE login — clientReady fires during login(),
	// so registering after await would miss the event
	client.once('clientReady', async () => {
		Robo.status.set('bot', `On standby as ${Mode.color(color.bold(client.user?.tag ?? 'Unknown'))}`, { priority: 1 })

		// Check for missing intents based on registered event handlers
		checkIntents(client, getRegisteredDiscordEventNames())

		// Check prefix command intents if prefix commands exist
		try {
			const prefixSummaries = Manifest.routeSummariesSync('discordjs', 'prefixCommands')
			if (prefixSummaries.length > 0) {
				const dmEnabled = prefixSummaries.some((summary) => summary.metadata?.dmPermission !== false)
				checkPrefixIntents(client, dmEnabled)
			}
		} catch {
			// Route not in manifest — no prefix commands
		}
	})

	// Login to Discord
	discordLogger.debug('Logging in to Discord...')
	await client.login(token)

	// Register commands in mock mode (build/complete skips, so we do it at runtime)
	// Use dynamic import to avoid loading command registration code in production
	if (process.env.ROBO_MOCK_MODE === 'true') {
		discordLogger.debug('Mock mode - registering commands at runtime')
		const { registerCommandsAtRuntime } = await import('../core/commands.js')
		// Use force: false - mock mode doesn't need to delete existing commands
		await registerCommandsAtRuntime({ force: false })
	}
}

/**
 * Wait for @robojs/server to be ready if in mock mode.
 * Only waits when ROBO_MOCK_MODE is set, since mock mode requires
 * the server to be listening before Discord.js can connect to the mock gateway.
 * Returns immediately in normal mode or if server plugin is not available.
 */
async function waitForServerIfAvailable(): Promise<void> {
	// Only wait for server in mock mode - normal Discord connections don't need it
	if (process.env.ROBO_MOCK_MODE !== 'true') {
		return
	}

	try {
		// Dynamic import to avoid hard dependency on @robojs/server
		// @ts-expect-error - @robojs/server is an optional peer dependency
		const { ready } = await import('@robojs/server')
		discordLogger.debug('Waiting for @robojs/server to be ready...')
		await ready()
		discordLogger.debug('@robojs/server is ready')
	} catch {
		// @robojs/server not installed, continue without waiting
	}
}
