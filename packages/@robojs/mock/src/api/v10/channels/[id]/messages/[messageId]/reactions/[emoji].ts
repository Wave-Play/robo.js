import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../utils/id.js'
import { enforcePermissions } from '../../../../../../../utils/permission-check.js'

/**
 * DELETE /api/v10/channels/:id/messages/:messageId/reactions/:emoji
 * Remove all reactions for a specific emoji from a message
 *
 * Response: 204 No Content
 */
export async function DELETE(request: RoboRequest) {
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
	const { id: channelId, messageId, emoji } = request.params as {
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
