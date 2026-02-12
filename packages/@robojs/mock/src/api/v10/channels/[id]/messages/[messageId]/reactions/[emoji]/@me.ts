import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../../utils/id.js'
import { enforcePermissions } from '../../../../../../../../utils/permission-check.js'
import type { MockReaction } from '../../../../../../../../types/index.js'

/**
 * PUT /api/v10/channels/:id/messages/:messageId/reactions/:emoji/@me - Add reaction
 * DELETE /api/v10/channels/:id/messages/:messageId/reactions/:emoji/@me - Remove own reaction
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
	const { id: channelId, messageId, emoji } = request.params as {
		id: string
		messageId: string
		emoji: string
	}

	// Decode emoji (may be URL encoded)
	const decodedEmoji = decodeURIComponent(emoji)

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
		`/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
		channelId
	)
	if (permError) return permError

	// 7. Handle reaction add/remove in message state
	const reactions = message.reactions ?? []

	if (request.method === 'PUT') {
		// Add reaction
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
	} else {
		// Remove reaction (DELETE)
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
	}

	// Update message state
	session.state.updateMessage(messageId, { reactions })

	// Record action
	session.recordAction(
		request.method === 'PUT' ? 'reaction_added' : 'reaction_removed',
		{
			message_id: messageId,
			channel_id: channelId,
			guild_id: channel.guildId,
			emoji: decodedEmoji,
			user_id: session.state.botUser.id
		},
		{
			endpoint: `${request.method} /channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
			method: request.method
		}
	)

	// 8. Return 204 No Content
	return new Response(null, { status: 204 })
}

