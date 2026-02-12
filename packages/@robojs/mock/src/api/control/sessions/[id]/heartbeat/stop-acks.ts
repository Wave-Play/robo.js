import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getGatewayServer } from '../../../../../core/gateway.js'
import { notFound, badRequest } from '../../../utils.js'

/**
 * POST /api/control/sessions/:id/heartbeat/stop-acks - Stop sending heartbeat ACKs
 *
 * Stops the gateway from sending HEARTBEAT_ACK responses for this session's connections.
 * This allows testing that clients properly disconnect on missed heartbeats.
 *
 * Request body:
 * {
 *   stop?: boolean   // true to stop ACKs (default), false to resume
 * }
 *
 * Response:
 * {
 *   success: true,
 *   stop_acks: boolean,   // Current state
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
	let body: { stop?: boolean } = {}

	try {
		const text = await request.text()
		if (text) {
			body = JSON.parse(text)
		}
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Default to true (stop ACKs)
	const stop = body.stop !== false

	// Set the control flag on the gateway
	const gateway = getGatewayServer()
	gateway.setStopHeartbeatAcks(id, stop)

	return {
		success: true,
		stop_acks: stop,
		session_id: id
	}
}
