import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockWebhookToAPIWebhook } from '../../../../discord/payloads.js'

/**
 * GET /api/v10/guilds/:id/webhooks - List all webhooks for a guild
 *
 * @see https://discord.com/developers/docs/resources/webhook#get-guild-webhooks
 */
export default async (request: RoboRequest) => {
	// Only GET is supported
	if (request.method !== 'GET') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

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

	// 2. Extract guild ID from params
	const { id: guildId } = request.params as { id: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Get all webhooks for this guild
	const webhooks = session.state.getWebhooksForGuild(guildId)

	// Include token for webhooks created by the requesting user (bot)
	return webhooks.map((w) => mockWebhookToAPIWebhook(w, w.user?.id === session.state.botUser.id))
}
