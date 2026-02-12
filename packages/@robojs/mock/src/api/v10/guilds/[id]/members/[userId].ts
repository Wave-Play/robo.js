import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getGatewayServer } from '../../../../../core/gateway.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockGuildMemberToAPIMember } from '../../../../../discord/payloads.js'
import { enforcePermissions } from '../../../../../utils/permission-check.js'

/**
 * GET /api/v10/guilds/:id/members/:userId - Get guild member
 * PATCH /api/v10/guilds/:id/members/:userId - Modify guild member
 * DELETE /api/v10/guilds/:id/members/:userId - Remove guild member (kick)
 *
 * @see https://discord.com/developers/docs/resources/guild#get-guild-member
 * @see https://discord.com/developers/docs/resources/guild#modify-guild-member
 * @see https://discord.com/developers/docs/resources/guild#remove-guild-member
 */

function resolveGuildMember(request: RoboRequest) {
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
	const { id: guildId, userId } = request.params as { id: string; userId: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle @me alias for the bot user
	// URL-decode the userId since the router passes URL-encoded params (%40me -> @me)
	const decodedUserId = decodeURIComponent(userId)
	const targetUserId = decodedUserId === '@me' ? session.state.botUser.id : decodedUserId

	// 4. Validate member exists
	const member = session.state.getGuildMember(guildId, targetUserId)
	if (!member) {
		return new Response(JSON.stringify({ message: 'Unknown Member', code: 10007 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Get the user for the member
	const user = session.state.users.get(targetUserId)
	if (!user) {
		return new Response(JSON.stringify({ message: 'Unknown User', code: 10013 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId, targetUserId, member, user }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveGuildMember(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, targetUserId, member, user } = resolved

	const apiMember = mockGuildMemberToAPIMember(member, user)

	// Look up voice state for current deaf/mute values
	// Voice state deaf/mute are server-side values that can be modified via voice.setMute/setDeaf
	const voiceState = session.state.voiceStates.get(`${guildId}:${targetUserId}`)
	if (voiceState) {
		apiMember.deaf = voiceState.deaf ?? member.deaf
		apiMember.mute = voiceState.mute ?? member.mute
	}

	return new Response(JSON.stringify(apiMember), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

export async function PATCH(request: RoboRequest) {
	const resolved = resolveGuildMember(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, targetUserId, user } = resolved

	// Check permissions for PATCH
	const permError = enforcePermissions(
		session,
		'PATCH',
		`/guilds/${guildId}/members/${targetUserId}`,
		undefined,
		guildId,
		{ targetUserId }
	)
	if (permError) return permError

	let body: {
		nick?: string | null
		roles?: string[]
		mute?: boolean
		deaf?: boolean
		channel_id?: string | null
		communication_disabled_until?: string | null
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate nickname length if provided
	if (body.nick !== undefined && body.nick !== null && body.nick.length > 32) {
		return new Response(
			JSON.stringify({ message: 'Nickname cannot exceed 32 characters', code: 50035 }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Validate communication_disabled_until if provided
	if (body.communication_disabled_until !== undefined && body.communication_disabled_until !== null) {
		const disabledUntil = new Date(body.communication_disabled_until)
		if (isNaN(disabledUntil.getTime())) {
			return new Response(
				JSON.stringify({ message: 'Invalid communication_disabled_until format', code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Max timeout is 28 days
		const now = Date.now()
		const maxTimeout = 28 * 24 * 60 * 60 * 1000
		if (disabledUntil.getTime() > now + maxTimeout) {
			return new Response(
				JSON.stringify({ message: 'Timeout duration cannot exceed 28 days', code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}
	}

	// Update the member
	const updatedMember = session.state.updateGuildMember(guildId, targetUserId, {
		nick: body.nick,
		roles: body.roles,
		mute: body.mute,
		deaf: body.deaf,
		communicationDisabledUntil: body.communication_disabled_until
	})

	if (!updatedMember) {
		return new Response(JSON.stringify({ message: 'Failed to update member', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Update voice state if mute, deaf, or channel_id are being modified
	const voiceStateKey = `${guildId}:${targetUserId}`
	const existingVoiceState = session.state.voiceStates.get(voiceStateKey)
	if (body.mute !== undefined || body.deaf !== undefined || body.channel_id !== undefined) {
		if (existingVoiceState) {
			// Update existing voice state
			if (body.mute !== undefined) existingVoiceState.mute = body.mute
			if (body.deaf !== undefined) existingVoiceState.deaf = body.deaf
			if (body.channel_id !== undefined) existingVoiceState.channel_id = body.channel_id
		} else if (body.channel_id !== null) {
			// Create new voice state if connecting to a channel
			session.state.voiceStates.set(voiceStateKey, {
				guild_id: guildId,
				channel_id: body.channel_id || null,
				user_id: targetUserId,
				session_id: `voice_${targetUserId}_${Date.now()}`,
				deaf: body.deaf ?? false,
				mute: body.mute ?? false,
				self_deaf: false,
				self_mute: false,
				self_stream: false,
				self_video: false,
				suppress: false,
				request_to_speak_timestamp: null
			})
		}

		// If channel_id is null, remove from voice (disconnect)
		if (body.channel_id === null && existingVoiceState) {
			session.state.voiceStates.delete(voiceStateKey)
		}

		// Dispatch VOICE_STATE_UPDATE event
		const voiceState = session.state.voiceStates.get(voiceStateKey)
		getGatewayServer().dispatchToSession(session.id, 'VOICE_STATE_UPDATE', {
			guild_id: guildId,
			channel_id: voiceState?.channel_id || null,
			user_id: targetUserId,
			session_id: voiceState?.session_id || `voice_${targetUserId}_${Date.now()}`,
			deaf: voiceState?.deaf ?? body.deaf ?? false,
			mute: voiceState?.mute ?? body.mute ?? false,
			self_deaf: voiceState?.self_deaf ?? false,
			self_mute: voiceState?.self_mute ?? false,
			self_stream: voiceState?.self_stream ?? false,
			self_video: voiceState?.self_video ?? false,
			suppress: voiceState?.suppress ?? false,
			request_to_speak_timestamp: voiceState?.request_to_speak_timestamp || null
		}, guildId)
	}

	// Record action
	session.recordAction(
		'member_updated',
		{
			guild_id: guildId,
			user_id: targetUserId,
			updates: body
		},
		{
			endpoint: `PATCH /guilds/${guildId}/members/${targetUserId}`,
			method: 'PATCH'
		}
	)

	// Dispatch GUILD_MEMBER_UPDATE event
	await session.dispatchGuildMemberUpdate(guildId, updatedMember, user)

	return new Response(JSON.stringify(mockGuildMemberToAPIMember(updatedMember, user)), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveGuildMember(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, targetUserId, user } = resolved

	// Check permissions for DELETE
	const permError = enforcePermissions(
		session,
		'DELETE',
		`/guilds/${guildId}/members/${targetUserId}`,
		undefined,
		guildId,
		{ targetUserId }
	)
	if (permError) return permError

	// Cannot kick the bot itself (would break the session)
	if (targetUserId === session.state.botUser.id) {
		return new Response(
			JSON.stringify({ message: 'Cannot kick the bot user', code: 50013 }),
			{
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Remove the member
	const removed = session.state.removeGuildMember(guildId, targetUserId)
	if (!removed) {
		return new Response(JSON.stringify({ message: 'Failed to remove member', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'member_kicked',
		{
			guild_id: guildId,
			user_id: targetUserId
		},
		{
			endpoint: `DELETE /guilds/${guildId}/members/${targetUserId}`,
			method: 'DELETE'
		}
	)

	// Dispatch GUILD_MEMBER_REMOVE event so client cache is updated
	await session.dispatchGuildMemberRemove(guildId, user)

	// Discord returns 204 No Content on successful kick
	return new Response(null, { status: 204 })
}
