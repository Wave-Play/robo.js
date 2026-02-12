import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getGatewayServer } from '../../../../../core/gateway.js'
import { notFound, badRequest } from '../../../utils.js'

/**
 * POST /api/control/sessions/:id/gateway/disconnect - Force disconnect gateway connections
 *
 * Forcefully disconnects all gateway connections for a session with a specific close code.
 * This allows testing reconnection and resume handling.
 *
 * Common Discord close codes:
 * - 4000: Unknown error (should reconnect)
 * - 4001: Unknown opcode
 * - 4002: Decode error
 * - 4003: Not authenticated
 * - 4004: Authentication failed (should NOT reconnect)
 * - 4007: Invalid seq (should reconnect with fresh session)
 * - 4009: Session timeout (should reconnect with fresh session)
 * - 1001: Going away (normal close, should reconnect)
 *
 * Request body:
 * {
 *   close_code?: number,  // WebSocket close code (default: 4000)
 *   reason?: string       // Optional close reason
 * }
 *
 * Response:
 * {
 *   success: true,
 *   disconnected: number,    // Number of connections disconnected
 *   close_code: number,
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

	// Parse request body
	let body: { close_code?: number; reason?: string } = {}

	try {
		const text = await request.text()
		if (text) {
			body = JSON.parse(text)
		}
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Default to 4000 (Unknown error - client should reconnect)
	const closeCode = body.close_code ?? 4000
	const reason = body.reason

	// Validate close code range
	if (closeCode < 1000 || closeCode > 4999) {
		return badRequest('close_code must be between 1000 and 4999')
	}

	// Disconnect all connections for this session
	const gateway = getGatewayServer()
	const disconnected = gateway.disconnectSession(id, closeCode, reason)

	return {
		success: true,
		disconnected,
		close_code: closeCode,
		session_id: id
	}
}
