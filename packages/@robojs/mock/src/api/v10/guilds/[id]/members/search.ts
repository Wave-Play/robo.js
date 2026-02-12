import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockGuildMemberToAPIMember } from '../../../../../discord/payloads.js'

/**
 * GET /api/v10/guilds/:id/members/search - Search Guild Members
 *
 * Query Parameters:
 * - query: Query string to match username (required)
 * - limit: Max number of members to return (1-1000, default: 1)
 *
 * @see https://discord.com/developers/docs/resources/guild#search-guild-members
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

	// Parse query parameters
	const url = new URL(request.url, 'http://localhost')
	const query = url.searchParams.get('query')
	const limitParam = url.searchParams.get('limit')

	// Validate query is provided
	if (!query) {
		return new Response(JSON.stringify({ message: 'query is required', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate and parse limit (1-1000, default: 1)
	let limit = 1
	if (limitParam) {
		const parsedLimit = parseInt(limitParam, 10)
		if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
			return new Response(JSON.stringify({ message: 'limit must be between 1 and 1000', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
		limit = parsedLimit
	}

	// Get all members for this guild
	const allMembers = session.state.getGuildMembers(guildId)

	// Filter members by username or nickname containing query (case-insensitive)
	const queryLower = query.toLowerCase()
	const matchingMembers = allMembers.filter((member) => {
		const user = session.state.users.get(member.userId)
		if (!user) return false

		// Check username
		if (user.username.toLowerCase().includes(queryLower)) {
			return true
		}

		// Check global_name (display name)
		if (user.globalName && user.globalName.toLowerCase().includes(queryLower)) {
			return true
		}

		// Check nickname
		if (member.nick && member.nick.toLowerCase().includes(queryLower)) {
			return true
		}

		return false
	})

	// Sort by username for consistent results
	matchingMembers.sort((a, b) => {
		const userA = session.state.users.get(a.userId)
		const userB = session.state.users.get(b.userId)
		if (!userA || !userB) return 0
		return userA.username.localeCompare(userB.username)
	})

	// Apply limit
	const limitedMembers = matchingMembers.slice(0, limit)

	// Convert to API format
	const result = limitedMembers.map((member) => {
		const user = session.state.users.get(member.userId)
		if (!user) {
			return {
				user: { id: member.userId, username: 'Unknown', discriminator: '0', global_name: null },
				roles: member.roles,
				joined_at: member.joinedAt,
				deaf: member.deaf,
				mute: member.mute,
				flags: member.flags
			}
		}
		return mockGuildMemberToAPIMember(member, user)
	})

	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}
