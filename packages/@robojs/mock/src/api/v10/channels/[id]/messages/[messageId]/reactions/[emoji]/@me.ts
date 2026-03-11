import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../../utils/id.js'
import { enforcePermissions } from '../../../../../../../../utils/permission-check.js'
import type { MockReaction } from '../../../../../../../../types/index.js'

const ReactionMeParamsSchema = z.object({
	id: z.string(),
	messageId: z.string(),
	emoji: z.string()
})

/**
 * PUT /api/v10/channels/:id/messages/:messageId/reactions/:emoji/@me - Add reaction
 * DELETE /api/v10/channels/:id/messages/:messageId/reactions/:emoji/@me - Remove own reaction
 *
 * Response: 204 No Content
 */
function resolveReaction(request: RoboRequest) {
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

	const { id: channelId, messageId, emoji } = request.params as {
		id: string
		messageId: string
		emoji: string
	}

	// Decode emoji (may be URL encoded)
	const decodedEmoji = decodeURIComponent(emoji)

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

	return { session, channel, message, channelId, messageId, emoji, decodedEmoji }
}

export const PUT = define(
	{
		summary: 'Add own reaction',
		tags: ['Reactions'],
		params: ReactionMeParamsSchema,
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveReaction(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, channel, message, channelId, messageId, emoji, decodedEmoji } = resolved

		// Check permissions
		const permError = enforcePermissions(
			session,
			'PUT',
			`/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
			channelId
		)
		if (permError) return permError

		// Add reaction
		const reactions = message.reactions ?? []
		const existingReaction = reactions.find((r) => r.emoji.name === decodedEmoji)
		if (existingReaction) {
			// Increment count and set me=true
			existingReaction.count++
			existingReaction.count_details.normal++
			existingReaction.me = true
		} else {
			// Create new reaction
			const newReaction: MockReaction = {
				count: 1,
				count_details: { burst: 0, normal: 1 },
				me: true,
				me_burst: false,
				emoji: { id: null, name: decodedEmoji },
				burst_colors: []
			}
			reactions.push(newReaction)
		}

		// Update message state
		session.state.updateMessage(messageId, { reactions })

		// Record action
		session.recordAction(
			'reaction_added',
			{
				message_id: messageId,
				channel_id: channelId,
				guild_id: channel.guildId,
				emoji: decodedEmoji,
				user_id: session.state.botUser.id
			},
			{
				endpoint: `PUT /channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
				method: 'PUT'
			}
		)

		// Return 204 No Content
		return new Response(null, { status: 204 })
	}
)

export const DELETE = define(
	{
		summary: 'Remove own reaction',
		tags: ['Reactions'],
		params: ReactionMeParamsSchema,
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveReaction(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, channel, message, channelId, messageId, emoji, decodedEmoji } = resolved

		// Check permissions
		const permError = enforcePermissions(
			session,
			'DELETE',
			`/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
			channelId
		)
		if (permError) return permError

		// Remove reaction (DELETE)
		const reactions = message.reactions ?? []
		const reactionIndex = reactions.findIndex((r) => r.emoji.name === decodedEmoji)
		if (reactionIndex !== -1) {
			const reaction = reactions[reactionIndex]
			if (reaction.me) {
				reaction.me = false
				reaction.count--
				reaction.count_details.normal--
				// Remove the reaction entirely if count is 0
				if (reaction.count <= 0) {
					reactions.splice(reactionIndex, 1)
				}
			}
		}

		// Update message state
		session.state.updateMessage(messageId, { reactions })

		// Record action
		session.recordAction(
			'reaction_removed',
			{
				message_id: messageId,
				channel_id: channelId,
				guild_id: channel.guildId,
				emoji: decodedEmoji,
				user_id: session.state.botUser.id
			},
			{
				endpoint: `DELETE /channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
				method: 'DELETE'
			}
		)

		// Return 204 No Content
		return new Response(null, { status: 204 })
	}
)
