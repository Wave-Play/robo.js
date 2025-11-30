/**
 * Stop Hook - Discord Client Shutdown
 *
 * This hook runs during Robo.stop() to:
 * 1. Gracefully disconnect from Discord
 * 2. Clean up the client instance
 */
import { getClient, hasClient, clearClient } from '../../core/client.js'
import { discordLogger } from '../../core/logger.js'

/**
 * Stop hook - Gracefully shuts down the Discord client
 */
export default async function stopHook(): Promise<void> {
	if (!hasClient()) {
		discordLogger.debug('No Discord client to stop')
		return
	}

	const client = getClient()

	try {
		discordLogger.debug('Disconnecting Discord client...')

		// Destroy the client (disconnects and cleans up)
		client.destroy()

		discordLogger.debug('Discord client disconnected')
	} catch (error) {
		discordLogger.error('Error while stopping Discord client:', error)
	} finally {
		// Always clear the client reference
		clearClient()
	}
}
