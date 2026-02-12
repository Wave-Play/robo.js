import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { saveRecording } from '../../../../session/recording-storage.js'
import { notFound } from '../../utils.js'

/**
 * GET /api/control/sessions/:id/recording - Export session recording
 * POST /api/control/sessions/:id/recording - Save session recording to disk
 *
 * GET Response: SessionRecording JSON containing:
 * {
 *   version: 1,
 *   metadata: {
 *     sessionId: string,
 *     sessionName?: string,
 *     startTime: number,
 *     endTime: number,
 *     duration: number,
 *     actionCount: number,
 *     botUser: { id: string, username: string },
 *     applicationId: string,
 *     recordedAt: string (ISO 8601)
 *   },
 *   initialConfig: SessionConfig,
 *   actions: RecordedAction[]
 * }
 *
 * POST Response:
 * {
 *   success: boolean,
 *   path: string (relative path to saved recording)
 * }
 */

function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }
	if (!id) return notFound('Session ID required')
	const session = sessionManager.get(id)
	if (!session) return notFound('Session not found')
	return { session, id }
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session, id } = resolved

	// Save recording to disk
	const recording = session.exportRecording()
	saveRecording(id, recording)
	return {
		success: true,
		path: `${id}.json`
	}
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	// GET - export recording
	return session.exportRecording()
}
