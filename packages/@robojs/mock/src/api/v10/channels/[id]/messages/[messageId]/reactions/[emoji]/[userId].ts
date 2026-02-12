import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../../utils/id.js'
import { enforcePermissions } from '../../../../../../../../utils/permission-check.js'

/**
 * DELETE /api/v10/channels/:id/messages/:messageId/reactions/:emoji/:userId - Remove a user's reaction
 *
 * Response: 204 No Content
 */
export default async (request: RoboRequest) => {
	// 1. Validate DELETE method
	if (request.method !== 'DELETE') {
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
	const { id: channelId, messageId, emoji, userId } = request.params as {
		id: string
		messageId: string
		emoji: string
		userId: string
	}

	// Decode emoji (may be URL encoded)
	const decodedEmoji = decodeURIComponent(emoji)

	// Determine if this is a self-removal or removing another user's reaction
	const targetUserId = userId === '@me' ? session.state.botUser.id : userId

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
		'DELETE',
		`/channels/${channelId}/messages/${messageId}/reactions/${emoji}/${userId}`,
		channelId
	)
	if (permError) return permError

	// 7. Remove reaction from message state
	const reactions = message.reactions ?? []
	const reactionIndex = reactions.findIndex((r) => r.emoji.name === decodedEmoji)

	if (reactionIndex !== -1) {
		const reaction = reactions[reactionIndex]
		// Check if bot's reaction
		if (targetUserId === session.state.botUser.id && reaction.me) {
			reaction.me = false
			reaction.count--
			reaction.count_details.normal--
		} else if (targetUserId !== session.state.botUser.id) {
			// Removing another user's reaction - just decrement count
			reaction.count--
			reaction.count_details.normal--
		}

		// Remove the reaction entirely if count is 0
		if (reaction.count <= 0) {
			reactions.splice(reactionIndex, 1)
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
			user_id: targetUserId
		},
		{
			endpoint: `DELETE /channels/${channelId}/messages/${messageId}/reactions/${emoji}/${userId}`,
			method: 'DELETE'
		}
	)

	// 8. Return 204 No Content
	return new Response(null, { status: 204 })
}
