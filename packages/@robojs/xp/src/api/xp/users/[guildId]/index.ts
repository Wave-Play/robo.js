import type { RoboRequest } from '@robojs/server'
import { getAllUsers } from '../../../../store/index.js'
import { wrapHandler, success, getGuildFromRequest, validateMethod } from '../../utils.js'

/**
 * Guild Users List Endpoint
 *
 * Lists all users with XP in a guild with pagination support
 *
 * **Query Parameters:**
 * - page (optional): Page number (1-indexed, default: 1)
 * - limit (optional): Users per page (default: 50, max: 100)
 * - offset (optional): Direct offset (alternative to page, 0-indexed)
 *
 * **Route:**
 * - GET /api/xp/users/:guildId - List all users in guild
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Validate method
	validateMethod(request, ['GET'])

	const { guildId } = request.params

	// Validate guild exists
	await getGuildFromRequest(request)

	// Parse query parameters
	const url = new URL(request.url)
	const pageParam = url.searchParams.get('page')
	const limitParam = url.searchParams.get('limit')
	const offsetParam = url.searchParams.get('offset')

	// Parse pagination parameters
	let limit = limitParam ? parseInt(limitParam, 10) : 50
	let offset = offsetParam ? parseInt(offsetParam, 10) : 0

	// Validate and constrain limit
	if (isNaN(limit) || limit <= 0) {
		limit = 50
	}
	if (limit > 100) {
		limit = 100
	}

	// If page param is provided, calculate offset from page
	if (pageParam) {
		const page = parseInt(pageParam, 10)
		if (!isNaN(page) && page > 0) {
			offset = (page - 1) * limit
		}
	}

	// Validate offset
	if (isNaN(offset) || offset < 0) {
		offset = 0
	}

	// Get all users
	const usersMap = await getAllUsers(guildId)
	const allUsers = Array.from(usersMap.entries()).map(([userId, data]) => ({
		userId,
		...data
	}))

	// Sort by XP descending
	allUsers.sort((a, b) => b.xp - a.xp)

	// Apply pagination
	const paginatedUsers = allUsers.slice(offset, offset + limit)
	const total = allUsers.length

	return success({
		users: paginatedUsers,
		pagination: {
			offset,
			limit,
			total,
			hasMore: offset + limit < total
		}
	})
})
