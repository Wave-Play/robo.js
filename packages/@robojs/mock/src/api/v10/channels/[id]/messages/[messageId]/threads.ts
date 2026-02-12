import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../utils/id.js'
import { mockThreadToAPIChannel } from '../../../../../../discord/payloads.js'

/**
 * POST /api/v10/channels/:id/messages/:messageId/threads - Create a thread from a message
 *
 * Request body:
 * {
 *   name: string,                          // Thread name (1-100 chars)
 *   auto_archive_duration?: 60|1440|4320|10080,  // Minutes until auto-archive
 *   rate_limit_per_user?: number           // Slowmode in seconds
 * }
 *
 * Response: APIChannel (thread) object
 */
export async function POST(request: RoboRequest) {
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

	// 2. Extract params
	const { id: channelId, messageId } = request.params as { id: string; messageId: string }

	// 3. Validate parent channel exists
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate message exists
	const message = session.state.getMessage(messageId)
	if (!message) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Validate message is in the specified channel
	if (message.channelId !== channelId) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 6. Validate channel type (must be text or announcement)
	if (channel.type !== 0 && channel.type !== 5) {
		return new Response(
			JSON.stringify({
				error: 'Cannot create thread in this channel type',
				code: 50024
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 7. Parse thread creation payload
	let body: {
		name: string
		auto_archive_duration?: 60 | 1440 | 4320 | 10080
		rate_limit_per_user?: number
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 8. Validate required fields
	if (!body.name || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) {
		return new Response(
			JSON.stringify({
				error: 'Thread name must be between 1 and 100 characters',
				code: 50035
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 9. Determine thread type (public thread or announcement thread based on parent)
	const threadType = channel.type === 5 ? 10 : 11

	// 10. Create thread in state
	const thread = session.state.createThread({
		name: body.name,
		type: threadType,
		parentId: channelId,
		ownerId: session.state.botUser.id,
		autoArchiveDuration: body.auto_archive_duration,
		rateLimitPerUser: body.rate_limit_per_user
	})

	// 11. Record as 'thread_created' action
	session.recordAction(
		'thread_created',
		{
			thread_id: thread.id,
			parent_id: channelId,
			message_id: messageId,
			name: thread.name,
			type: thread.type
		},
		{
			endpoint: `POST /channels/${channelId}/messages/${messageId}/threads`,
			method: 'POST'
		}
	)

	// 12. Return thread as APIChannel (include member since creator is automatically added)
	const botMember = session.state.getThreadMember(thread.id, session.state.botUser.id)
	return mockThreadToAPIChannel(thread, botMember ?? undefined)
}
