import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockThreadToAPIChannel } from '../../../../../discord/payloads.js'
import { getGatewayServer } from '../../../../../core/gateway.js'

/**
 * PUT /api/v10/channels/:id/thread-members/@me - Join a thread
 * DELETE /api/v10/channels/:id/thread-members/@me - Leave a thread
 *
 * Response: 204 No Content on success
 */
function resolveThreadForSelf(request: RoboRequest) {
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

	const { id: threadId } = request.params as { id: string }

	const thread = session.state.getThread(threadId)
	if (!thread) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, thread, threadId }
}

export const PUT = define(
	{
		summary: 'Join thread',
		description: 'Adds the current user to a thread. Returns 204 No Content on success.',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The thread channel ID (Snowflake)')
		}),
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveThreadForSelf(request)
		if (resolved instanceof Response) return resolved
		const { session, thread, threadId } = resolved

		const botUserId = session.state.botUser.id

		// Join thread
		const member = session.state.addThreadMember(threadId, botUserId)

		// Record action
		session.recordAction(
			'thread_member_added',
			{
				thread_id: threadId,
				user_id: botUserId
			},
			{
				endpoint: `PUT /channels/${threadId}/thread-members/@me`,
				method: 'PUT'
			}
		)

		// Dispatch THREAD_UPDATE so Discord.js updates its local cache
		const apiChannel = mockThreadToAPIChannel(thread, member ?? undefined)
		getGatewayServer().dispatchToSession(session.id, 'THREAD_UPDATE', apiChannel, thread.guildId)

		// Return 204 No Content
		return new Response(null, { status: 204 })
	}
)

export const DELETE = define(
	{
		summary: 'Leave thread',
		description: 'Removes the current user from a thread. Returns 204 No Content on success.',
		tags: ['Threads'],
		params: z.object({
			id: z.string().describe('The thread channel ID (Snowflake)')
		}),
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveThreadForSelf(request)
		if (resolved instanceof Response) return resolved
		const { session, thread, threadId } = resolved

		const botUserId = session.state.botUser.id

		// Leave thread
		session.state.removeThreadMember(threadId, botUserId)

		// Record action
		session.recordAction(
			'thread_member_removed',
			{
				thread_id: threadId,
				user_id: botUserId
			},
			{
				endpoint: `DELETE /channels/${threadId}/thread-members/@me`,
				method: 'DELETE'
			}
		)

		// Dispatch THREAD_UPDATE so Discord.js updates its local cache
		// After leaving, the member field should not be included
		const apiChannel = mockThreadToAPIChannel(thread)
		getGatewayServer().dispatchToSession(session.id, 'THREAD_UPDATE', apiChannel, thread.guildId)

		// Return 204 No Content
		return new Response(null, { status: 204 })
	}
)
