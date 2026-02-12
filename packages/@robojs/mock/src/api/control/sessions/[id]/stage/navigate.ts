/**
 * Stage Navigation Control Endpoint
 *
 * POST /api/control/sessions/:id/stage/navigate
 *
 * Controls navigation state in the Stage UI via control commands
 * proxied over the Stage WebSocket connection.
 */

import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getStageServer } from '../../../../../core/stage.js'
import { getControlEventsHub } from '../../../../../core/control-events.js'
import { notFound, badRequest } from '../../../utils.js'
import type { StageNavigationControlPayload, StageNavigationChangedData } from '../../../../../types/stage.js'

/**
 * Request body for navigation control
 */
interface NavigateRequest {
	action: 'select_guild' | 'select_channel' | 'open_dm' | 'open_thread'
	guildId?: string
	channelId?: string
	userId?: string
	threadId?: string
}

const VALID_ACTIONS = ['select_guild', 'select_channel', 'open_dm', 'open_thread'] as const

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
	let body: NavigateRequest
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
	if (body.action === 'select_guild' && body.guildId === undefined) {
		return badRequest('select_guild requires guildId parameter (can be null for DMs)')
	}
	if (body.action === 'select_channel' && typeof body.channelId !== 'string') {
		return badRequest('select_channel requires channelId parameter')
	}
	if (body.action === 'open_dm' && typeof body.userId !== 'string') {
		return badRequest('open_dm requires userId parameter')
	}
	if (body.action === 'open_thread' && typeof body.threadId !== 'string') {
		return badRequest('open_thread requires threadId parameter')
	}

	// Check if Stage UI is connected
	const stageServer = getStageServer()
	if (!stageServer.hasStageClients(id)) {
		return conflict('No Stage UI client connected to this session', 'NO_STAGE_CLIENT')
	}

	// Build control command payload
	const payload: StageNavigationControlPayload = {
		action: body.action,
		guildId: body.guildId,
		channelId: body.channelId,
		userId: body.userId,
		threadId: body.threadId
	}

	try {
		// Send control command and wait for response
		const response = await stageServer.sendControlCommand(id, 'navigation_control', payload)

		if (!response.success) {
			return badRequest(response.error || 'Navigation control failed')
		}

		// Broadcast navigation change for external subscribers.
		try {
			getControlEventsHub().broadcast(id, 'stage.navigation.changed', response.result as StageNavigationChangedData)
		} catch {
			// Control events hub may not be initialized in all contexts
		}

		return new Response(
			JSON.stringify({
				success: true,
				state: response.result as StageNavigationChangedData
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
