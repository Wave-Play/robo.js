import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../core/manager.js'
import { getGatewayServer } from '../../../../../../core/gateway.js'
import { parseMockToken } from '../../../../../../utils/id.js'
import { mockMessageToAPIMessage } from '../../../../../../discord/payloads.js'

/**
 * POST /api/v10/channels/:id/polls/:messageId/expire
 *
 * Immediately end a poll and finalize results
 * Returns: APIMessage with finalized poll results
 */
export default async (request: RoboRequest) => {
	// 1. Validate POST method
	if (request.method !== 'POST') {
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

	// 3. Extract params
	const { id: channelId, messageId } = request.params as {
		id: string
		messageId: string
	}

	// 4. Validate channel exists
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Validate message exists and has poll
	const message = session.state.getMessage(messageId)
	if (!message) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (message.channelId !== channelId) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (!message.poll) {
		return new Response(JSON.stringify({ message: 'Message has no poll', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 6. Check if poll is already finalized
	if (message.poll.results?.is_finalized) {
		return new Response(JSON.stringify({ message: 'Poll already ended', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 7. Expire the poll
	session.state.expirePoll(messageId)

	// 8. Get author for response
	const author = session.state.users.get(message.authorId) ?? session.state.botUser

	// 9. Dispatch MESSAGE_UPDATE event via Gateway
	const apiMessage = mockMessageToAPIMessage(message, author)
	const dispatchData: Record<string, unknown> = { ...apiMessage }
	if (message.guildId) {
		dispatchData.guild_id = message.guildId
	}
	getGatewayServer().dispatchToSession(session.id, 'MESSAGE_UPDATE', dispatchData, channel.guildId)

	// 10. Record action (use session.recordAction for metadata propagation)
	session.recordAction(
		'poll_expired',
		{
			message_id: messageId,
			channel_id: channelId,
			guild_id: channel.guildId,
			results: message.poll.results
		},
		{
			endpoint: `POST /channels/${channelId}/polls/${messageId}/expire`,
			method: 'POST'
		}
	)

	// 11. Return updated message with finalized poll
	return mockMessageToAPIMessage(message, author)
}
