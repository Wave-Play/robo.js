import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getGatewayServer } from '../../../../../core/gateway.js'
import { notFound } from '../../../utils.js'

/**
 * POST /api/control/sessions/:id/gateway/invalidate-session - Invalidate session for fresh READY
 *
 * Invalidates a session so that reconnecting clients receive a fresh READY
 * instead of being able to RESUME. This is useful for testing session invalidation
 * scenarios (e.g., when Discord sends close code 4009 Session Timeout).
 *
 * After invalidation:
 * - All connection states are cleared
 * - Client RESUME attempts will fail
 * - Client must send fresh IDENTIFY to get new READY
 *
 * Note: This does NOT disconnect existing connections. Use the disconnect
 * endpoint first if you want to force a reconnect with fresh READY.
 *
 * Request body: (none required)
 *
 * Response:
 * {
 *   success: true,
 *   invalidated: true,
 *   session_id: string
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

	// Invalidate the session through the gateway
	const gateway = getGatewayServer()
	const invalidated = gateway.invalidateSession(id)

	return {
		success: true,
		invalidated,
		session_id: id
	}
}
