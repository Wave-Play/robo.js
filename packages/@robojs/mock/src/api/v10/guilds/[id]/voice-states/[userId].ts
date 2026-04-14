import { define } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { generateSnowflake } from '../../../../../utils/snowflake.js'
import { getGatewayServer } from '../../../../../core/gateway.js'
import { enforcePermissions } from '../../../../../utils/permission-check.js'
import type { MockVoiceState as _MockVoiceState } from '../../../../../types/index.js'

/**
 * GET /api/v10/guilds/:id/voice-states/:userId - Get voice state
 * PATCH /api/v10/guilds/:id/voice-states/:userId - Modify voice state
 *
 * Used by discord.js for:
 * - GuildMember.voice (reading voice state)
 * - GuildMember.voice.setMute(boolean)
 * - GuildMember.voice.setDeaf(boolean)
 * - GuildMember.voice.setChannel(channelId)
 * - GuildMember.voice.disconnect()
 *
 * @see https://discord.com/developers/docs/resources/voice#get-voice-state
 * @see https://discord.com/developers/docs/resources/voice#modify-voice-state
 */

const voiceStateParams = z.object({
	id: z.string().describe('The guild ID (Snowflake)'),
	userId: z.string().describe('The user ID (Snowflake)')
})

const VoiceStateResponseSchema = z
	.object({
		channel_id: z.string().nullable(),
		deaf: z.boolean(),
		guild_id: z.string().nullable(),
		mute: z.boolean(),
		request_to_speak_timestamp: z.string().nullable(),
		suppress: z.boolean(),
		self_stream: z.boolean().nullable(),
		self_deaf: z.boolean(),
		self_mute: z.boolean(),
		self_video: z.boolean(),
		session_id: z.string(),
		user_id: z.string(),
		member: z.object({}).passthrough().optional()
	})
	.passthrough()

export const GET = define(
	{
		summary: 'Get voice state',
		description: 'Returns a voice state object for the given user in the guild',
		tags: ['Voice'],
		params: voiceStateParams,
		response: {
			200: VoiceStateResponseSchema
		}
	},
	async (request) => {
		// Extract session from Authorization header
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

		const { id: guildId, userId } = request.params as { id: string; userId: string }
		const guild = session.state.guilds.get(guildId)

		if (!guild) {
			return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Get voice state
		const voiceStateKey = `${guildId}:${userId}`
		const voiceState = session.state.voiceStates?.get(voiceStateKey)

		if (!voiceState) {
			return new Response(JSON.stringify({ message: 'Unknown Voice State', code: 10065 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Build member data if available
		const member = session.state.guildMembers.get(`${guildId}:${userId}`)
		const response: Record<string, unknown> = {
			channel_id: voiceState.channel_id,
			deaf: voiceState.deaf ?? false,
			guild_id: guildId,
			mute: voiceState.mute ?? false,
			request_to_speak_timestamp: voiceState.request_to_speak_timestamp ?? null,
			suppress: voiceState.suppress ?? false,
			self_stream: voiceState.self_stream ?? null,
			self_deaf: voiceState.self_deaf ?? false,
			self_mute: voiceState.self_mute ?? false,
			self_video: voiceState.self_video ?? false,
			session_id: voiceState.session_id ?? '',
			user_id: userId
		}

		if (member?.user) {
			response.member = {
				user: {
					id: member.user.id,
					username: member.user.username,
					discriminator: member.user.discriminator ?? '0',
					avatar: member.user.avatar ?? null,
					global_name: member.user.globalName ?? null
				},
				nick: member.nick ?? null,
				avatar: member.avatar ?? null,
				banner: null,
				roles: member.roles ?? [],
				joined_at: member.joinedAt ?? new Date().toISOString(),
				premium_since: member.premiumSince ?? null,
				deaf: voiceState.deaf ?? false,
				mute: voiceState.mute ?? false,
				flags: member.flags ?? 0,
				pending: member.pending ?? false,
				communication_disabled_until: member.communicationDisabledUntil ?? null
			}
		}

		return response
	}
)

export const PATCH = define(
	{
		summary: 'Update voice state',
		description: 'Updates another user\'s voice state',
		tags: ['Voice'],
		params: voiceStateParams,
		body: z
			.object({
				suppress: z.boolean().nullable().optional(),
				channel_id: z.string().nullable().optional()
			})
			.passthrough(),
		response: {
			204: z.undefined().describe('Voice state updated successfully')
		}
	},
	async (request) => {
		// Extract session from Authorization header
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

		const { id: guildId, userId } = request.params as { id: string; userId: string }
		const guild = session.state.guilds.get(guildId)

		if (!guild) {
			return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Check permissions
		const permError = enforcePermissions(session, 'PATCH', `/guilds/${guildId}/voice-states/${userId}`, undefined, guildId)
		if (permError) return permError

		let body: {
			channel_id?: string | null
			suppress?: boolean
			mute?: boolean
			deaf?: boolean
			request_to_speak_timestamp?: string | null
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid JSON body' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Get or create voice state
		const voiceStateKey = `${guildId}:${userId}`
		let voiceState = session.state.voiceStates?.get(voiceStateKey)

		if (!voiceState) {
			// Create new voice state
			voiceState = {
				guild_id: guildId,
				channel_id: null,
				user_id: userId,
				session_id: generateSnowflake(),
				deaf: false,
				mute: false,
				self_deaf: false,
				self_mute: false,
				self_stream: false,
				self_video: false,
				suppress: false,
				request_to_speak_timestamp: null
			}
		}

		// Update voice state fields
		if (body.channel_id !== undefined) {
			voiceState.channel_id = body.channel_id
		}
		if (body.mute !== undefined) {
			voiceState.mute = body.mute
		}
		if (body.deaf !== undefined) {
			voiceState.deaf = body.deaf
		}
		if (body.suppress !== undefined) {
			voiceState.suppress = body.suppress
		}
		if (body.request_to_speak_timestamp !== undefined) {
			voiceState.request_to_speak_timestamp = body.request_to_speak_timestamp
		}

		// Store updated voice state
		session.state.voiceStates.set(voiceStateKey, voiceState)

		// Get member data if available
		const member = session.state.guildMembers.get(`${guildId}:${userId}`)
		const voiceStatePayload: Record<string, unknown> = {
			...voiceState,
			member: member?.user
				? {
						user: {
							id: member.user.id,
							username: member.user.username,
							discriminator: member.user.discriminator ?? '0',
							avatar: member.user.avatar ?? null,
							global_name: member.user.globalName ?? null
						},
						nick: member.nick ?? null,
						roles: member.roles ?? [],
						joined_at: member.joinedAt ?? new Date().toISOString(),
						deaf: voiceState.deaf,
						mute: voiceState.mute
					}
				: undefined
		}

		// Record action
		session.recordAction(
			'voice_state_updated',
			{
				guild_id: guildId,
				user_id: userId,
				updates: body
			},
			{
				endpoint: `PATCH /guilds/${guildId}/voice-states/${userId}`,
				method: 'PATCH'
			}
		)

		// Dispatch VOICE_STATE_UPDATE event
		getGatewayServer().dispatchToSession(session.id, 'VOICE_STATE_UPDATE', voiceStatePayload, guildId)

		// Return 204 No Content (as per Discord API)
		return new Response(null, { status: 204 })
	}
)
