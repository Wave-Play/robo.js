import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { ChannelType, MessageFlags } from 'discord-api-types/v10'
import { sessionManager } from '../../../../../../core/manager.js'
import { getGatewayServer } from '../../../../../../core/gateway.js'
import { parseMockToken } from '../../../../../../utils/id.js'
import { mockMessageToAPIMessage } from '../../../../../../discord/payloads.js'
import { enforcePermissions } from '../../../../../../utils/permission-check.js'

/**
 * POST /api/v10/channels/:id/messages/:messageId/crosspost - Crosspost a message
 *
 * Used by discord.js for Message.crosspost() in announcement channels.
 * Publishes a message to all servers following the announcement channel.
 */
export const POST = define(
	{
		summary: 'Crosspost message',
		tags: ['Messages'],
		params: z.object({
			id: z.string().describe('Channel ID (Snowflake)'),
			messageId: z.string().describe('Message ID (Snowflake)')
		}),
		response: {
			200: z.object({
				id: z.string(),
				type: z.number(),
				content: z.string(),
				channel_id: z.string(),
				author: z.object({
					id: z.string(),
					username: z.string(),
					avatar: z.string().nullable(),
					discriminator: z.string(),
					public_flags: z.number(),
					flags: z.number(),
					global_name: z.string().nullable(),
					primary_guild: z.unknown().nullable()
				}).passthrough(),
				attachments: z.array(z.object({}).passthrough()),
				embeds: z.array(z.object({}).passthrough()),
				mentions: z.array(z.object({}).passthrough()),
				mention_roles: z.array(z.string()),
				pinned: z.boolean(),
				mention_everyone: z.boolean(),
				tts: z.boolean(),
				timestamp: z.string(),
				edited_timestamp: z.string().nullable(),
				flags: z.number(),
				components: z.array(z.object({}).passthrough())
			}).passthrough()
		}
	},
	async (request) => {
		// Extract session from Authorization header
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

		const { id: channelId, messageId } = (request as unknown as RoboRequest).params as { id: string; messageId: string }

		// Get channel
		const channel = session.state.channels.get(channelId)
		if (!channel) {
			return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Verify channel is an announcement channel
		if (channel.type !== ChannelType.GuildAnnouncement) {
			return new Response(
				JSON.stringify({
					message: 'This operation can only be used on announcement channels.',
					code: 50083
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Check permissions
		const permError = enforcePermissions(
			session,
			'POST',
			`/channels/${channelId}/messages/${messageId}/crosspost`,
			undefined,
			channel.guildId
		)
		if (permError) return permError

		// Get message
		const message = session.state.messages.get(messageId)
		if (!message) {
			return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Verify message is in the correct channel
		if (message.channelId !== channelId) {
			return new Response(JSON.stringify({ message: 'Unknown Message', code: 10008 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Check if already crossposted
		if (message.flags && (message.flags & MessageFlags.Crossposted) !== 0) {
			return new Response(JSON.stringify({ message: 'Message already crossposted', code: 40033 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Add CROSSPOSTED flag
		message.flags = (message.flags || 0) | MessageFlags.Crossposted

		// Get author for API message conversion
		const author = session.state.getUser(message.authorId) || session.state.botUser
		const apiMessage = mockMessageToAPIMessage(message, author)

		// Dispatch MESSAGE_UPDATE to update Discord.js cache with the new flags
		getGatewayServer().dispatchToSession(session.id, 'MESSAGE_UPDATE', apiMessage, channel.guildId)

		// Record action
		session.recordAction(
			'message_crossposted',
			{
				channel_id: channelId,
				message_id: messageId
			},
			{
				endpoint: `POST /channels/${channelId}/messages/${messageId}/crosspost`,
				method: 'POST'
			}
		)

		// Return the updated message
		return new Response(JSON.stringify(apiMessage), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)
