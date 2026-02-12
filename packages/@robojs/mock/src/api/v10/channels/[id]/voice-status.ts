import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { getGatewayServer } from '../../../../core/gateway.js'
import { mockChannelToAPIChannel } from '../../../../discord/payloads.js'

/**
 * PUT /api/v10/channels/:id/voice-status - Set voice channel status
 *
 * @see https://discord.com/developers/docs/resources/channel#modify-channel-voice-status
 */
export default async (request: RoboRequest) => {
	// 1. Validate method (PUT only)
	if (request.method !== 'PUT') {
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

	// 3. Extract channel ID from params
	const { id: channelId } = request.params as { id: string }

	// 4. Validate channel exists and is a voice channel
	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Voice channels are type 2
	if (channel.type !== 2) {
		return new Response(JSON.stringify({ message: 'Channel is not a voice channel', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Parse request body
	let body: { status?: string }

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 6. Update channel status
	channel.status = body.status ?? null

	// Record action
	session.recordAction(
		'voice_channel_status_updated',
		{
			channel_id: channelId,
			status: channel.status
		},
		{
			endpoint: `PUT /channels/${channelId}/voice-status`,
			method: 'PUT'
		}
	)

	// 7. Dispatch CHANNEL_UPDATE event
	const apiChannel = mockChannelToAPIChannel(channel)
	getGatewayServer().dispatchToSession(session.id, 'CHANNEL_UPDATE', apiChannel, channel.guildId)

	// 8. Return 204 No Content
	return new Response(null, { status: 204 })
}
