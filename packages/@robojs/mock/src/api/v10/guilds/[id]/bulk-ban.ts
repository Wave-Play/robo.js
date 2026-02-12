import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'
import { BanLimits } from '../../../../types/index.js'
import { createMockUser } from '../../../../session/state.js'

/**
 * POST /api/v10/guilds/:id/bulk-ban - Bulk ban users
 *
 * Request body:
 * {
 *   user_ids: string[] // Array of user IDs (max 200)
 *   delete_message_seconds?: number // 0-604800 (7 days)
 * }
 *
 * Response:
 * {
 *   banned_users: string[] // Successfully banned user IDs
 *   failed_users: string[] // Failed to ban user IDs
 * }
 *
 * @see https://discord.com/developers/docs/resources/guild#bulk-guild-ban
 */
export default async (request: RoboRequest) => {
	// 1. Validate POST method
	if (request.method !== 'POST') {
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

	// 3. Extract guild ID from params
	const { id: guildId } = request.params as { id: string }

	// 4. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Check permissions (requires BAN_MEMBERS and MANAGE_GUILD)
	const permError = enforcePermissions(session, request.method, `/guilds/${guildId}/bulk-ban`, undefined, guildId)
	if (permError) return permError

	// 6. Parse request body
	let body: {
		user_ids: string[]
		delete_message_seconds?: number
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid JSON body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 7. Validate user_ids array
	if (!Array.isArray(body.user_ids)) {
		return new Response(JSON.stringify({ message: 'user_ids must be an array', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (body.user_ids.length === 0) {
		return new Response(JSON.stringify({ message: 'user_ids cannot be empty', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (body.user_ids.length > 200) {
		return new Response(
			JSON.stringify({ message: 'Cannot ban more than 200 users at once', code: 50035 }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// 8. Validate delete_message_seconds
	const deleteMessageSeconds = body.delete_message_seconds
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

	// 9. Get reason from header
	const rawReason = request.headers.get('X-Audit-Log-Reason')
	const reason = rawReason ? decodeURIComponent(rawReason) : null

	// 10. Process each user
	const bannedUsers: string[] = []
	const failedUsers: string[] = []

	for (const userId of body.user_ids) {
		// Validate user ID is a string
		if (typeof userId !== 'string' || !userId) {
			failedUsers.push(userId || 'invalid')
			continue
		}

		// Cannot ban the bot itself
		if (userId === session.state.botUser.id) {
			failedUsers.push(userId)
			continue
		}

		// Check if already banned
		const existingBan = session.state.getBan(guildId, userId)
		if (existingBan) {
			// Already banned is considered success
			bannedUsers.push(userId)
			continue
		}

		try {
			// Ensure user exists (create if not)
			let user = session.state.users.get(userId)
			if (!user) {
				user = createMockUser({ id: userId, username: `BulkBannedUser${userId.slice(-4)}` })
				session.state.users.set(userId, user)
			}

			// Create the ban
			const ban = session.state.createBan(guildId, userId, {
				reason,
				deleteMessageSeconds
			})

			if (ban) {
				bannedUsers.push(userId)
				// Dispatch GUILD_BAN_ADD event
				await session.dispatchGuildBanAdd(guildId, user)
			} else {
				failedUsers.push(userId)
			}
		} catch {
			failedUsers.push(userId)
		}
	}

	// 11. Record action
	session.recordAction(
		'bulk_ban',
		{
			guild_id: guildId,
			banned_users: bannedUsers,
			failed_users: failedUsers,
			reason,
			delete_message_seconds: deleteMessageSeconds
		},
		{
			endpoint: `POST /guilds/${guildId}/bulk-ban`,
			method: 'POST'
		}
	)

	// 12. Return result
	return new Response(
		JSON.stringify({
			banned_users: bannedUsers,
			failed_users: failedUsers
		}),
		{
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		}
	)
}
