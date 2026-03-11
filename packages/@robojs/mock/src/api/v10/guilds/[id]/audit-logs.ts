import { define } from '@robojs/server'
import { z } from 'zod'
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
 * - after: Get entries after this audit log entry ID
 * - limit: Max entries to return (1-100, default 50)
 *
 * @see https://discord.com/developers/docs/resources/audit-log#get-guild-audit-log
 */
export const GET = define(
	{
		summary: 'List guild audit log entries',
		description: 'Returns an audit log object for the guild',
		tags: ['Guilds'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		query: z.object({
			user_id: z.string().optional().describe('Filter by user who performed action'),
			target_id: z.string().optional().describe('Filter by target ID'),
			action_type: z.coerce.number().int().optional().describe('Filter by action type'),
			before: z.string().optional().describe('Get entries before this audit log entry ID'),
			after: z.string().optional().describe('Get entries after this audit log entry ID'),
			limit: z.coerce.number().int().min(1).max(100).optional().describe('Max entries to return (1-100)')
		}),
		response: {
			200: z
				.object({
					audit_log_entries: z.array(z.object({}).passthrough()),
					users: z.array(z.object({}).passthrough()),
					integrations: z.array(z.object({}).passthrough()),
					webhooks: z.array(z.object({}).passthrough()),
					guild_scheduled_events: z.array(z.object({}).passthrough()),
					threads: z.array(z.object({}).passthrough()),
					application_commands: z.array(z.object({}).passthrough()),
					auto_moderation_rules: z.array(z.object({}).passthrough().nullable())
				})
				.passthrough()
		}
	},
	async (request) => {
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
)
