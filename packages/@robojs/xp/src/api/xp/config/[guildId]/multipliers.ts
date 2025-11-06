import type { RoboRequest } from '@robojs/server'
import { config } from '@robojs/xp'
import {
	wrapHandler,
	success,
	getGuildFromRequest,
	validateSnowflake,
	validateMethod,
	ERROR_CODES
} from '../../utils.js'

/**
 * Multipliers Configuration Endpoint
 *
 * Handles reading, updating, and removing XP multipliers (server, role, user).
 *
 * **WARNING: This endpoint is currently unauthenticated.**
 * In production, implement authentication and restrict access to administrators only.
 *
 * **Use Cases:**
 * - Setting server-wide XP boost (e.g., 2x XP weekend)
 * - Configuring premium role multipliers (MEE6 Pro parity)
 * - Setting per-user boosts for supporters
 * - Removing expired multipliers
 *
 * **Routes:**
 * - GET /api/xp/config/:guildId/multipliers - Get all multipliers
 * - PUT /api/xp/config/:guildId/multipliers - Set/update multipliers
 * - DELETE /api/xp/config/:guildId/multipliers - Remove specific multipliers
 */
export default wrapHandler(async (request: RoboRequest) => {
	const { guildId } = request.params

	// Validate guild
	await getGuildFromRequest(request)

	// Validate method
	validateMethod(request, ['GET', 'PUT', 'DELETE'])

	switch (request.method) {
		case 'GET': {
			// Get all multipliers
			const guildConfig = await config.get(guildId)
			const multipliers = guildConfig.multipliers || {}

			return success({
				server: multipliers.server,
				role: multipliers.role,
				user: multipliers.user,
				effective: {
					serverMultiplier: multipliers.server || 1.0,
					roleCount: multipliers.role ? Object.keys(multipliers.role).length : 0,
					userCount: multipliers.user ? Object.keys(multipliers.user).length : 0
				}
			})
		}

		case 'PUT': {
			// Set/update multipliers
			let body: unknown
			try {
				body = await request.json()
			} catch {
				const error = new Error('Invalid JSON in request body')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Validate body is an object
			if (typeof body !== 'object' || body === null || Array.isArray(body)) {
				const error = new Error('Request body must be an object')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Validate body is an object
			if (typeof body !== 'object' || body === null || Array.isArray(body)) {
				const error = new Error('Request body must be an object')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Load current config
			const guildConfig = await config.get(guildId)
			const currentMultipliers = guildConfig.multipliers || {}

			// Merge new multipliers
			const updatedMultipliers = { ...currentMultipliers }

			// Handle server multiplier
			if ('server' in body) {
				const serverMultiplier = (body as Record<string, unknown>).server
				if (typeof serverMultiplier !== 'number' || serverMultiplier <= 0) {
					const error = new Error('Server multiplier must be a positive number')
					;(error as Error & { code: string }).code = ERROR_CODES.INVALID_MULTIPLIER
					throw error
				}
				updatedMultipliers.server = serverMultiplier
			}

			// Handle role multipliers
			if ('role' in body && (body as Record<string, unknown>).role) {
				const roleMultipliers = (body as Record<string, unknown>).role as Record<string, number>

				// Validate all role multipliers
				for (const [roleId, multiplier] of Object.entries(roleMultipliers)) {
					if (!validateSnowflake(roleId)) {
						const error = new Error(`Invalid role ID: ${roleId}`)
						;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
						throw error
					}
					if (typeof multiplier !== 'number' || multiplier <= 0) {
						const error = new Error(`Role multiplier for ${roleId} must be a positive number`)
						;(error as Error & { code: string }).code = ERROR_CODES.INVALID_MULTIPLIER
						throw error
					}
				}

				// Merge role multipliers
				updatedMultipliers.role = {
					...updatedMultipliers.role,
					...roleMultipliers
				}
			}

			// Handle user multipliers
			if ('user' in body && (body as Record<string, unknown>).user) {
				const userMultipliers = (body as Record<string, unknown>).user as Record<string, number>

				// Validate all user multipliers
				for (const [userId, multiplier] of Object.entries(userMultipliers)) {
					if (!validateSnowflake(userId)) {
						const error = new Error(`Invalid user ID: ${userId}`)
						;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
						throw error
					}
					if (typeof multiplier !== 'number' || multiplier <= 0) {
						const error = new Error(`User multiplier for ${userId} must be a positive number`)
						;(error as Error & { code: string }).code = ERROR_CODES.INVALID_MULTIPLIER
						throw error
					}
				}

				// Merge user multipliers
				updatedMultipliers.user = {
					...updatedMultipliers.user,
					...userMultipliers
				}
			}

			// Update config
			await config.set(guildId, { multipliers: updatedMultipliers })

			return success({
				server: updatedMultipliers.server,
				role: updatedMultipliers.role,
				user: updatedMultipliers.user
			})
		}

		case 'DELETE': {
			// Remove multipliers
			let body: unknown
			try {
				body = await request.json()
			} catch {
				const error = new Error('Invalid JSON in request body')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Validate body is an object
			if (typeof body !== 'object' || body === null || Array.isArray(body)) {
				const error = new Error('Request body must be an object')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Validate body is an object
			if (typeof body !== 'object' || body === null || Array.isArray(body)) {
				const error = new Error('Request body must be an object')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Load current config
			const guildConfig = await config.get(guildId)
			const currentMultipliers = guildConfig.multipliers || {}
			const updatedMultipliers = { ...currentMultipliers }

			// Handle server multiplier removal
			if ('server' in body && (body as Record<string, unknown>).server === true) {
				delete updatedMultipliers.server
			}

			// Handle role multipliers removal
			if ('role' in body && Array.isArray((body as Record<string, unknown>).role)) {
				const roleIdsToRemove = (body as Record<string, unknown>).role as string[]
				// Validate all role IDs
				for (const roleId of roleIdsToRemove) {
					if (!validateSnowflake(roleId)) {
						const error = new Error(`Invalid role ID: ${roleId}`)
						;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
						throw error
					}
				}
				if (updatedMultipliers.role) {
					for (const roleId of roleIdsToRemove) {
						delete updatedMultipliers.role[roleId]
					}
				}
			}

			// Handle user multipliers removal
			if ('user' in body && Array.isArray((body as Record<string, unknown>).user)) {
				const userIdsToRemove = (body as Record<string, unknown>).user as string[]
				// Validate all user IDs
				for (const userId of userIdsToRemove) {
					if (!validateSnowflake(userId)) {
						const error = new Error(`Invalid user ID: ${userId}`)
						;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
						throw error
					}
				}
				if (updatedMultipliers.user) {
					for (const userId of userIdsToRemove) {
						delete updatedMultipliers.user[userId]
					}
				}
			}

			// Update config
			await config.set(guildId, { multipliers: updatedMultipliers })

			return success({
				server: updatedMultipliers.server,
				role: updatedMultipliers.role,
				user: updatedMultipliers.user
			})
		}

		default: {
			const error = new Error('Invalid method')
			;(error as Error & { code: string }).code = ERROR_CODES.METHOD_NOT_ALLOWED
			throw error
		}
	}
})
