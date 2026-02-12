import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound, badRequest } from '../../utils.js'

/**
 * POST /api/control/sessions/:id/loop-protection - Enable/disable loop protection
 *
 * Request body:
 * {
 *   enabled: boolean  // Whether to enable loop protection
 * }
 *
 * Response:
 * {
 *   success: true,
 *   enabled: boolean
 * }
 *
 * Loop protection detects when a bot triggers an infinite loop by responding
 * to its own MESSAGE_CREATE events. When enabled (default), the server will
 * detect 10 MESSAGE_CREATE events within 1 second and circuit-break, dropping
 * further events for 5 seconds.
 *
 * Disable this protection if:
 * - You're intentionally testing high-frequency message scenarios
 * - You believe the detection is producing false positives
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

	return {
		enabled: session.loopProtectionEnabled,
		isLoopDetected: session.isLoopDetected
	}
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	let body: {
		enabled?: boolean
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	const enabled = body.enabled ?? true

	if (typeof enabled !== 'boolean') {
		return badRequest('enabled must be a boolean')
	}

	session.loopProtectionEnabled = enabled

	return {
		success: true,
		enabled
	}
}
