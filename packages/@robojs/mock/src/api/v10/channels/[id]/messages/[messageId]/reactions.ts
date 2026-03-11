import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../utils/id.js'
import { enforcePermissions } from '../../../../../../utils/permission-check.js'

/**
 * DELETE /api/v10/channels/:id/messages/:messageId/reactions - Remove all reactions
 *
 * Response: 204 No Content
 */
export const DELETE = define(
	{
		summary: 'Delete all reactions',
		tags: ['Reactions'],
		params: z.object({
			id: z.string().describe('Channel ID (Snowflake)'),
			messageId: z.string().describe('Message ID (Snowflake)')
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

		// 2. Extract IDs from params
		const { id: channelId, messageId } = (request as unknown as RoboRequest).params as { id: string; messageId: string }

		// 3. Validate channel exists
		const channel = session.state.getChannel(channelId)
		if (!channel) {
			return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// 4. Validate message exists
		const message = session.state.getMessage(messageId)
		if (!message || message.channelId !== channelId) {
			return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// 5. Check permissions
		const permError = enforcePermissions(
			session,
			'DELETE',
			`/channels/${channelId}/messages/${messageId}/reactions`,
			channelId
		)
		if (permError) return permError

		// 6. Remove all reactions from message state
		session.state.updateMessage(messageId, { reactions: [] })

		// Record action (use reaction_removed as the closest action type)
		session.recordAction(
			'reaction_removed',
			{
				message_id: messageId,
				channel_id: channelId,
				guild_id: channel.guildId,
				emoji: '*', // all reactions
				user_id: session.state.botUser.id
			},
			{
				endpoint: `DELETE /channels/${channelId}/messages/${messageId}/reactions`,
				method: 'DELETE'
			}
		)

		// 7. Return 204 No Content
		return new Response(null, { status: 204 })
	}
)
