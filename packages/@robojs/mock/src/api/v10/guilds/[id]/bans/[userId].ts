import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockUserToAPIUser } from '../../../../../discord/payloads.js'
import { enforcePermissions } from '../../../../../utils/permission-check.js'
import { BanLimits } from '../../../../../types/index.js'
import { createMockUser } from '../../../../../session/state.js'

/**
 * GET /api/v10/guilds/:id/bans/:userId - Get guild ban
 * PUT /api/v10/guilds/:id/bans/:userId - Create guild ban
 * DELETE /api/v10/guilds/:id/bans/:userId - Remove guild ban
 *
 * @see https://discord.com/developers/docs/resources/guild#get-guild-ban
 * @see https://discord.com/developers/docs/resources/guild#create-guild-ban
 * @see https://discord.com/developers/docs/resources/guild#remove-guild-ban
 */
export default async (request: RoboRequest) => {
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

	// 3b. Check permissions (requires BAN_MEMBERS permission)
	const permError = enforcePermissions(
		session,
		request.method,
		`/guilds/${guildId}/bans/${userId}`,
		undefined,
		guildId,
		{ targetUserId: userId }
	)
	if (permError) return permError

	// Handle GET - Get ban info
	if (request.method === 'GET') {
		const ban = session.state.getBan(guildId, userId)
		if (!ban) {
			return new Response(JSON.stringify({ message: 'Unknown Ban', code: 10026 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		const user = session.state.users.get(userId)
		return new Response(
			JSON.stringify({
				reason: ban.reason ?? null,
				user: user
					? mockUserToAPIUser(user)
					: { id: userId, username: 'Unknown', discriminator: '0', global_name: null }
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Handle PUT - Create ban
	if (request.method === 'PUT') {
		// Cannot ban the bot itself
		if (userId === session.state.botUser.id) {
			return new Response(JSON.stringify({ message: 'Cannot ban the bot user', code: 50013 }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		let body: {
			delete_message_seconds?: number
			delete_message_days?: number // Deprecated but still supported
		} = {}

		// Body is optional
		try {
			const text = await request.text()
			if (text) {
				body = JSON.parse(text)
			}
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Get reason from header (X-Audit-Log-Reason)
		// Discord.js URL-encodes the reason, so decode it
		const rawReason = request.headers.get('X-Audit-Log-Reason')
		const reason = rawReason ? decodeURIComponent(rawReason) : null

		// Validate delete_message_seconds
		let deleteMessageSeconds = body.delete_message_seconds
		if (deleteMessageSeconds === undefined && body.delete_message_days !== undefined) {
			// Convert deprecated days to seconds
			deleteMessageSeconds = body.delete_message_days * 86400
		}
		if (
			deleteMessageSeconds !== undefined &&
			(deleteMessageSeconds < 0 || deleteMessageSeconds > BanLimits.MAX_DELETE_MESSAGE_SECONDS)
		) {
			return new Response(
				JSON.stringify({
					error: `delete_message_seconds must be between 0 and ${BanLimits.MAX_DELETE_MESSAGE_SECONDS}`,
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Ensure user exists (create if not)
		let user = session.state.users.get(userId)
		if (!user) {
			// Create a placeholder user for the ban
			user = createMockUser({ id: userId, username: 'BannedUser' })
			session.state.users.set(userId, user)
		}

		// Create the ban
		const ban = session.state.createBan(guildId, userId, {
			reason,
			deleteMessageSeconds
		})

		if (!ban) {
			return new Response(JSON.stringify({ message: 'Failed to create ban', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'ban_created',
			{
				guild_id: guildId,
				user_id: userId,
				reason,
				delete_message_seconds: deleteMessageSeconds
			},
			{
				endpoint: `PUT /guilds/${guildId}/bans/${userId}`,
				method: 'PUT'
			}
		)

		// Dispatch GUILD_BAN_ADD event
		await session.dispatchGuildBanAdd(guildId, user)

		// Discord returns 204 No Content on successful ban
		return new Response(null, { status: 204 })
	}

	// Handle DELETE - Remove ban
	if (request.method === 'DELETE') {
		const ban = session.state.getBan(guildId, userId)
		if (!ban) {
			return new Response(JSON.stringify({ message: 'Unknown Ban', code: 10026 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Get the user before removing the ban
		let user = session.state.users.get(userId)
		if (!user) {
			// Create a placeholder user for the event
			user = createMockUser({ id: userId, username: 'UnbannedUser' })
		}

		// Remove the ban
		const removed = session.state.removeBan(guildId, userId)
		if (!removed) {
			return new Response(JSON.stringify({ message: 'Failed to remove ban', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'ban_removed',
			{
				guild_id: guildId,
				user_id: userId
			},
			{
				endpoint: `DELETE /guilds/${guildId}/bans/${userId}`,
				method: 'DELETE'
			}
		)

		// Dispatch GUILD_BAN_REMOVE event
		await session.dispatchGuildBanRemove(guildId, user)

		// Discord returns 204 No Content on successful unban
		return new Response(null, { status: 204 })
	}

	// Method not allowed
	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}
