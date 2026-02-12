/**
 * Stage Playback Control Endpoint
 *
 * POST /api/control/sessions/:id/stage/playback
 *
 * Controls playback state in the Stage UI via control commands
 * proxied over the Stage WebSocket connection.
 */

import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getStageServer } from '../../../../../core/stage.js'
import { getControlEventsHub } from '../../../../../core/control-events.js'
import { notFound, badRequest } from '../../../utils.js'
import type { StagePlaybackControlPayload, StagePlaybackChangedData } from '../../../../../types/stage.js'

/**
 * Request body for playback control
 */
interface PlaybackRequest {
	action:
		| 'play'
		| 'pause'
		| 'step_forward'
		| 'step_backward'
		| 'seek_to_event'
		| 'seek_to_time'
		| 'set_speed'
		| 'set_mode'
	eventIndex?: number
	time?: number
	speed?: number
	mode?: 'live' | 'playback'
}

const VALID_ACTIONS = [
	'play',
	'pause',
	'step_forward',
	'step_backward',
	'seek_to_event',
	'seek_to_time',
	'set_speed',
	'set_mode'
] as const

/**
 * Create a 409 Conflict response
 */
function conflict(message: string, code: string): Response {
	return new Response(JSON.stringify({ message: message, code }), {
		status: 409,
		headers: { 'Content-Type': 'application/json' }
	})
}

/**
 * Create a 408 Request Timeout response
 */
function requestTimeout(message: string, code: string): Response {
	return new Response(JSON.stringify({ message: message, code }), {
		status: 408,
		headers: { 'Content-Type': 'application/json' }
	})
}

export default async function handler(request: RoboRequest): Promise<Response> {
	// Only allow POST
	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const { id } = request.params as { id: string }

	// Check if session exists
	const session = sessionManager.get(id)
	if (!session) {
		return notFound('Session not found')
	}

	// Parse request body
	let body: PlaybackRequest
	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Validate action
	if (!body.action || !VALID_ACTIONS.includes(body.action as (typeof VALID_ACTIONS)[number])) {
		return badRequest(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`)
	}

	// Validate action-specific parameters
	if (body.action === 'seek_to_event' && typeof body.eventIndex !== 'number') {
		return badRequest('seek_to_event requires eventIndex parameter')
	}
	if (body.action === 'seek_to_time' && typeof body.time !== 'number') {
		return badRequest('seek_to_time requires time parameter')
	}
	if (body.action === 'set_speed' && typeof body.speed !== 'number') {
		return badRequest('set_speed requires speed parameter')
	}
	if (body.action === 'set_mode' && !['live', 'playback'].includes(body.mode ?? '')) {
		return badRequest('set_mode requires mode parameter (live or playback)')
	}

	// Check if Stage UI is connected
	const stageServer = getStageServer()
	if (!stageServer.hasStageClients(id)) {
		return conflict('No Stage UI client connected to this session', 'NO_STAGE_CLIENT')
	}

	// Build control command payload
	const payload: StagePlaybackControlPayload = {
		action: body.action,
		eventIndex: body.eventIndex,
		time: body.time,
		speed: body.speed,
		mode: body.mode
	}

	try {
		// Send control command and wait for response
		const response = await stageServer.sendControlCommand(id, 'playback_control', payload)

		if (!response.success) {
			return badRequest(response.error || 'Playback control failed')
		}

		// Broadcast playback change for external subscribers.
		try {
			getControlEventsHub().broadcast(id, 'stage.playback.changed', response.result as StagePlaybackChangedData)
		} catch {
			// Control events hub may not be initialized in all contexts
		}

		return new Response(
			JSON.stringify({
				success: true,
				state: response.result as StagePlaybackChangedData
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)

		if (message === 'NO_STAGE_CLIENT') {
			return conflict('No Stage UI client connected to this session', 'NO_STAGE_CLIENT')
		}

		if (message === 'TIMEOUT') {
			return requestTimeout('Stage UI did not respond in time', 'TIMEOUT')
		}

		return new Response(JSON.stringify({ message: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		})
	}
}
