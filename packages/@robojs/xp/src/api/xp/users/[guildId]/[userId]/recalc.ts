import type { RoboRequest } from '@robojs/server'
import { xp } from '@robojs/xp'
import {
	wrapHandler,
	success,
	getGuildFromRequest,
	validateUserId,
	validateMethod,
	ERROR_CODES
} from '../../../utils.js'

/**
 * User Level Recalculation Endpoint
 *
 * Recalculates a user's level based on their total XP and reconciles Discord roles
 * to match their corrected level.
 *
 * **WARNING: This endpoint is currently unauthenticated.**
 * In production, implement authentication and restrict access to administrators only.
 *
 * **Use Cases:**
 * - Fixing level inconsistencies after manual database edits
 * - Reconciling roles after config changes
 * - Admin tools for correcting user data
 *
 * **Route:**
 * - POST /api/xp/users/:guildId/:userId/recalc - Recalculate user level
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Validate method
	validateMethod(request, ['POST'])

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

	// Recalculate user level
	const result = await xp.recalc(guildId, userId)

	return success(result)
})
