import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../utils/id.js'
import { enforcePermissions } from '../../../../../../../utils/permission-check.js'

const EmojiParamsSchema = z.object({
	id: z.string(),
	messageId: z.string(),
	emoji: z.string()
})

/**
 * GET /api/v10/channels/:id/messages/:messageId/reactions/:emoji
 * List users that reacted with a specific emoji
 *
 * Response: Array of UserResponse objects
 */
export const GET = define(
	{
		summary: 'List reactions by emoji',
		tags: ['Reactions'],
		params: EmojiParamsSchema,
		query: z.object({
			after: z.string().optional(),
			limit: z.string().optional(),
			type: z.string().optional()
		}),
		response: {
			200: z.array(
				z.object({
					id: z.string(),
					username: z.string(),
					avatar: z.string().nullable(),
					discriminator: z.string(),
					public_flags: z.number(),
					flags: z.number(),
					global_name: z.string().nullable(),
					primary_guild: z.unknown().nullable()
				}).passthrough()
			)
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
		const { id: channelId, messageId, emoji } = (request as unknown as RoboRequest).params as {
			id: string
			messageId: string
			emoji: string
		}

		// Decode emoji (may be URL encoded)
		const decodedEmoji = decodeURIComponent(emoji)

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
			'GET',
			`/channels/${channelId}/messages/${messageId}/reactions/${emoji}`,
			channelId
		)
		if (permError) return permError

		// 6. Find reaction for this emoji and return users who reacted
		const reactions = message.reactions ?? []
		const reaction = reactions.find((r) => r.emoji.name === decodedEmoji)

		if (!reaction) {
			return new Response(JSON.stringify({ message: 'Unknown Emoji', code: 10014 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Parse query parameters
		const url = new URL(request.url)
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100)

		// Return the bot user if they reacted (me=true), otherwise return empty array
		// The mock doesn't track individual user reactions beyond the bot
		const users: Array<Record<string, unknown>> = []
		if (reaction.me) {
			const botUser = session.state.botUser
			users.push({
				id: botUser.id,
				username: botUser.username,
				avatar: botUser.avatar,
				discriminator: botUser.discriminator ?? '0',
				public_flags: botUser.publicFlags ?? 0,
				flags: botUser.flags ?? 0,
				bot: botUser.bot ?? false,
				global_name: botUser.globalName ?? null,
				primary_guild: null
			})
		}

		return users.slice(0, limit)
	}
)

/**
 * DELETE /api/v10/channels/:id/messages/:messageId/reactions/:emoji
 * Remove all reactions for a specific emoji from a message
 *
 * Response: 204 No Content
 */
export const DELETE = define(
	{
		summary: 'Delete all reactions for emoji',
		tags: ['Reactions'],
		params: EmojiParamsSchema,
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
		const { id: channelId, messageId, emoji } = (request as unknown as RoboRequest).params as {
			id: string
			messageId: string
			emoji: string
		}

		// Decode emoji (may be URL encoded)
		const decodedEmoji = decodeURIComponent(emoji)

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

		// 5. Check permissions (requires MANAGE_MESSAGES)
		const permError = enforcePermissions(
			session,
			'DELETE',
			`/channels/${channelId}/messages/${messageId}/reactions/${emoji}`,
			channelId
		)
		if (permError) return permError

		// 6. Remove all reactions for this emoji
		const reactions = message.reactions ?? []
		const updatedReactions = reactions.filter((r) => r.emoji.name !== decodedEmoji)
		session.state.updateMessage(messageId, { reactions: updatedReactions })

		// 7. Record action
		session.recordAction(
			'reaction_removed',
			{
				message_id: messageId,
				channel_id: channelId,
				guild_id: channel.guildId,
				emoji: decodedEmoji,
				user_id: '*' // all users
			},
			{
				endpoint: `DELETE /channels/${channelId}/messages/${messageId}/reactions/${emoji}`,
				method: 'DELETE'
			}
		)

		// 8. Return 204 No Content
		return new Response(null, { status: 204 })
	}
)
