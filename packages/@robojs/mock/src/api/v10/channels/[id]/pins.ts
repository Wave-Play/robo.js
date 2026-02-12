import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockMessageToAPIMessage } from '../../../../discord/payloads.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'

/**
 * GET /api/v10/channels/:id/pins - Get pinned messages
 *
 * Response: Array of APIMessage objects
 */
export async function GET(request: RoboRequest) {
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
	const { id: channelId } = request.params as { id: string }

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
