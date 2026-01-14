import { define } from '@robojs/server'
import { z } from 'zod'
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
const SessionParamsSchema = z.object({
	id: z.string()
})

export const GET = define({ params: SessionParamsSchema }, async (request) => {
	const { id } = request.params

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	return serializeSessionState(session.state)
})
