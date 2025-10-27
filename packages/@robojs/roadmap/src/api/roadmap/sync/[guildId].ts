import { syncRoadmap } from '../../../core/sync-engine.js'
import { getProvider, isProviderReady } from '../../../events/_start.js'
import { getAllForumChannels } from '../../../core/forum-manager.js'
import { getGuildFromRequest, success, wrapHandler, validateMethod, ERROR_CODES } from '../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Query parameters for sync endpoint
 */
interface SyncQueryParams {
	dryRun?: string
}

/**
 * Manual sync trigger endpoint
 *
 * Syncs roadmap data across all forum channels organized by column.
 *
 * @route POST /api/roadmap/sync/:guildId
 * @param guildId - Guild ID from path parameters
 * @query dryRun - Optional 'true' to perform a dry run without making changes
 * @returns Sync statistics and results
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Only allow POST requests
	validateMethod(request, ['POST'])

	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// Check provider initialization
	if (!isProviderReady()) {
		const err = new Error(
			'Provider not ready. Please configure a roadmap provider in your plugin config and restart the bot.'
		)
		err.name = ERROR_CODES.PROVIDER_NOT_READY
		throw err
	}

	// Get provider instance
	const provider = getProvider()
	if (!provider) {
		const err = new Error('Provider not available')
		err.name = ERROR_CODES.PROVIDER_NOT_READY
		throw err
	}

	// Check forum setup
	const forums = await getAllForumChannels(guild)
	if (forums.size === 0) {
		const err = new Error('Forum channels not set up. Run /roadmap setup or POST to /api/roadmap/forum/:guildId/setup')
		err.name = ERROR_CODES.FORUM_NOT_SETUP
		throw err
	}

	// Parse query parameters
	const query = request.query as SyncQueryParams
	const dryRun = query.dryRun === 'true'

	try {
		// Execute roadmap sync
		const result = await syncRoadmap({ guild, provider, dryRun })

		// Build sync result response
		const syncResult = {
			stats: result.stats,
			syncedAt: result.syncedAt.toISOString(),
			dryRun,
			cardCount: result.cards.length
		}

		return success(syncResult)
	} catch (err) {
		// Categorize sync errors
		if (err instanceof Error) {
			// Map authentication errors
			if (err.message.includes('authentication') || err.message.includes('unauthorized')) {
				const authErr = new Error('Provider authentication failed. Check your credentials and try again.')
				authErr.name = ERROR_CODES.PROVIDER_AUTH_FAILED
				throw authErr
			}

			// Map permission errors
			if (err.message.includes('Missing Permissions')) {
				const permErr = new Error('Bot lacks required permissions to manage forum posts')
				permErr.name = ERROR_CODES.MISSING_PERMISSIONS
				throw permErr
			}

			// Generic sync error
			const syncErr = new Error(`Sync failed: ${err.message}`)
			syncErr.name = ERROR_CODES.SYNC_FAILED
			throw syncErr
		}

		throw err
	}
})
