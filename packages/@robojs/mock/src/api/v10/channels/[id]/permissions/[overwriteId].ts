import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { OverwriteType } from '../../../../../types/index.js'
import { mockChannelToAPIChannel } from '../../../../../discord/payloads.js'
import { getGatewayServer } from '../../../../../core/gateway.js'

/**
 * PUT /api/v10/channels/:id/permissions/:overwriteId - Edit channel permissions
 * DELETE /api/v10/channels/:id/permissions/:overwriteId - Delete channel permission overwrite
 *
 * @see https://discord.com/developers/docs/resources/channel#edit-channel-permissions
 * @see https://discord.com/developers/docs/resources/channel#delete-channel-permission
 */
function resolveChannelForPermissions(request: RoboRequest) {
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

	const { id: channelId, overwriteId } = request.params as { id: string; overwriteId: string }

	const channel = session.state.channels.get(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Channel must be in a guild
	if (!channel.guildId) {
		return new Response(JSON.stringify({ message: 'Cannot set permissions on DM channel', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, channel, channelId, overwriteId }
}

export async function PUT(request: RoboRequest) {
	const resolved = resolveChannelForPermissions(request)
	if (resolved instanceof Response) return resolved
	const { session, channel, channelId, overwriteId } = resolved

	let body: {
		allow?: string
		deny?: string
		type: number // 0 = Role, 1 = Member
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate type
	if (body.type !== OverwriteType.Role && body.type !== OverwriteType.Member) {
		return new Response(JSON.stringify({ message: 'Invalid overwrite type', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// If type is Role, validate role exists
	if (body.type === OverwriteType.Role) {
		const role = session.state.getGuildRole(channel.guildId!, overwriteId)
		if (!role) {
			return new Response(JSON.stringify({ message: 'Unknown Role', code: 10011 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	// If type is Member, validate user exists
	if (body.type === OverwriteType.Member) {
		const user = session.state.users.get(overwriteId)
		if (!user) {
			return new Response(JSON.stringify({ message: 'Unknown User', code: 10013 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	// Set the permission overwrite
	const success = session.state.setChannelOverwrite(channelId, {
		id: overwriteId,
		type: body.type,
		allow: body.allow ?? '0',
		deny: body.deny ?? '0'
	})

	if (!success) {
		return new Response(JSON.stringify({ message: 'Failed to set permission overwrite', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'channel_overwrite_updated',
		{
			channel_id: channelId,
			overwrite_id: overwriteId,
			type: body.type,
			allow: body.allow ?? '0',
			deny: body.deny ?? '0'
		},
		{
			endpoint: `PUT /channels/${channelId}/permissions/${overwriteId}`,
			method: 'PUT'
		}
	)

	// Dispatch CHANNEL_UPDATE event so Discord.js updates its local cache
	const updatedChannel = session.state.getChannel(channelId)
	if (updatedChannel) {
		const apiChannel = mockChannelToAPIChannel(updatedChannel)
		getGatewayServer().dispatchToSession(session.id, 'CHANNEL_UPDATE', apiChannel, channel.guildId)
	}

	// Discord returns 204 No Content on success
	return new Response(null, { status: 204 })
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveChannelForPermissions(request)
	if (resolved instanceof Response) return resolved
	const { session, channelId, overwriteId } = resolved

	const deleted = session.state.deleteChannelOverwrite(channelId, overwriteId)

	// Record action (even if overwrite didn't exist)
	session.recordAction(
		'channel_overwrite_deleted',
		{
			channel_id: channelId,
			overwrite_id: overwriteId,
			was_present: deleted
		},
		{
			endpoint: `DELETE /channels/${channelId}/permissions/${overwriteId}`,
			method: 'DELETE'
		}
	)

	// Discord returns 204 No Content on success
	return new Response(null, { status: 204 })
}
