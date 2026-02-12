import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../utils/id.js'
import { enforcePermissions } from '../../../../../../../utils/permission-check.js'

/**
 * PUT /api/v10/guilds/:id/members/:userId/roles/:roleId - Add role to member
 * DELETE /api/v10/guilds/:id/members/:userId/roles/:roleId - Remove role from member
 *
 * @see https://discord.com/developers/docs/resources/guild#add-guild-member-role
 * @see https://discord.com/developers/docs/resources/guild#remove-guild-member-role
 */
function resolveMemberRole(request: RoboRequest) {
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
	const { id: guildId, userId, roleId } = request.params as { id: string; userId: string; roleId: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate role exists
	const role = session.state.getGuildRole(guildId, roleId)
	if (!role) {
		return new Response(JSON.stringify({ message: 'Unknown Role', code: 10011 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Cannot add/remove @everyone role (it's implicit)
	if (roleId === guildId) {
		return new Response(
			JSON.stringify({ message: 'Cannot modify @everyone role assignment', code: 50028 }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 6. Validate member exists (or create if user exists)
	let member = session.state.getGuildMember(guildId, userId)
	const user = session.state.users.get(userId)

	if (!member && !user) {
		return new Response(JSON.stringify({ message: 'Unknown Member', code: 10007 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Create member if they don't exist but user does
	if (!member && user) {
		member = session.state.createGuildMember(guildId, userId, { roles: [] }) ?? undefined
		if (!member) {
			return new Response(JSON.stringify({ message: 'Failed to create member', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	return { session, guild, guildId, userId, roleId, member, user }
}

export async function PUT(request: RoboRequest) {
	const resolved = resolveMemberRole(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, userId, roleId, user } = resolved

	// Check permissions
	const permError = enforcePermissions(
		session,
		'PUT',
		`/guilds/${guildId}/members/${userId}/roles/${roleId}`,
		undefined,
		guildId,
		{ targetRoleId: roleId, targetUserId: userId }
	)
	if (permError) return permError

	const added = session.state.addMemberRole(guildId, userId, roleId)

	// Record action (even if role was already present)
	session.recordAction(
		'member_role_added',
		{
			guild_id: guildId,
			user_id: userId,
			role_id: roleId,
			was_new: added
		},
		{
			endpoint: `PUT /guilds/${guildId}/members/${userId}/roles/${roleId}`,
			method: 'PUT'
		}
	)

	// Dispatch GUILD_MEMBER_UPDATE event if role was actually added
	if (added && user) {
		const updatedMember = session.state.getGuildMember(guildId, userId)
		if (updatedMember) {
			await session.dispatchGuildMemberUpdate(guildId, updatedMember, user)
		}
	}

	// Discord returns 204 No Content on success
	return new Response(null, { status: 204 })
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveMemberRole(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, userId, roleId, user } = resolved

	// Check permissions
	const permError = enforcePermissions(
		session,
		'DELETE',
		`/guilds/${guildId}/members/${userId}/roles/${roleId}`,
		undefined,
		guildId,
		{ targetRoleId: roleId, targetUserId: userId }
	)
	if (permError) return permError

	const removed = session.state.removeMemberRole(guildId, userId, roleId)

	// Record action
	session.recordAction(
		'member_role_removed',
		{
			guild_id: guildId,
			user_id: userId,
			role_id: roleId,
			was_present: removed
		},
		{
			endpoint: `DELETE /guilds/${guildId}/members/${userId}/roles/${roleId}`,
			method: 'DELETE'
		}
	)

	// Dispatch GUILD_MEMBER_UPDATE event if role was actually removed
	if (removed && user) {
		const updatedMember = session.state.getGuildMember(guildId, userId)
		if (updatedMember) {
			await session.dispatchGuildMemberUpdate(guildId, updatedMember, user)
		}
	}

	// Discord returns 204 No Content on success
	return new Response(null, { status: 204 })
}
