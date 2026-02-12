import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound, badRequest } from '../../utils.js'
import { getPermissionNames } from '../../../../core/permissions.js'

/**
 * Control API for managing bot permissions in test scenarios
 *
 * GET /api/control/sessions/:id/permissions - Get bot's current permissions
 * POST /api/control/sessions/:id/permissions - Set bot permissions
 * DELETE /api/control/sessions/:id/permissions - Reset permissions to default
 *
 * @see Plan Step 7: Control API for Permission Testing
 */
export default async (request: RoboRequest) => {
	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	// Handle GET - Get bot's current permissions
	if (request.method === 'GET') {
		const url = new URL(request.url, 'http://localhost')
		const guildId = url.searchParams.get('guild_id')

		if (!guildId) {
			return badRequest('guild_id query parameter required')
		}

		const guild = session.state.guilds.get(guildId)
		if (!guild) {
			return notFound('Guild not found')
		}

		const botUserId = session.state.botUser?.id
		if (!botUserId) {
			return badRequest('No bot user in session')
		}

		const member = session.state.getGuildMember(guildId, botUserId)
		if (!member) {
			return notFound('Bot is not a member of this guild')
		}

		// Get all roles the bot has
		const roles = session.state.getGuildRoles(guildId)
		const memberRoles = roles.filter((r) => member.roles.includes(r.id) || r.id === guildId)

		// Compute base permissions (no channel context)
		let permissions = BigInt(0)
		for (const role of memberRoles) {
			permissions |= BigInt(role.permissions)
		}

		return {
			guild_id: guildId,
			user_id: botUserId,
			roles: member.roles,
			permissions: permissions.toString(),
			permission_names: getPermissionNames(permissions)
		}
	}

	// Handle POST - Set bot permissions
	if (request.method === 'POST') {
		let body: {
			guild_id: string
			channel_id?: string
			permissions?: string
			deny?: string
			role_id?: string
		}

		try {
			body = await request.json()
		} catch {
			return badRequest('Invalid JSON body')
		}

		if (!body.guild_id) {
			return badRequest('guild_id is required')
		}

		const guild = session.state.guilds.get(body.guild_id)
		if (!guild) {
			return notFound('Guild not found')
		}

		const botUserId = session.state.botUser?.id
		if (!botUserId) {
			return badRequest('No bot user in session')
		}

		const member = session.state.getGuildMember(body.guild_id, botUserId)
		if (!member) {
			return notFound('Bot is not a member of this guild')
		}

		// If channel_id is provided, create/update channel overwrite
		if (body.channel_id) {
			const channel = session.state.channels.get(body.channel_id)
			if (!channel) {
				return notFound('Channel not found')
			}

			// Determine target - either role or the bot user directly
			const targetId = body.role_id || botUserId
			const targetType = body.role_id ? 0 : 1 // 0 = role, 1 = member

			session.state.setChannelOverwrite(body.channel_id, {
				id: targetId,
				type: targetType,
				allow: body.permissions || '0',
				deny: body.deny || '0'
			})

			return {
				success: true,
				channel_id: body.channel_id,
				overwrite: {
					id: targetId,
					type: targetType,
					allow: body.permissions || '0',
					deny: body.deny || '0'
				}
			}
		}

		// Otherwise, modify a role's permissions
		const roleId = body.role_id || guildEveryoneRoleId(body.guild_id)

		// Find the role - either specified or @everyone
		let role = session.state.getGuildRole(body.guild_id, roleId)

		if (!role) {
			// If a specific role was requested but not found
			if (body.role_id) {
				return notFound('Role not found')
			}

			// Create @everyone if it doesn't exist
			role = session.state.createEveryoneRole(body.guild_id)
		}

		// Update the role permissions
		const updatedRole = session.state.updateGuildRole(body.guild_id, role.id, {
			permissions: body.permissions
		})

		if (!updatedRole) {
			return badRequest('Failed to update role permissions')
		}

		return {
			success: true,
			role: {
				id: updatedRole.id,
				name: updatedRole.name,
				permissions: updatedRole.permissions,
				permission_names: getPermissionNames(BigInt(updatedRole.permissions))
			}
		}
	}

	// Handle DELETE - Reset permissions to default
	if (request.method === 'DELETE') {
		const url = new URL(request.url, 'http://localhost')
		const guildId = url.searchParams.get('guild_id')
		const channelId = url.searchParams.get('channel_id')

		if (!guildId) {
			return badRequest('guild_id query parameter required')
		}

		const guild = session.state.guilds.get(guildId)
		if (!guild) {
			return notFound('Guild not found')
		}

		// If channel_id provided, remove overwrites for that channel
		if (channelId) {
			const channel = session.state.channels.get(channelId)
			if (!channel) {
				return notFound('Channel not found')
			}

			// Clear all overwrites for this channel
			const overwrites = session.state.getChannelOverwrites(channelId)
			for (const overwrite of overwrites) {
				session.state.deleteChannelOverwrite(channelId, overwrite.id)
			}

			return {
				success: true,
				message: `Cleared ${overwrites.length} permission overwrites from channel`,
				channel_id: channelId
			}
		}

		// Otherwise reset @everyone role to default permissions
		const everyoneRole = session.state.getGuildRole(guildId, guildId)
		if (everyoneRole) {
			// Default permissions: View channels, send messages, etc.
			const defaultPermissions = (
				BigInt(1 << 10) | // VIEW_CHANNEL
				BigInt(1 << 11) | // SEND_MESSAGES
				BigInt(1 << 15) | // ADD_REACTIONS
				BigInt(1 << 6) // CHANGE_NICKNAME
			).toString()

			session.state.updateGuildRole(guildId, guildId, {
				permissions: defaultPermissions
			})
		}

		return {
			success: true,
			message: 'Reset guild permissions to defaults',
			guild_id: guildId
		}
	}

	// Method not allowed
	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}

/**
 * Helper to get the @everyone role ID (same as guild ID)
 */
function guildEveryoneRoleId(guildId: string): string {
	return guildId
}
