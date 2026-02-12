import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound, badRequest } from '../../utils.js'
import type { AuditLogEvent } from '../../../../types/index.js'

/**
 * POST /api/control/sessions/:id/audit-log - Add audit log entries to session state
 *
 * Request body:
 * {
 *   guild_id: string           // Required: Guild to add entries to
 *   entries: Array<{
 *     id?: string              // Optional: Entry ID (auto-generated if not provided)
 *     action_type: number      // Required: AuditLogEvent type
 *     user_id?: string         // Optional: User who performed action (defaults to bot)
 *     target_id?: string       // Optional: Target of the action
 *     reason?: string          // Optional: Reason for the action
 *     changes?: Array<{        // Optional: Changes made
 *       key: string
 *       old_value?: unknown
 *       new_value?: unknown
 *     }>
 *     options?: {              // Optional: Extra data for specific action types
 *       delete_member_days?: string    // For MemberPrune
 *       members_removed?: string       // For MemberPrune
 *       channel_id?: string            // For MemberMove, MessageDelete, MessagePin, StageInstance
 *       count?: string                 // For MemberMove, MemberDisconnect, MessageDelete, MessageBulkDelete
 *       message_id?: string            // For MessagePin
 *       id?: string                    // For ChannelOverwrite
 *       type?: string                  // For ChannelOverwrite ('0' = role, '1' = member)
 *       role_name?: string             // For ChannelOverwrite
 *     }
 *   }>
 * }
 *
 * Response:
 * {
 *   success: true,
 *   added: number,
 *   entry_ids: string[]
 * }
 */
export async function POST(request: RoboRequest) {
	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	// Parse request body
	let body: {
		guild_id: string
		entries: Array<{
			id?: string
			action_type: AuditLogEvent
			user_id?: string
			target_id?: string
			reason?: string
			changes?: Array<{
				key: string
				old_value?: unknown
				new_value?: unknown
			}>
			options?: Record<string, string>
		}>
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Validate required fields
	if (!body.guild_id) {
		return badRequest('Missing "guild_id" field')
	}

	if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) {
		return badRequest('Missing or empty "entries" array')
	}

	// Validate guild exists
	const guild = session.state.guilds.get(body.guild_id)
	if (!guild) {
		return badRequest(`Guild ${body.guild_id} not found`)
	}

	const addedIds: string[] = []

	// Add each entry to the audit log
	for (const entryData of body.entries) {
		if (typeof entryData.action_type !== 'number') {
			return badRequest('Each entry must have a valid "action_type" number')
		}

		const entry = session.state.createAuditLogEntry(body.guild_id, {
			actionType: entryData.action_type,
			userId: entryData.user_id,
			targetId: entryData.target_id,
			reason: entryData.reason,
			changes: entryData.changes,
			options: entryData.options
		})

		addedIds.push(entry.id)
	}

	return {
		success: true,
		added: addedIds.length,
		entry_ids: addedIds
	}
}
