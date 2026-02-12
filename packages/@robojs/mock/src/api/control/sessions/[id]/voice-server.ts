import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { VOICE_GATEWAY_PORT } from '../../../../core/voice-gateway.js'
import { notFound, badRequest } from '../../utils.js'
import { generateSnowflake } from '../../../../utils/snowflake.js'
import type { VoiceServerState } from '../../../../types/index.js'

/**
 * Voice Server Control Endpoint
 *
 * GET /api/control/sessions/:id/voice-server?guild_id=xxx
 *   Returns the current voice server state for a guild
 *
 * POST /api/control/sessions/:id/voice-server
 *   Manually trigger VOICE_SERVER_UPDATE for testing
 *   Body: { guild_id: string, channel_id?: string, endpoint?: string }
 *
 * DELETE /api/control/sessions/:id/voice-server?guild_id=xxx
 *   Clear voice server state (simulates disconnect)
 */

function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }
	if (!id) return notFound('Session ID required')
	const session = sessionManager.get(id)
	if (!session) return notFound('Session not found')
	return { session, id }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const url = new URL(request.url, 'http://localhost')
	const guildId = url.searchParams.get('guild_id')

	if (!guildId) {
		// Return all voice servers
		const voiceServers: Record<string, VoiceServerState> = {}
		for (const [key, value] of session.voiceServers) {
			voiceServers[key] = value
		}
		return {
			success: true,
			voice_servers: voiceServers
		}
	}

	// Return specific voice server
	const voiceServer = session.voiceServers.get(guildId)
	if (!voiceServer) {
		return notFound('Voice server not found for guild')
	}

	return {
		success: true,
		voice_server: voiceServer
	}
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const url = new URL(request.url, 'http://localhost')
	const guildId = url.searchParams.get('guild_id')

	if (!guildId) {
		return badRequest('guild_id query parameter required')
	}

	const deleted = session.voiceServers.delete(guildId)

	// Also dispatch VOICE_SERVER_UPDATE with null endpoint to signal disconnect
	await session.dispatch('VOICE_SERVER_UPDATE', {
		token: null,
		guild_id: guildId,
		endpoint: null
	})

	return {
		success: true,
		deleted,
		guild_id: guildId
	}
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	let body: {
		guild_id?: string
		channel_id?: string
		endpoint?: string
		user_id?: string
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	if (!body.guild_id) {
		return badRequest('guild_id required')
	}

	// Generate voice server state
	const voiceToken = `mock-voice-${generateSnowflake()}`
	const voiceSessionId = generateSnowflake()
	const endpoint = body.endpoint ?? `localhost:${VOICE_GATEWAY_PORT}`

	const voiceServerState: VoiceServerState = {
		token: voiceToken,
		endpoint,
		sessionId: voiceSessionId,
		guildId: body.guild_id,
		channelId: body.channel_id ?? '',
		userId: body.user_id ?? session.state.botUser.id,
		createdAt: Date.now()
	}

	// Store voice server state
	session.voiceServers.set(body.guild_id, voiceServerState)

	// Dispatch VOICE_SERVER_UPDATE
	await session.dispatch('VOICE_SERVER_UPDATE', {
		token: voiceToken,
		guild_id: body.guild_id,
		endpoint
	})

	return {
		success: true,
		dispatched: session.connections.size,
		voice_server: voiceServerState
	}
}
