import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { notFound } from '../../../utils.js'

/**
 * GET/DELETE /api/control/sessions/:id/permissions/denied
 *
 * GET Response:
 * {
 *   events: PermissionDeniedEvent[],
 *   count: number
 * }
 *
 * DELETE Response (clear history):
 * {
 *   success: true,
 *   cleared: number
 * }
 *
 * Returns the history of permission denied events for debugging and UI display.
 *
 * @see Permissions Admin UI
 */
function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id) ?? sessionManager.getByToken(id)

	if (!session) {
		return notFound('Session not found')
	}

	return { session }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const events = session.getPermissionDeniedEvents()

	return {
		events: events.map((event) => ({
			timestamp: event.timestamp,
			method: event.method,
			path: event.path,
			missing_permissions: event.missingPermissions,
			code: event.code,
			message: event.message,
			channel_id: event.channelId,
			guild_id: event.guildId
		})),
		count: events.length
	}
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const count = session.getPermissionDeniedEvents().length
	session.clearPermissionDeniedEvents()

	return {
		success: true,
		cleared: count
	}
}
