import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'

/**
 * GET /api/v10/channels/:id/thread-members - List thread members
 *
 * Query params:
 * - with_member?: boolean - Include guild member object
 * - after?: snowflake - Get members after this ID
 * - limit?: number - Max members to return (1-100, default 100)
 *
 * Response: Array of ThreadMember objects
 */
export default async (request: RoboRequest) => {
	// 1. Validate GET method
	if (request.method !== 'GET') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 2. Parse Authorization header → get session
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

	// 3. Extract thread ID from params
	const { id: threadId } = request.params as { id: string }

	// 4. Validate thread exists
	const thread = session.state.getThread(threadId)
	if (!thread) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Parse query params
	const url = new URL(request.url)
	const after = url.searchParams.get('after')
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 100)
	const withMember = url.searchParams.get('with_member') === 'true'

	// 6. Get all thread members
	let members = session.state.getThreadMembers(threadId)

	// 7. Apply pagination
	if (after) {
		const afterIndex = members.findIndex((m) => m.user_id === after)
		if (afterIndex >= 0) {
			members = members.slice(afterIndex + 1)
		}
	}

	// 8. Apply limit
	members = members.slice(0, limit)

	// 9. Return members as API format
	return members.map((member) => {
		const result: Record<string, unknown> = {
			id: threadId,
			user_id: member.user_id,
			join_timestamp: member.join_timestamp,
			flags: member.flags
		}

		// Include guild member if with_member=true
		if (withMember && member.user_id && thread.guildId) {
			const user = session.state.getUser(member.user_id)
			if (user) {
				result.member = {
					user: {
						id: user.id,
						username: user.username,
						discriminator: user.discriminator,
						global_name: user.globalName,
						avatar: user.avatar,
						bot: user.bot || undefined
					},
					roles: [],
					joined_at: member.join_timestamp,
					deaf: false,
					mute: false,
					flags: 0
				}
			}
		}

		return result
	})
}
