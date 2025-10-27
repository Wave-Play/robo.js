import type { RoboRequest } from '@robojs/server'
import { config } from '@robojs/xp'
import type { GlobalConfig } from '@robojs/xp'
import { wrapHandler, success, validateMethod, ERROR_CODES } from '../utils.js'

/**
 * Global Configuration Defaults Endpoint
 *
 * Handles reading and updating global configuration defaults that apply to all guilds.
 *
 * **CRITICAL WARNING: This endpoint is currently unauthenticated.**
 * In production, implement authentication and restrict access to bot owner/administrators only.
 * Changes to global configuration affect ALL guilds using the bot.
 *
 * **Important Behavior:**
 * - Setting global config clears all guild config caches
 * - Guilds will re-merge with new global defaults on next access
 * - Guild-specific overrides always take precedence
 *
 * **Routes:**
 * - GET /api/xp/config/global - Get global configuration defaults
 * - PUT /api/xp/config/global - Update global configuration defaults
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Validate method
	validateMethod(request, ['GET', 'PUT'])

	switch (request.method) {
		case 'GET': {
			// Get global configuration
			const globalConfig = config.getGlobal()
			return success(globalConfig)
		}

		case 'PUT': {
			// Update global configuration
			let body
			try {
				body = await request.json()
			} catch {
				const error = new Error('Invalid JSON in request body')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}
			const updates = body as Partial<GlobalConfig>

			// Validate at least one field provided
			if (!updates || Object.keys(updates).length === 0) {
				const error = new Error('At least one configuration field must be provided')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			try {
				// config.setGlobal includes validation
				config.setGlobal(updates)

				// Return updated configuration
				const updatedConfig = config.getGlobal()
				return success({
					updated: updatedConfig,
					message: 'Global defaults updated. All guild configs will be re-merged on next access.',
					affectedGuilds: 'all'
				})
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
