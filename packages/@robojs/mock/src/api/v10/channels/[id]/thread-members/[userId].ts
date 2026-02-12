import type { RoboRequest } from '@robojs/server'
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

export async function GET(request: RoboRequest) {
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

export async function PUT(request: RoboRequest) {
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

export async function DELETE(request: RoboRequest) {
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
