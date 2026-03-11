import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
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
export const GET = define(
	{
		summary: 'List thread members',
		description: 'Returns array of thread members for a thread channel',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The thread channel ID (Snowflake)')
		}),
		query: z.object({
			with_member: z.string().optional().describe('Whether to include guild member data (boolean as string)'),
			limit: z.string().optional().describe('Max number of members to return (1-100)'),
			after: z.string().optional().describe('Get members after this user ID (Snowflake)')
		}),
		response: {
			200: z.array(
				z
					.object({
						id: z.string(),
						user_id: z.string(),
						join_timestamp: z.string(),
						flags: z.number().int(),
						member: z
							.object({
								avatar: z.string().nullable(),
								avatar_decoration_data: z.object({}).passthrough().nullable().optional(),
								banner: z.string().nullable(),
								communication_disabled_until: z.string().nullable(),
								flags: z.number().int(),
								joined_at: z.string(),
								nick: z.string().nullable(),
								pending: z.boolean(),
								premium_since: z.string().nullable(),
								roles: z.array(z.string()),
								collectibles: z.object({}).passthrough().nullable().optional(),
								user: z.object({}).passthrough(),
								mute: z.boolean(),
								deaf: z.boolean()
							})
							.passthrough()
							.optional()
					})
					.passthrough()
			)
		}
	},
	async (request) => {
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

	// 2. Extract thread ID from params
	const { id: threadId } = request.params as { id: string }

	// 3. Validate thread exists
	const thread = session.state.getThread(threadId)
	if (!thread) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Parse query params
	const url = new URL(request.url)
	const after = url.searchParams.get('after')
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 100)
	const withMember = url.searchParams.get('with_member') === 'true'

	// 5. Get all thread members
	let members = session.state.getThreadMembers(threadId)

	// 6. Apply pagination
	if (after) {
		const afterIndex = members.findIndex((m) => m.user_id === after)
		if (afterIndex >= 0) {
			members = members.slice(afterIndex + 1)
		}
	}

	// 7. Apply limit
	members = members.slice(0, limit)

	// 8. Return members as API format
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
})
