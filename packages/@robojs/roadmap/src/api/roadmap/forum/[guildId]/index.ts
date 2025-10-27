import { getRoadmapCategory, getAllForumChannels } from '../../../../core/forum-manager.js'
import { getSettings } from '../../../../core/settings.js'
import { getGuildFromRequest, success, wrapHandler, validateMethod, ERROR_CODES } from '../../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Forum information endpoint
 *
 * @route GET /api/roadmap/forum/:guildId
 * @param guildId - Guild ID from path parameters
 * @returns Category and forum channels information and configuration
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Only allow GET requests
	validateMethod(request, ['GET'])

	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// Fetch roadmap category and forums
	const category = await getRoadmapCategory(guild)
	const forums = await getAllForumChannels(guild)

	// Check if forums have been set up
	if (!category || forums.size === 0) {
		const err = new Error('Roadmap forums not set up. Run /roadmap setup or POST to /api/roadmap/forum/:guildId/setup')
		err.name = ERROR_CODES.FORUM_NOT_SETUP
		throw err
	}

	// Get guild-specific settings
	const settings = getSettings(guild.id)

	// Build forum information response
	const forumInfo = {
		categoryId: category.id,
		categoryName: category.name,
		isPublic: settings.isPublic ?? false,
		forums: Array.from(forums.entries()).map(([columnName, forum]) => ({
			columnName,
			channelId: forum.id,
			channelName: forum.name,
			tagCount: forum.availableTags.length,
			tags: forum.availableTags.map((tag) => ({ id: tag.id, name: tag.name }))
		})),
		lastSync: settings.lastSyncTimestamp ? new Date(settings.lastSyncTimestamp).toISOString() : null
	}

	return success(forumInfo)
})
