import { createOrGetRoadmapCategory } from '../../../../core/forum-manager.js'
import { getSettings } from '../../../../core/settings.js'
import { getGuildFromRequest, success, wrapHandler, validateMethod, ERROR_CODES } from '../../utils.js'
import { getProvider, isProviderReady } from '../../../../events/_start.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Forum setup endpoint
 *
 * @route POST /api/roadmap/forum/:guildId/setup
 * @param guildId - Guild ID from path parameters
 * @returns Created or existing category and forum channels information
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Only allow POST requests
	validateMethod(request, ['POST'])

	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// Check provider initialization
	if (!isProviderReady()) {
		const err = new Error('Roadmap provider is not configured')
		err.name = ERROR_CODES.PROVIDER_NOT_READY
		throw err
	}

	// Get provider instance
	const provider = getProvider()
	if (!provider) {
		const err = new Error('Roadmap provider is not available')
		err.name = ERROR_CODES.PROVIDER_NOT_READY
		throw err
	}

	// Get provider columns for forum creation
	const columns = await provider.getColumns()

	// Check previous category ID to determine if this is a new creation
	const previousSettings = getSettings(guild.id)
	const previousCategoryId = previousSettings.categoryId

	try {
		// Create or retrieve roadmap category and forums
		const { category, forums } = await createOrGetRoadmapCategory({
			guild,
			columns: [...columns]
		})

		// Determine if the category was newly created
		const created = !previousCategoryId || previousCategoryId !== category.id

		// Build setup result response
		const setupResult = {
			categoryId: category.id,
			categoryName: category.name,
			forums: Array.from(forums.entries()).map(([columnName, forum]) => ({
				columnName,
				channelId: forum.id,
				channelName: forum.name,
				url: forum.url
			})),
			created
		}

		return success(setupResult)
	} catch (err) {
		// Check for permission errors
		if (err instanceof Error && err.message.includes('Missing Permissions')) {
			const permErr = new Error('Bot lacks Manage Channels permission. Please grant the required permissions.')
			permErr.name = ERROR_CODES.MISSING_PERMISSIONS
			throw permErr
		}

		throw err
	}
})
