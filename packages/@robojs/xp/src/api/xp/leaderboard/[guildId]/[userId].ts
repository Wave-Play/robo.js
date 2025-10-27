import type { RoboRequest } from '@robojs/server'
import { leaderboard, xp } from '@robojs/xp'
import { wrapHandler, success, getGuildFromRequest, validateUserId, validateMethod, ERROR_CODES } from '../../utils.js'

/**
 * User Rank Lookup Endpoint
 *
 * Provides detailed rank information for individual users including percentile calculation.
 *
 * **WARNING: This endpoint is currently unauthenticated.**
 * Recommend checking if the requester has permission to view this data.
 *
 * **Use Cases:**
 * - User profile pages showing rank
 * - Rank cards in web dashboards
 * - Progress tracking for individual users
 *
 * **Performance Notes:**
 * - Top 100 users: O(100) lookup in cache (fast)
 * - Beyond top 100: O(n) scan of all users (slower but acceptable)
 *
 * **Route:**
 * - GET /api/xp/leaderboard/:guildId/:userId - Get user rank and details
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Validate method
	validateMethod(request, ['GET'])

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

	// Get user rank
	const rankResult = await leaderboard.getRank(guildId, userId)
	if (!rankResult) {
		const error = new Error('User has no XP record')
		;(error as Error & { code: string }).code = ERROR_CODES.USER_NOT_FOUND
		throw error
	}

	// Get full user data
	const user = await xp.getUser(guildId, userId)
	if (!user) {
		const error = new Error('User has no XP record')
		;(error as Error & { code: string }).code = ERROR_CODES.USER_NOT_FOUND
		throw error
	}

	// Calculate percentile
	const percentile = ((rankResult.total - rankResult.rank + 1) / rankResult.total) * 100

	// Check if user is in top 100 (cached)
	const isTopHundred = rankResult.rank <= 100

	return success({
		rank: rankResult.rank,
		total: rankResult.total,
		percentile: Math.round(percentile * 100) / 100, // Round to 2 decimal places
		user,
		isTopHundred
	})
})
