import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockUserToAPIUser } from '../../../../discord/payloads.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'

/**
 * GET /api/v10/guilds/:id/bans - List guild bans
 *
 * Query Parameters:
 * - limit: Max number of bans to return (1-1000, default: 1000)
 * - before: Get bans before this user ID (for pagination)
 * - after: Get bans after this user ID (for pagination)
 *
 * @see https://discord.com/developers/docs/resources/guild#get-guild-bans
 */
export async function GET(request: RoboRequest) {
	// 1. Parse Authorization header → get session
	const authHeader = request.headers.get('Authorization') || ''
	const sessionId = parseMockToken(authHeader)

	if (!sessionId) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const session = sessionManager.get(sessionId)
	if (!session) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 2. Extract guild ID from params
	const { id: guildId } = request.params as { id: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 3b. Check permissions (requires BAN_MEMBERS permission)
	const permError = enforcePermissions(session, request.method, `/guilds/${guildId}/bans`, undefined, guildId)
	if (permError) return permError

	// Parse query parameters
	const url = new URL(request.url, 'http://localhost')
	const limitParam = url.searchParams.get('limit')
	const beforeParam = url.searchParams.get('before')
	const afterParam = url.searchParams.get('after')

	// Validate and parse limit (1-1000, default: 1000)
	let limit = 1000
	if (limitParam) {
		const parsedLimit = parseInt(limitParam, 10)
		if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
			return new Response(
				JSON.stringify({ message: 'limit must be between 1 and 1000', code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
		limit = parsedLimit
	}

	// Get all bans for this guild
	let allBans = session.state.getGuildBans(guildId)

	// Sort by user ID for consistent pagination
	allBans.sort((a, b) => {
		if (a.userId < b.userId) return -1
		if (a.userId > b.userId) return 1
		return 0
	})

	// Filter by 'after' if provided (exclusive - get bans after this ID)
	if (afterParam) {
		const afterIndex = allBans.findIndex((b) => b.userId === afterParam)
		if (afterIndex !== -1) {
			allBans = allBans.slice(afterIndex + 1)
		}
	}

	// Filter by 'before' if provided (exclusive - get bans before this ID)
	if (beforeParam) {
		const beforeIndex = allBans.findIndex((b) => b.userId === beforeParam)
		if (beforeIndex !== -1) {
			allBans = allBans.slice(0, beforeIndex)
		}
	}

	// Apply limit
	const paginatedBans = allBans.slice(0, limit)

	// Convert to API format
	const result = paginatedBans.map((ban) => {
		const user = session.state.users.get(ban.userId)
		return {
			reason: ban.reason ?? null,
			user: user
				? mockUserToAPIUser(user)
				: { id: ban.userId, username: 'Unknown', discriminator: '0', global_name: null }
		}
	})

	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}
