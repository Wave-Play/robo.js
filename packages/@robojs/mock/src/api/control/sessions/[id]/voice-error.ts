import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { sendVoiceError } from '../../../../core/voice-gateway.js'
import { notFound, badRequest } from '../../utils.js'

/**
 * Voice Error Control Endpoint
 *
 * POST /api/control/sessions/:id/voice-error
 *   Simulate a voice connection error
 *   Body: {
 *     guild_id: string,     // Required - guild where error occurs
 *     message: string,      // Error message
 *     code?: number,        // Error code (default: 4000)
 *     recoverable?: boolean // Whether the error is recoverable (default: false)
 *   }
 *
 * This will close the voice WebSocket connection with an error, triggering
 * the error event on the VoiceConnection.
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
	let body: {
		guild_id?: string
		message?: string
		code?: number
		recoverable?: boolean
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	if (!body.guild_id) {
		return badRequest('guild_id required')
	}

	const errorCode = body.code ?? 4000
	const errorMessage = body.message ?? 'Voice connection error'
	const recoverable = body.recoverable ?? false

	// Send error to voice gateway connection
	const success = sendVoiceError(id, body.guild_id, errorCode, errorMessage)

	if (!success) {
		return {
			success: false,
			error: 'No active voice connection found for session/guild'
		}
	}

	// Optionally dispatch VOICE_SERVER_UPDATE with null endpoint for non-recoverable errors
	if (!recoverable) {
		await session.dispatch('VOICE_SERVER_UPDATE', {
			token: null,
			guild_id: body.guild_id,
			endpoint: null
		})
	}

	return {
		success: true,
		guild_id: body.guild_id,
		error_code: errorCode,
		error_message: errorMessage,
		recoverable
	}
}
