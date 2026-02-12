import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound } from '../../utils.js'
import { serializeSessionState } from '../../../../session/state.js'

/**
 * GET /api/control/sessions/:id/state - Get full session state
 *
 * Response:
 * {
 *   guilds: [...],
 *   channels: [...],
 *   users: [...],
 *   botUser: {...},
 *   applicationId: string,
 *   sequence: number
 * }
 */
export async function GET(request: RoboRequest) {
	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	return serializeSessionState(session.state)
}
