import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getStageServer } from '../../../../../core/stage.js'
import { notFound } from '../../../utils.js'
import { getActivityHostManager } from '../../../../../activity/index.js'

/**
 * POST /api/control/sessions/:id/activity/close
 *
 * Headless/automation entrypoint to close the currently running Activity instance.
 */
export async function POST(request: RoboRequest): Promise<Response> {
	const { id: sessionId } = request.params as { id: string }
	if (!sessionId) return notFound('Session ID required')

	const session = sessionManager.get(sessionId)
	if (!session) return notFound('Session not found')

	const hostManager = getActivityHostManager()
	const record = hostManager.getRecord(sessionId)
	if (!record) {
		return new Response(JSON.stringify({ message: 'No active Activity', code: 'NO_ACTIVITY' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const closedInstanceId = record.instance_id
	const closed = hostManager.closeActivity(sessionId)

	// Clean up proxy config for this session.
	try {
		const { getProxyConfigStore } = await import('../../../../../core/activity-proxy/config-store.js')
		getProxyConfigStore().delete(sessionId)
	} catch {
		// Proxy may not be initialized
	}

	// Notify Stage UI (if connected).
	if (closed) {
		try {
			getStageServer().broadcastToSession(sessionId, {
				type: 'activity.closed',
				data: { instance_id: closedInstanceId, reason: 'api_close' }
			})
		} catch {
			// ignore
		}
	}

	return new Response(
		JSON.stringify({
			success: closed,
			instance_id: closedInstanceId
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	)
}

