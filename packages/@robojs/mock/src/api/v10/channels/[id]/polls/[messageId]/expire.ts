import { define } from '@robojs/server'
import { z } from 'zod'
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
export const POST = define(
	{
		summary: 'Expire poll',
		description: 'Immediately ends a poll and returns the message with finalized poll results',
		tags: ['Polls'],
		params: z.object({
			id: z.string().describe('The channel ID (Snowflake)'),
			messageId: z.string().describe('The message ID (Snowflake)')
		}),
		response: {
			200: z
				.object({
					id: z.string(),
					type: z.number().int(),
					content: z.string(),
					channel_id: z.string(),
					author: z.object({}).passthrough(),
					timestamp: z.string(),
					edited_timestamp: z.string().nullable(),
					tts: z.boolean(),
					mention_everyone: z.boolean(),
					mentions: z.array(z.object({}).passthrough()),
					mention_roles: z.array(z.string()),
					attachments: z.array(z.object({}).passthrough()),
					embeds: z.array(z.object({}).passthrough()),
					pinned: z.boolean(),
					flags: z.number().int(),
					components: z.array(z.object({}).passthrough()),
					poll: z
						.object({
							question: z.object({}).passthrough(),
							answers: z.array(z.object({}).passthrough()),
							expiry: z.string(),
							allow_multiselect: z.boolean(),
							layout_type: z.number().int(),
							results: z.object({}).passthrough()
						})
						.passthrough()
						.optional()
				})
				.passthrough()
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

	// 2. Extract params
	const { id: channelId, messageId } = request.params as {
		id: string
		messageId: string
	}

	// 3. Validate channel exists
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate message exists and has poll
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

	// 5. Check if poll is already finalized
	if (message.poll.results?.is_finalized) {
		return new Response(JSON.stringify({ message: 'Poll already ended', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 6. Expire the poll
	session.state.expirePoll(messageId)

	// 7. Get author for response
	const author = session.state.users.get(message.authorId) ?? session.state.botUser

	// 8. Dispatch MESSAGE_UPDATE event via Gateway
	const apiMessage = mockMessageToAPIMessage(message, author)
	const dispatchData: Record<string, unknown> = { ...apiMessage }
	if (message.guildId) {
		dispatchData.guild_id = message.guildId
	}
	getGatewayServer().dispatchToSession(session.id, 'MESSAGE_UPDATE', dispatchData, channel.guildId)

	// 9. Record action (use session.recordAction for metadata propagation)
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

	// 10. Return updated message with finalized poll
	return mockMessageToAPIMessage(message, author)
})
