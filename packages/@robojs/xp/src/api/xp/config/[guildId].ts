import type { RoboRequest } from '@robojs/server'
import { config } from '@robojs/xp'
import type { GuildConfig } from '@robojs/xp'
import { wrapHandler, success, getGuildFromRequest, validateMethod, ERROR_CODES } from '../utils.js'

/**
 * Guild Configuration Endpoint
 *
 * Handles reading and updating XP system settings for a specific guild.
 *
 * **WARNING: This endpoint is currently unauthenticated.**
 * In production, implement authentication and verify that the requester
 * has Manage Guild permission before allowing modifications.
 *
 * **Routes:**
 * - GET /api/xp/config/:guildId - Get current guild configuration
 * - PUT /api/xp/config/:guildId - Update guild configuration (partial updates supported)
 */
export default wrapHandler(async (request: RoboRequest) => {
	const { guildId } = request.params

	// Validate guild
	await getGuildFromRequest(request)

	// Validate method
	validateMethod(request, ['GET', 'PUT'])

	switch (request.method) {
		case 'GET': {
			// Get guild configuration
			const guildConfig = await config.get(guildId)
			return success(guildConfig)
		}

		case 'PUT': {
			// Update guild configuration
			let body
			try {
				body = await request.json()
			} catch {
				const error = new Error('Invalid JSON in request body')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}
			const updates = body as Partial<GuildConfig>

			// Validate at least one field provided
			if (!updates || Object.keys(updates).length === 0) {
				const error = new Error('At least one configuration field must be provided')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			try {
				// config.set includes validation
				await config.set(guildId, updates)

				// Return updated configuration
				const updatedConfig = await config.get(guildId)
				return success(updatedConfig)
			} catch (err) {
				// Wrap validation errors
				const validationError = new Error(`Configuration validation failed: ${(err as Error).message}`)
				;(validationError as Error & { code: string }).code = ERROR_CODES.INVALID_CONFIG
				throw validationError
			}
		}

		default: {
			const error = new Error('Invalid method')
			;(error as Error & { code: string }).code = ERROR_CODES.METHOD_NOT_ALLOWED
			throw error
		}
	}
})
