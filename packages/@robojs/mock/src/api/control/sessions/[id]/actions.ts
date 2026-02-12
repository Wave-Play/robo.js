import type { RoboRequest } from '@robojs/server'
import type { ActionType } from '../../../../types/index.js'
import { sessionManager } from '../../../../core/manager.js'
import { notFound } from '../../utils.js'

/**
 * GET /api/control/sessions/:id/actions - Get recorded actions
 * DELETE /api/control/sessions/:id/actions - Clear recorded actions
 *
 * Query params (GET only):
 * - type: Filter by action type (e.g., "message_sent", "dispatch")
 * - since: Filter actions after timestamp (ms)
 * - limit: Maximum number of actions to return (default: 100)
 * - offset: Offset for pagination (default: 0)
 *
 * Response (GET):
 * {
 *   actions: RecordedAction[],
 *   total: number,
 *   limit: number,
 *   offset: number
 * }
 *
 * Response (DELETE):
 * { success: true }
 */

function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }
	if (!id) return notFound('Session ID required')
	const session = sessionManager.get(id)
	if (!session) return notFound('Session not found')
	return { session, id }
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	session.clearActions()
	return { success: true }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const url = new URL(request.url, 'http://localhost')
	const type = url.searchParams.get('type') as ActionType | null
	const since = url.searchParams.get('since')
	const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
	const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

	let actions = session.getActions()

	// Apply filters
	if (type) {
		actions = actions.filter((a) => a.type === type)
	}
	if (since) {
		const sinceTs = parseInt(since, 10)
		actions = actions.filter((a) => a.timestamp >= sinceTs)
	}

	// Get total before pagination
	const total = actions.length

	// Apply pagination
	actions = actions.slice(offset, offset + limit)

	return {
		actions,
		total,
		limit,
		offset
	}
}
