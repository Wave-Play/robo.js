import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../core/manager.js'
import { notFound } from '../utils.js'

/**
 * GET /api/control/sessions/:id - Get session info with state
 * DELETE /api/control/sessions/:id - Delete session
 *
 * GET Response:
 * {
 *   session_id: string,
 *   token: string,
 *   name?: string,
 *   created_at: number,
 *   expires_at: number,
 *   connections: number,
 *   state: {
 *     botUser: { id: string, username: string },
 *     guilds: Array<{ id: string, name: string }>,
 *     channels: Array<{ id: string, name: string, guildId?: string, type: number }>
 *   }
 * }
 *
 * DELETE Response:
 * {
 *   success: true
 * }
 */

function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }
	if (!id) return notFound('Session ID required')
	const session = sessionManager.get(id)
	if (!session) return notFound('Session not found')
	return { session, id }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	// GET - return session info with state
	const guilds = Array.from(session.state.guilds.values()).map((g) => ({
		id: g.id,
		name: g.name
	}))

	const channels = Array.from(session.state.channels.values()).map((c) => ({
		id: c.id,
		name: c.name,
		guildId: c.guildId,
		type: c.type
	}))

	return {
		session_id: session.id,
		token: session.token,
		name: session.name,
		created_at: session.createdAt,
		expires_at: session.expiresAt,
		connections: session.connections.size,
		state: {
			botUser: {
				id: session.state.botUser.id,
				username: session.state.botUser.username
			},
			guilds,
			channels
		}
	}
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { id } = resolved

	await sessionManager.delete(id)
	return { success: true }
}
