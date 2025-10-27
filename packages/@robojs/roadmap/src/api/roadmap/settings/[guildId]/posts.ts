import { getSettings } from '../../../../core/settings.js'
import { getGuildFromRequest, success, wrapHandler, validateMethod } from '../../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Synced posts mapping endpoint
 *
 * @route GET /api/roadmap/settings/:guildId/posts
 * @param guildId - Guild ID from path parameters
 * @returns Mapping of card IDs to Discord thread IDs
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Only allow GET requests
	validateMethod(request, ['GET'])

	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// Retrieve guild settings containing synced posts
	const settings = getSettings(guild.id)

	// Extract synced posts mapping
	const syncedPosts = settings.syncedPosts ?? {}

	// Build response with posts mapping and count
	const postsData = {
		posts: syncedPosts,
		count: Object.keys(syncedPosts).length
	}

	return success(postsData)
})
