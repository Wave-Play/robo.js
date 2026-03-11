import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { getGatewayServer } from '../../../../../core/gateway.js'
import { enforcePermissions } from '../../../../../utils/permission-check.js'

/**
 * POST /api/v10/channels/:id/messages/bulk-delete - Bulk delete messages
 *
 * Request body:
 * {
 *   messages: string[] // Array of message IDs (2-100 messages)
 * }
 *
 * Response: 204 No Content
 */
export const POST = define(
	{
		summary: 'Bulk delete messages',
		tags: ['Messages'],
		params: z.object({
			id: z.string().describe('Channel ID (Snowflake)')
		}),
		body: z.object({
			messages: z.array(z.string()).min(2).max(100)
		}),
		response: {
			204: z.undefined()
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

		// 2. Extract channel ID from params
		const { id: channelId } = (request as unknown as RoboRequest).params as { id: string }

		// 3. Validate channel exists
		const channel = session.state.getChannel(channelId)
		if (!channel) {
			return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// 4. Check permissions
		const permError = enforcePermissions(session, 'POST', `/channels/${channelId}/messages/bulk-delete`, channelId)
		if (permError) return permError

		// 5. Parse request body
		let body: { messages: string[] }

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// 6. Validate messages array
		if (!Array.isArray(body.messages) || body.messages.length < 2 || body.messages.length > 100) {
			return new Response(
				JSON.stringify({ message: 'You must provide 2-100 message IDs to delete', code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// 7. Delete messages and dispatch events
		const deletedIds: string[] = []
		for (const messageId of body.messages) {
			const deleted = session.state.deleteMessage(messageId)
			if (deleted) {
				deletedIds.push(messageId)

				// Dispatch MESSAGE_DELETE event
				const dispatchData: { id: string; channel_id: string; guild_id?: string } = {
					id: messageId,
					channel_id: channelId
				}
				if (channel.guildId) {
					dispatchData.guild_id = channel.guildId
				}
				getGatewayServer().dispatchToSession(session.id, 'MESSAGE_DELETE', dispatchData, channel.guildId)
			}
		}

		// 8. Record action
		session.recordAction(
			'messages_bulk_deleted',
			{
				channel_id: channelId,
				guild_id: channel.guildId,
				message_ids: deletedIds,
				count: deletedIds.length
			},
			{
				endpoint: `POST /channels/${channelId}/messages/bulk-delete`,
				method: 'POST'
			}
		)

		// 9. Return 204 No Content
		return new Response(null, { status: 204 })
	}
)
