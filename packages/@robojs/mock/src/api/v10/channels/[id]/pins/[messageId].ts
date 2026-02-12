import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockMessageToAPIMessage } from '../../../../../discord/payloads.js'
import { getGatewayServer } from '../../../../../core/gateway.js'
import { enforcePermissions } from '../../../../../utils/permission-check.js'

/**
 * PUT /api/v10/channels/:id/pins/:messageId - Pin a message
 * DELETE /api/v10/channels/:id/pins/:messageId - Unpin a message
 *
 * Response: 204 No Content
 */
export default async (request: RoboRequest) => {
	// 1. Validate method
	if (request.method !== 'PUT' && request.method !== 'DELETE') {
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

	// 3. Extract IDs from params
	const { id: channelId, messageId } = request.params as { id: string; messageId: string }

	// 4. Validate channel exists
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Validate message exists
	const message = session.state.getMessage(messageId)
	if (!message || message.channelId !== channelId) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 6. Check permissions
	const permError = enforcePermissions(
		session,
		request.method,
		`/channels/${channelId}/pins/${messageId}`,
		channelId
	)
	if (permError) return permError

	// 7. Update pin status
	if (request.method === 'PUT') {
		// Pin the message
		const updated = session.state.updateMessage(messageId, { pinned: true })
		if (!updated) {
			return new Response(JSON.stringify({ message: 'Failed to pin message' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'message_pinned',
			{
				message_id: messageId,
				channel_id: channelId,
				guild_id: channel.guildId
			},
			{
				endpoint: `PUT /channels/${channelId}/pins/${messageId}`,
				method: 'PUT'
			}
		)

		// Dispatch MESSAGE_UPDATE event
		const author = session.state.getUser(message.authorId) || session.state.botUser
		const apiMessage = mockMessageToAPIMessage(updated, author)
		const dispatchData: Record<string, unknown> = { ...apiMessage }
		if (updated.guildId) {
			dispatchData.guild_id = updated.guildId
		}
		getGatewayServer().dispatchToSession(session.id, 'MESSAGE_UPDATE', dispatchData, channel.guildId)
	} else {
		// Unpin the message
		const updated = session.state.updateMessage(messageId, { pinned: false })
		if (!updated) {
			return new Response(JSON.stringify({ message: 'Failed to unpin message' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'message_unpinned',
			{
				message_id: messageId,
				channel_id: channelId,
				guild_id: channel.guildId
			},
			{
				endpoint: `DELETE /channels/${channelId}/pins/${messageId}`,
				method: 'DELETE'
			}
		)

		// Dispatch MESSAGE_UPDATE event
		const author = session.state.getUser(message.authorId) || session.state.botUser
		const apiMessage = mockMessageToAPIMessage(updated, author)
		const dispatchData: Record<string, unknown> = { ...apiMessage }
		if (updated.guildId) {
			dispatchData.guild_id = updated.guildId
		}
		getGatewayServer().dispatchToSession(session.id, 'MESSAGE_UPDATE', dispatchData, channel.guildId)
	}

	// 8. Return 204 No Content
	return new Response(null, { status: 204 })
}

