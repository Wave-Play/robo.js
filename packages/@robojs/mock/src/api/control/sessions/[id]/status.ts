import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound } from '../../utils.js'

/**
 * GET /api/control/sessions/:id/status - Get session status summary
 *
 * Returns a lightweight summary of session state without full entity data.
 *
 * Response:
 * {
 *   session_id: string,
 *   name?: string,
 *   connected: boolean,
 *   connection_count: number,
 *   guild_count: number,
 *   channel_count: number,
 *   user_count: number,
 *   message_count: number,
 *   interaction_count: number,
 *   action_count: number,
 *   sequence: number,
 *   is_expired: boolean,
 *   created_at: string,
 *   expires_at: string
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

	const { state } = session

	return {
		session_id: session.id,
		name: session.name,
		connected: session.connections.size > 0,
		connection_count: session.connections.size,
		guild_count: state.guilds.size,
		channel_count: state.channels.size,
		user_count: state.users.size,
		message_count: state.messages.size,
		interaction_count: state.interactions.size,
		action_count: session.actionCount,
		sequence: state.sequence,
		is_expired: session.isExpired,
		created_at: new Date(session.createdAt).toISOString(),
		expires_at: new Date(session.expiresAt).toISOString()
	}
}
