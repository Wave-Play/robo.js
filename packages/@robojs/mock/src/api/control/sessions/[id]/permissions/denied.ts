import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { validateMethod, notFound } from '../../../utils.js'

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
export default async (request: RoboRequest) => {
	validateMethod(request, ['GET', 'DELETE'])

	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id) ?? sessionManager.getByToken(id)

	if (!session) {
		return notFound('Session not found')
	}

	// GET - List denied events
	if (request.method === 'GET') {
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

	// DELETE - Clear history
	const count = session.getPermissionDeniedEvents().length
	session.clearPermissionDeniedEvents()

	return {
		success: true,
		cleared: count
	}
}
