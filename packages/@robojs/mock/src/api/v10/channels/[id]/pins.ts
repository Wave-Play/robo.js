import { define } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockMessageToAPIMessage } from '../../../../discord/payloads.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'

/**
 * GET /api/v10/channels/:id/pins - Get pinned messages
 *
 * Response: Array of APIMessage objects
 */

const PinsParams = z.object({
	id: z.string().describe('Channel ID (Snowflake)')
})

const MessageAuthorSchema = z.object({
	id: z.string(),
	username: z.string(),
	avatar: z.string().nullable(),
	discriminator: z.string(),
	public_flags: z.number().int(),
	flags: z.number(),
	bot: z.boolean().optional(),
	system: z.boolean().optional(),
	banner: z.string().nullable().optional(),
	accent_color: z.number().int().nullable().optional(),
	global_name: z.string().nullable(),
	avatar_decoration_data: z.object({}).passthrough().nullable().optional(),
	collectibles: z.object({}).passthrough().nullable().optional(),
	primary_guild: z.object({}).passthrough().nullable()
}).passthrough()

const MessageResponseSchema = z.object({
	id: z.string(),
	type: z.number().int(),
	content: z.string(),
	channel_id: z.string(),
	author: MessageAuthorSchema,
	timestamp: z.string(),
	edited_timestamp: z.string().nullable(),
	tts: z.boolean(),
	mention_everyone: z.boolean(),
	mentions: z.array(z.object({}).passthrough()),
	mention_roles: z.array(z.string()),
	attachments: z.array(z.object({}).passthrough()),
	embeds: z.array(z.object({}).passthrough()),
	pinned: z.boolean(),
	flags: z.number().int().optional(),
	referenced_message: z.object({}).passthrough().nullable().optional(),
	components: z.array(z.object({}).passthrough()).optional(),
	reactions: z.array(z.object({}).passthrough()).optional()
}).passthrough()

export const GET = define(
	{
		summary: 'Get pinned messages',
		tags: ['Channels'],
		params: PinsParams,
		response: {
			200: z.array(MessageResponseSchema).nullable()
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
		const { id: channelId } = request.params

		// 3. Validate channel exists
		const channel = session.state.getChannel(channelId)
		if (!channel) {
			return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// 4. Check permissions
		const permError = enforcePermissions(session, 'GET', `/channels/${channelId}/pins`, channelId)
		if (permError) return permError

		// 5. Get all pinned messages for this channel
		const allMessages = session.state.getMessagesForChannel(channelId)
		const pinnedMessages = allMessages.filter((msg) => msg.pinned)

		// Sort by timestamp descending (newest first)
		pinnedMessages.sort((a, b) => {
			const timeA = new Date(a.timestamp).getTime()
			const timeB = new Date(b.timestamp).getTime()
			return timeB - timeA
		})

		// 6. Convert to API format
		const apiMessages = pinnedMessages.map((msg) => {
			const author = session.state.getUser(msg.authorId) || session.state.botUser
			return mockMessageToAPIMessage(msg, author)
		})

		return apiMessages
	}
)
