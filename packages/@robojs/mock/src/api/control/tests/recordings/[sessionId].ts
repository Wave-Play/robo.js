import type { RoboRequest } from '@robojs/server'
import { loadRecording, deleteRecording } from '../../../../session/recording-storage.js'
import { notFound } from '../../utils.js'

/**
 * GET /api/control/tests/recordings/:sessionId - Get a specific recording
 * DELETE /api/control/tests/recordings/:sessionId - Delete a specific recording
 *
 * Response (GET):
 * SessionRecording
 *
 * Response (DELETE):
 * { deleted: boolean }
 */
export async function GET(request: RoboRequest) {
	const sessionId = request.params.sessionId
	if (!sessionId) {
		return notFound('Session ID required')
	}

	const recording = loadRecording(sessionId)
	if (!recording) {
		return notFound(`Recording not found for session: ${sessionId}`)
	}

	return recording
}

export async function DELETE(request: RoboRequest) {
	const sessionId = request.params.sessionId
	if (!sessionId) {
		return notFound('Session ID required')
	}

	const deleted = deleteRecording(sessionId)
	return { deleted }
}
