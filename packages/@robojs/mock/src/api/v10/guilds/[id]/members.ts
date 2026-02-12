import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockGuildMemberToAPIMember } from '../../../../discord/payloads.js'

/**
 * GET /api/v10/guilds/:id/members - List guild members
 *
 * Query Parameters:
 * - limit: Max number of members to return (1-1000, default: 1)
 * - after: Get members after this user ID (for pagination)
 *
 * @see https://discord.com/developers/docs/resources/guild#list-guild-members
 */
export default async (request: RoboRequest) => {
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

	// Handle GET - List guild members
	if (request.method === 'GET') {
		// Parse query parameters
		const url = new URL(request.url, 'http://localhost')
		const limitParam = url.searchParams.get('limit')
		const afterParam = url.searchParams.get('after')

		// Validate and parse limit (1-1000, default: 1)
		let limit = 1
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

		// Get all members for this guild
		const allMembers = session.state.getGuildMembers(guildId)

		// Sort by user ID for consistent pagination
		allMembers.sort((a, b) => {
			if (a.userId < b.userId) return -1
			if (a.userId > b.userId) return 1
			return 0
		})

		// Filter by 'after' if provided
		let filteredMembers = allMembers
		if (afterParam) {
			const afterIndex = allMembers.findIndex((m) => m.userId === afterParam)
			if (afterIndex !== -1) {
				filteredMembers = allMembers.slice(afterIndex + 1)
			}
		}

		// Apply limit
		const paginatedMembers = filteredMembers.slice(0, limit)

		// Convert to API format
		const result = paginatedMembers.map((member) => {
			const user = session.state.users.get(member.userId)
			if (!user) {
				// Create a minimal user object if not found
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

	// Method not allowed
	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}
