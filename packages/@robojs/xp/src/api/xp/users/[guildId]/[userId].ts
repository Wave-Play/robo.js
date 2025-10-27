import type { RoboRequest } from '@robojs/server'
import { xp, math } from '@robojs/xp'
import {
	wrapHandler,
	success,
	getGuildFromRequest,
	validateUserId,
	validateAmount,
	validateMethod,
	ERROR_CODES
} from '../../utils.js'

/**
 * User XP Data Endpoint
 *
 * Handles individual user XP data retrieval and manipulation.
 *
 * **WARNING: This endpoint is currently unauthenticated.**
 * In production, implement authentication and verify that the requester
 * has appropriate permissions (e.g., Manage Guild) before allowing modifications.
 *
 * **Routes:**
 * - GET /api/xp/users/:guildId/:userId - Get user XP data and level progress
 * - POST /api/xp/users/:guildId/:userId - Add XP to user
 * - PUT /api/xp/users/:guildId/:userId - Set user XP to specific value
 * - DELETE /api/xp/users/:guildId/:userId - Remove XP from user
 */
export default wrapHandler(async (request: RoboRequest) => {
	const { guildId, userId } = request.params

	// Validate guild
	await getGuildFromRequest(request)

	// Validate user ID
	const userIdValidation = validateUserId(userId)
	if (!userIdValidation.valid) {
		const error = new Error(userIdValidation.error)
		;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
		throw error
	}

	// Validate method
	validateMethod(request, ['GET', 'POST', 'PUT', 'DELETE'])

	switch (request.method) {
		case 'GET': {
			// Get user XP data
			const user = await xp.getUser(guildId, userId)
			if (!user) {
				const error = new Error('User has no XP record')
				;(error as Error & { code: string }).code = ERROR_CODES.USER_NOT_FOUND
				throw error
			}

			// Calculate level progress
			const progress = math.computeLevelFromTotalXp(user.xp)
			const percentage = progress.toNext > 0 ? (progress.inLevel / progress.toNext) * 100 : 100

			return success({
				user,
				progress,
				percentage
			})
		}

		case 'POST': {
			// Add XP to user
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

			const bodyObj = body as Record<string, unknown>
			const { amount, reason } = bodyObj

			const amountValidation = validateAmount(amount)
			if (!amountValidation.valid) {
				const error = new Error(amountValidation.error)
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_AMOUNT
				throw error
			}

			const result = await xp.add(guildId, userId, amount as number, { reason: reason as string | undefined })
			return success(result)
		}

		case 'PUT': {
			// Set user XP
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

			const bodyObj = body as Record<string, unknown>
			const { xp: newXp, reason } = bodyObj

			if (typeof newXp !== 'number' || isNaN(newXp) || newXp < 0) {
				const error = new Error('XP must be a non-negative number')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_AMOUNT
				throw error
			}

			const result = await xp.set(guildId, userId, newXp as number, { reason: reason as string | undefined })
			return success(result)
		}

		case 'DELETE': {
			// Remove XP from user
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

			const bodyObj = body as Record<string, unknown>
			const { amount, reason } = bodyObj

			const amountValidation = validateAmount(amount)
			if (!amountValidation.valid) {
				const error = new Error(amountValidation.error)
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_AMOUNT
				throw error
			}

			const result = await xp.remove(guildId, userId, amount as number, { reason: reason as string | undefined })
			return success(result)
		}

		default: {
			const error = new Error('Invalid method')
			;(error as Error & { code: string }).code = ERROR_CODES.METHOD_NOT_ALLOWED
			throw error
		}
	}
})
