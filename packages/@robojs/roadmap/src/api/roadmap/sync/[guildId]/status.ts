import { getSettings } from '../../../../core/settings.js'
import { getGuildFromRequest, success, wrapHandler, validateMethod } from '../../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Sync status endpoint
 *
 * @route GET /api/roadmap/sync/:guildId/status
 * @param guildId - Guild ID from path parameters
 * @returns Last sync timestamp and synced post count
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Only allow GET requests
	validateMethod(request, ['GET'])

	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// Retrieve guild settings for sync status
	const settings = getSettings(guild.id)

	// Build sync status response
	const statusData = {
		lastSync: settings.lastSyncTimestamp ? new Date(settings.lastSyncTimestamp).toISOString() : null,
		syncedPostCount: Object.keys(settings.syncedPosts ?? {}).length,
		hasForumSetup: !!settings.forumChannels && Object.keys(settings.forumChannels).length > 0
	}

	return success(statusData)
})
