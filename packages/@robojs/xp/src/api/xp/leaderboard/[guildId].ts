import type { RoboRequest } from '@robojs/server'
import { leaderboard } from '@robojs/xp'
import { wrapHandler, success, getGuildFromRequest, validateMethod, ERROR_CODES } from '../utils.js'

/**
 * Leaderboard Retrieval Endpoint
 *
 * Provides paginated access to guild leaderboards.
 *
 * **WARNING: This endpoint is currently unauthenticated.**
 * Note that the leaderboard.public config flag is NOT enforced by this endpoint.
 * API consumers must check the config and implement access control based on
 * config.leaderboard.public setting.
 *
 * **Performance Notes:**
 * - First 10 pages (top 100 users) are served from cache (<10ms)
 * - Pages beyond cache trigger full dataset query (slower but acceptable)
 *
 * **Query Parameters:**
 * - page (optional): Page number (1-indexed, default: 1)
 * - limit (optional): Entries per page (default: 10, max: 100)
 * - offset (optional): Direct offset (alternative to page, 0-indexed)
 *
 * **Route:**
 * - GET /api/xp/leaderboard/:guildId - Get paginated leaderboard
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Validate method
	validateMethod(request, ['GET'])

	const { guildId } = request.params

	// Validate guild
	await getGuildFromRequest(request)

	// Parse query parameters
	const url = new URL(request.url)
	const pageParam = url.searchParams.get('page')
	const limitParam = url.searchParams.get('limit')
	const offsetParam = url.searchParams.get('offset')

	// Parse pagination parameters
	let limit = limitParam ? parseInt(limitParam, 10) : 10
	let offset = offsetParam ? parseInt(offsetParam, 10) : 0

	// Validate and constrain limit
	if (isNaN(limit) || limit <= 0) {
		limit = 10
	}
	if (limit > 100) {
		const error = new Error('Limit cannot exceed 100 entries per page')
		;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
		throw error
	}

	// Calculate offset from page if not directly provided
	if (!offsetParam && pageParam) {
		const page = parseInt(pageParam, 10)
		if (!isNaN(page) && page > 0) {
			offset = (page - 1) * limit
		}
	}

	// Validate offset
	if (isNaN(offset) || offset < 0) {
		offset = 0
	}

	// Get leaderboard data
	const result = await leaderboard.get(guildId, offset, limit)

	// Calculate pagination metadata
	const totalPages = Math.ceil(result.total / limit)
	const currentPage = Math.floor(offset / limit) + 1
	const hasNext = offset + limit < result.total
	const hasPrev = offset > 0

	// Check if results are from cache (top 100)
	const cached = offset < 100

	return success({
		entries: result.entries,
		pagination: {
			total: result.total,
			totalPages,
			currentPage,
			limit,
			offset,
			hasNext,
			hasPrev
		},
		cached
	})
})
