import { sessionManager } from '../../../core/manager.js'
import { computePermissions } from '../../../core/permissions.js'
import { buildCommandResponse, buildErrorResponse } from '../rpc-envelope.js'
import { RpcErrorCode } from '../error-codes.js'
import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'

/**
 * Context command handlers: GET_INSTANCE_ID, GET_PLATFORM_BEHAVIORS,
 * ENCOURAGE_HW_ACCELERATION, GET_USER, GET_GUILD, GET_GUILDS,
 * GET_CHANNEL, GET_CHANNELS, GET_CHANNEL_PERMISSIONS,
 * GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS
 */
export function handleContextCommands(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	switch (parsed.cmd) {
		case 'GET_INSTANCE_ID':
			return handleGetInstanceId(parsed, record)

		case 'GET_PLATFORM_BEHAVIORS':
			return handleGetPlatformBehaviors(parsed)

		case 'ENCOURAGE_HW_ACCELERATION':
			return handleEncourageHwAcceleration(parsed)

		case 'GET_USER':
			return handleGetUser(parsed, record)

		case 'GET_GUILD':
			return handleGetGuild(parsed, record)

		case 'GET_GUILDS':
			return handleGetGuilds(parsed, record)

		case 'GET_CHANNEL':
			return handleGetChannel(parsed, record)

		case 'GET_CHANNELS':
			return handleGetChannels(parsed, record)

		case 'GET_CHANNEL_PERMISSIONS':
			return handleGetChannelPermissions(parsed, record)

		case 'GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS':
			return handleGetParticipants(parsed, record, manager)

		default:
			return {
				outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, null)]
			}
	}
}

function handleGetInstanceId(parsed: InboundRpcMessage, record: ActivitySessionRecord): HandleInboundResult {
	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { instance_id: record.instance_id })]
	}
}

function handleGetPlatformBehaviors(parsed: InboundRpcMessage): HandleInboundResult {
	return {
		outbound: [
			buildCommandResponse(parsed.cmd, parsed.nonce, {
				iosKeyboardResizesView: true,
				requiresHardwareAcceleration: false,
				supportsPopouts: true,
				supportsOrientationLock: true
			})
		]
	}
}

function handleEncourageHwAcceleration(parsed: InboundRpcMessage): HandleInboundResult {
	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { enabled: true })]
	}
}

function handleGetUser(parsed: InboundRpcMessage, record: ActivitySessionRecord): HandleInboundResult {
	const mockSession = sessionManager.get(record.session_id)
	if (!mockSession) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'Session not found')]
		}
	}

	const userId = (parsed.args?.id as string) ?? record.user_id
	const user = mockSession.state.users.get(userId) ?? mockSession.state.currentUser

	return {
		outbound: [
			buildCommandResponse(parsed.cmd, parsed.nonce, {
				id: user.id,
				username: user.username,
				discriminator: user.discriminator ?? '0',
				avatar: user.avatar ?? null,
				global_name: user.globalName ?? null,
				flags: 0
			})
		]
	}
}

function handleGetGuild(parsed: InboundRpcMessage, record: ActivitySessionRecord): HandleInboundResult {
	const mockSession = sessionManager.get(record.session_id)
	if (!mockSession) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'Session not found')]
		}
	}

	const guildId = (parsed.args?.guild_id as string) ?? record.guild_id
	if (!guildId) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'No guild context')]
		}
	}

	const guild = mockSession.state.guilds.get(guildId)
	if (!guild) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'Guild not found')]
		}
	}

	return {
		outbound: [
			buildCommandResponse(parsed.cmd, parsed.nonce, {
				id: guild.id,
				name: guild.name,
				icon_url: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
				members: []
			})
		]
	}
}

function handleGetGuilds(parsed: InboundRpcMessage, record: ActivitySessionRecord): HandleInboundResult {
	const mockSession = sessionManager.get(record.session_id)
	if (!mockSession) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'Session not found')]
		}
	}

	const guilds = Array.from(mockSession.state.guilds.values()).map((g) => ({
		id: g.id,
		name: g.name
	}))

	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { guilds })]
	}
}

function handleGetChannel(parsed: InboundRpcMessage, record: ActivitySessionRecord): HandleInboundResult {
	const mockSession = sessionManager.get(record.session_id)
	if (!mockSession) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'Session not found')]
		}
	}

	const channelId = (parsed.args?.channel_id as string) ?? record.channel_id
	if (!channelId) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'No channel context')]
		}
	}

	const channel = mockSession.state.channels.get(channelId)
	if (!channel) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'Channel not found')]
		}
	}

	// Build voice states for this channel
	const voiceStates: Array<{
		user: { id: string; username: string; discriminator: string; avatar: string | null }
		voice_state: { mute: boolean; deaf: boolean; self_mute: boolean; self_deaf: boolean }
	}> = []

	for (const vs of mockSession.state.voiceStates.values()) {
		if (vs.channel_id === channelId) {
			const user = mockSession.state.users.get(vs.user_id)
			if (user) {
				voiceStates.push({
					user: {
						id: user.id,
						username: user.username,
						discriminator: user.discriminator ?? '0',
						avatar: user.avatar ?? null
					},
					voice_state: {
						mute: vs.mute ?? false,
						deaf: vs.deaf ?? false,
						self_mute: vs.self_mute ?? false,
						self_deaf: vs.self_deaf ?? false
					}
				})
			}
		}
	}

	return {
		outbound: [
			buildCommandResponse(parsed.cmd, parsed.nonce, {
				id: channel.id,
				name: channel.name,
				type: channel.type,
				guild_id: channel.guildId ?? null,
				topic: channel.topic ?? null,
				voice_states: voiceStates,
				messages: []
			})
		]
	}
}

function handleGetChannels(parsed: InboundRpcMessage, record: ActivitySessionRecord): HandleInboundResult {
	const mockSession = sessionManager.get(record.session_id)
	if (!mockSession) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'Session not found')]
		}
	}

	const guildId = (parsed.args?.guild_id as string) ?? record.guild_id
	const channels = Array.from(mockSession.state.channels.values())
		.filter((c) => c.guildId === guildId)
		.map((c) => ({
			id: c.id,
			name: c.name,
			type: c.type
		}))

	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { channels })]
	}
}

function handleGetChannelPermissions(parsed: InboundRpcMessage, record: ActivitySessionRecord): HandleInboundResult {
	const mockSession = sessionManager.get(record.session_id)
	if (!mockSession) {
		return {
			outbound: [buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, 'Session not found')]
		}
	}

	const channelId = (parsed.args?.channel_id as string) ?? record.channel_id
	if (!channelId || !record.guild_id) {
		return {
			outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { permissions: '0' })]
		}
	}

	const channel = mockSession.state.channels.get(channelId)
	const guild = mockSession.state.guilds.get(record.guild_id)
	const member = mockSession.state.getGuildMember(record.guild_id, record.user_id)

	if (!channel || !guild || !member) {
		return {
			outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { permissions: '0' })]
		}
	}

	// Get all roles for the guild
	const roles = Array.from(mockSession.state.roles.values()).filter((r) => r.guildId === record.guild_id)

	const computed = computePermissions(member, channel, guild, roles)

	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { permissions: String(computed) })]
	}
}

function handleGetParticipants(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	manager: ActivityHostManager
): HandleInboundResult {
	const snapshot = manager.getSnapshotForEvent('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', record)

	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, snapshot ?? { participants: [] })]
	}
}
