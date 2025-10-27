import { getSettings, updateSettings, type RoadmapSettings } from '../../../core/settings.js'
import { getGuildFromRequest, success, wrapHandler, ERROR_CODES } from '../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Settings management endpoint
 *
 * @route GET /api/roadmap/settings/:guildId
 * @route PUT /api/roadmap/settings/:guildId
 * @param guildId - Guild ID from path parameters
 * @body updates - Partial settings object (PUT only)
 * @returns Current or updated settings
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// Handle GET request
	if (request.method === 'GET') {
		// Retrieve current settings for guild
		const settings = getSettings(guild.id)

		return success(settings)
	}

	// Handle PUT request
	if (request.method === 'PUT') {
		// Parse settings updates from request body
		const updates = (await request.json()) as Partial<RoadmapSettings>

		// Validate at least one field is provided
		if (Object.keys(updates).length === 0) {
			const err = new Error('No settings updates provided')
			err.name = ERROR_CODES.INVALID_REQUEST
			throw err
		}

		// Apply settings updates and get updated settings
		const updatedSettings = updateSettings(guild.id, updates)

		return success(updatedSettings)
	}

	// Method not allowed
	const err = new Error('Method not allowed. Allowed methods: GET, PUT')
	err.name = ERROR_CODES.METHOD_NOT_ALLOWED
	throw err
})
