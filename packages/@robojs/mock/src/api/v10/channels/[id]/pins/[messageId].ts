import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
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

const PinMessageParams = z.object({
	id: z.string().describe('Channel ID (Snowflake)'),
	messageId: z.string().describe('Message ID (Snowflake)')
})
function resolvePin(request: RoboRequest) {
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

	const { id: channelId, messageId } = request.params as { id: string; messageId: string }

	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const message = session.state.getMessage(messageId)
	if (!message || message.channelId !== channelId) {
		return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, channel, message, channelId, messageId }
}

export const PUT = define(
	{
		summary: 'Pin message',
		tags: ['Channels'],
		params: PinMessageParams,
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolvePin(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, channel, message, channelId, messageId } = resolved

		// Check permissions
		const permError = enforcePermissions(
			session,
			'PUT',
			`/channels/${channelId}/pins/${messageId}`,
			channelId
		)
		if (permError) return permError

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

		// Return 204 No Content
		return new Response(null, { status: 204 })
	}
)

export const DELETE = define(
	{
		summary: 'Unpin message',
		tags: ['Channels'],
		params: PinMessageParams,
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolvePin(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, channel, message, channelId, messageId } = resolved

		// Check permissions
		const permError = enforcePermissions(
			session,
			'DELETE',
			`/channels/${channelId}/pins/${messageId}`,
			channelId
		)
		if (permError) return permError

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

		// Return 204 No Content
		return new Response(null, { status: 204 })
	}
)
