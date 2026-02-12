import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { AuditLogLimits } from '../../../../types/index.js'

/**
 * GET /api/v10/guilds/:id/audit-logs - Get guild audit log
 *
 * Query Parameters:
 * - user_id: Filter by user who performed action
 * - action_type: Filter by action type
 * - before: Get entries before this audit log entry ID
 * - limit: Max entries to return (1-100, default 50)
 *
 * @see https://discord.com/developers/docs/resources/audit-log#get-guild-audit-log
 */
export async function GET(request: RoboRequest) {
	// 1. Parse Authorization header -> get session
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

	// 2. Extract guild ID from params
	const { id: guildId } = request.params as { id: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Parse query parameters
	const url = new URL(request.url)
	const userId = url.searchParams.get('user_id') || undefined
	const actionTypeStr = url.searchParams.get('action_type')
	const before = url.searchParams.get('before') || undefined
	const limitStr = url.searchParams.get('limit')

	// Parse action_type as number
	const actionType = actionTypeStr ? parseInt(actionTypeStr, 10) : undefined
	if (actionTypeStr && (isNaN(actionType!) || actionType! < 0)) {
		return new Response(JSON.stringify({ message: 'Invalid action_type', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Parse limit
	let limit = limitStr ? parseInt(limitStr, 10) : AuditLogLimits.DEFAULT_FETCH_LIMIT
	if (isNaN(limit) || limit < 1) {
		limit = AuditLogLimits.DEFAULT_FETCH_LIMIT
	}
	limit = Math.min(limit, AuditLogLimits.MAX_FETCH_LIMIT)

	// 5. Get audit log entries
	const entries = session.state.getAuditLogEntries(guildId, {
		userId,
		actionType,
		before,
		limit
	})

	// 6. Build response - Discord returns an object with audit_log_entries array
	// along with users, integrations, webhooks, etc. for referenced entities
	const userIds = new Set<string>()
	for (const entry of entries) {
		if (entry.user_id) userIds.add(entry.user_id)
		if (entry.target_id) userIds.add(entry.target_id)
	}

	// Get users referenced in audit log
	const users = Array.from(userIds)
		.map((id) => session.state.users.get(id))
		.filter((u): u is NonNullable<typeof u> => !!u)
		.map((u) => ({
			id: u.id,
			username: u.username,
			discriminator: u.discriminator,
			global_name: u.globalName,
			avatar: u.avatar,
			bot: u.bot
		}))

	return {
		audit_log_entries: entries.map((entry) => ({
			id: entry.id,
			target_id: entry.target_id,
			user_id: entry.user_id,
			action_type: entry.action_type,
			changes: entry.changes,
			options: entry.options,
			reason: entry.reason
		})),
		users,
		integrations: [],
		webhooks: [],
		guild_scheduled_events: [],
		threads: [],
		application_commands: [],
		auto_moderation_rules: []
	}
}
