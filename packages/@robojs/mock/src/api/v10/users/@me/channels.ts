import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockDMChannelToAPIDMChannel } from '../../../../discord/payloads.js'
import { createMockUser } from '../../../../session/state.js'

/**
 * POST /api/v10/users/@me/channels - Create a DM channel
 *
 * This endpoint creates or retrieves an existing DM channel with a recipient user.
 * If a DM channel already exists with the specified recipient, it returns that channel.
 *
 * Request body:
 * {
 *   recipient_id: string  // The ID of the recipient user
 * }
 *
 * Response: APIDMChannel object
 * {
 *   id: string,
 *   type: 1,  // ChannelType.DM
 *   recipients: [APIUser],
 *   last_message_id: null
 * }
 */
export default async (request: RoboRequest) => {
	// 1. Validate POST method
	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 2. Parse Authorization header → get session
	const authHeader = request.headers.get('Authorization') || ''
	const sessionId = parseMockToken(authHeader)

	if (!sessionId) {
		return new Response(JSON.stringify({ error: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const session = sessionManager.get(sessionId)
	if (!session) {
		return new Response(JSON.stringify({ error: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 3. Parse request body for recipient_id
	let body: { recipient_id?: string }

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const { recipient_id } = body

	if (!recipient_id) {
		return new Response(JSON.stringify({ error: 'recipient_id is required', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Ensure recipient user exists in state (create if needed)
	let recipientUser = session.state.getUser(recipient_id)
	if (!recipientUser) {
		// Create a placeholder user for the recipient
		recipientUser = createMockUser({
			id: recipient_id,
			username: `User${recipient_id.slice(-4)}`,
			bot: false
		})
		session.state.addUser(recipientUser)
	}

	// 5. Get or create DM channel
	const isNew = !session.state.getDMChannel(recipient_id)
	const dmChannel = session.state.getOrCreateDMChannel(recipient_id)

	// 6. Record action (use session.recordAction for metadata propagation)
	session.recordAction(
		'dm_channel_opened',
		{
			channel_id: dmChannel.id,
			recipient_id: recipient_id,
			created: isNew
		},
		{
			endpoint: 'POST /users/@me/channels',
			method: 'POST'
		}
	)

	// 7. Return APIDMChannel response
	return mockDMChannelToAPIDMChannel(dmChannel, recipientUser)
}
