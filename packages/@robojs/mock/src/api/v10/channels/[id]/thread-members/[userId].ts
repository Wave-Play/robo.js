import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'

/**
 * GET /api/v10/channels/:id/thread-members/:userId - Get a thread member
 * PUT /api/v10/channels/:id/thread-members/:userId - Add a user to a thread
 * DELETE /api/v10/channels/:id/thread-members/:userId - Remove a user from a thread
 *
 * Query params (GET only):
 * - with_member?: boolean - Include guild member object
 *
 * Response:
 * - GET: ThreadMember object
 * - PUT/DELETE: 204 No Content on success
 */
function resolveThreadMember(request: RoboRequest) {
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

	const { id: threadId, userId } = request.params as { id: string; userId: string }

	const thread = session.state.getThread(threadId)
	if (!thread) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, thread, threadId, userId }
}

export const GET = define(
	{
		summary: 'Get thread member',
		description: 'Returns a thread member object for the specified user if they are a member of the thread',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The thread channel ID (Snowflake)'),
			userId: z.string().describe('The user ID (Snowflake)')
		}),
		query: z.object({
			with_member: z.string().optional().describe('Whether to include guild member data (boolean as string)')
		}),
		response: {
			200: z
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
		}
	},
	async (request) => {
		const resolved = resolveThreadMember(request)
		if (resolved instanceof Response) return resolved
		const { session, thread, threadId, userId } = resolved

		const member = session.state.getThreadMember(threadId, userId)
		if (!member) {
			return new Response(JSON.stringify({ message: 'Unknown Member', code: 10007 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Parse query params for with_member
		const url = new URL(request.url)
		const withMember = url.searchParams.get('with_member') === 'true'

		const result: Record<string, unknown> = {
			id: threadId,
			user_id: userId,
			join_timestamp: member.join_timestamp,
			flags: member.flags
		}

		// Include guild member if with_member=true
		if (withMember && thread.guildId) {
			const user = session.state.getUser(userId)
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
	}
)

export const PUT = define(
	{
		summary: 'Add thread member',
		description: 'Adds another member to a thread. Returns 204 No Content on success.',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The thread channel ID (Snowflake)'),
			userId: z.string().describe('The user ID (Snowflake)')
		}),
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveThreadMember(request)
		if (resolved instanceof Response) return resolved
		const { session, threadId, userId } = resolved

		session.state.addThreadMember(threadId, userId)

		// Record action
		session.recordAction(
			'thread_member_added',
			{
				thread_id: threadId,
				user_id: userId
			},
			{
				endpoint: `PUT /channels/${threadId}/thread-members/${userId}`,
				method: 'PUT'
			}
		)

		return new Response(null, { status: 204 })
	}
)

export const DELETE = define(
	{
		summary: 'Remove thread member',
		description: 'Removes another member from a thread. Returns 204 No Content on success.',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The thread channel ID (Snowflake)'),
			userId: z.string().describe('The user ID (Snowflake)')
		}),
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveThreadMember(request)
		if (resolved instanceof Response) return resolved
		const { session, threadId, userId } = resolved

		session.state.removeThreadMember(threadId, userId)

		// Record action
		session.recordAction(
			'thread_member_removed',
			{
				thread_id: threadId,
				user_id: userId
			},
			{
				endpoint: `DELETE /channels/${threadId}/thread-members/${userId}`,
				method: 'DELETE'
			}
		)

		return new Response(null, { status: 204 })
	}
)
