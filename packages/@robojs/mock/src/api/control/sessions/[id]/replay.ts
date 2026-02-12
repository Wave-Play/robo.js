import type { RoboRequest } from '@robojs/server'
import type { SessionRecording, ReplayOptions } from '../../../../types/index.js'
import { sessionManager } from '../../../../core/manager.js'
import { RecordingPlayer } from '../../../../session/player.js'
import { notFound, badRequest, serverError } from '../../utils.js'

/**
 * POST /api/control/sessions/:id/replay - Replay a recording into a session
 *
 * Request body:
 * {
 *   recording?: SessionRecording,     // Recording data (mutually exclusive with recordingPath)
 *   recordingPath?: string,           // Path to recording file (mutually exclusive with recording)
 *   options?: {
 *     speed?: number,                 // Speed multiplier (default: 1, 0 = instant)
 *     validate?: boolean,             // Validate bot responses (default: false)
 *     validationMode?: 'strict' | 'flexible' | 'type-only',  // Validation strictness (default: 'flexible')
 *     responseTimeout?: number        // Timeout for bot responses in ms (default: 5000)
 *   }
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   actionsReplayed: number,
 *   duration: number,
 *   validation?: {                    // Only present if validate: true
 *     passed: boolean,
 *     matched: number,
 *     mismatched: number,
 *     extra: number,
 *     missing: number,
 *     mismatches: ValidationMismatch[]
 *   }
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
	let body: {
		recording?: SessionRecording
		recordingPath?: string
		options?: ReplayOptions
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Load recording from body or file
	let recording: SessionRecording

	if (body.recording) {
		recording = body.recording
	} else if (body.recordingPath) {
		try {
			recording = await RecordingPlayer.loadFromFile(body.recordingPath)
		} catch (error) {
			return badRequest(`Failed to load recording: ${error instanceof Error ? error.message : String(error)}`)
		}
	} else {
		return badRequest('Either recording or recordingPath is required')
	}

	// Validate recording format
	if (recording.version !== 1) {
		return badRequest(`Unsupported recording version: ${recording.version}`)
	}

	if (!recording.metadata || !recording.actions) {
		return badRequest('Invalid recording format: missing metadata or actions')
	}

	// Create player and replay
	const player = new RecordingPlayer(recording)

	// Remove callbacks from options (not serializable in response)
	const options: ReplayOptions = {
		speed: body.options?.speed,
		validate: body.options?.validate,
		validationMode: body.options?.validationMode,
		responseTimeout: body.options?.responseTimeout
	}

	try {
		const result = await player.play(session, options)

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	} catch (error) {
		return serverError(`Replay failed: ${error instanceof Error ? error.message : String(error)}`)
	}
}
