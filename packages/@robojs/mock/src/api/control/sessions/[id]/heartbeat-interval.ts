import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound, badRequest } from '../../utils.js'
import { getGatewayServer } from '../../../../core/gateway.js'

/**
 * GET /api/control/sessions/:id/heartbeat-interval - Get heartbeat interval for this session
 * POST /api/control/sessions/:id/heartbeat-interval - Set heartbeat interval for new connections
 *
 * Request body:
 * {
 *   interval: number | null  // Heartbeat interval in ms (100-120000), or null to use global default
 * }
 *
 * Response:
 * {
 *   success: true,
 *   interval: number | null,
 *   effectiveInterval: number  // The actual interval that will be used (session or global)
 * }
 *
 * This sets the heartbeat interval for NEW connections in this session only.
 * Existing connections keep their original interval.
 * Other sessions are unaffected.
 *
 * Use shorter intervals (e.g., 1000ms) for faster testing of heartbeat behavior.
 */

function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }
	if (!id) return notFound('Session ID required')
	// Try to find session by ID first, then by token
	const session = sessionManager.get(id) ?? sessionManager.getByToken(id)
	if (!session) return notFound('Session not found')
	return { session, id }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const gateway = getGatewayServer()
	const globalInterval = gateway.getHeartbeatInterval()

	const sessionInterval = session.heartbeatInterval
	return {
		interval: sessionInterval,
		effectiveInterval: sessionInterval ?? globalInterval,
		globalDefault: globalInterval
	}
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const gateway = getGatewayServer()
	const globalInterval = gateway.getHeartbeatInterval()

	let body: {
		interval?: number | null
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	const interval = body.interval

	// Allow null to reset to global default
	if (interval !== null && interval !== undefined) {
		if (typeof interval !== 'number' || interval < 100 || interval > 120000) {
			return badRequest('interval must be a number between 100 and 120000 ms, or null to use global default')
		}
	}

	session.heartbeatInterval = interval ?? null

	return {
		success: true,
		interval: session.heartbeatInterval,
		effectiveInterval: session.heartbeatInterval ?? globalInterval,
		globalDefault: globalInterval
	}
}
