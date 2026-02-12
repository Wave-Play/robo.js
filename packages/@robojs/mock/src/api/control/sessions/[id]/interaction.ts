import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound, badRequest } from '../../utils.js'
import {
	dispatchInteractionToSession,
	type DispatchInteractionInput
} from '../../../../session/interaction-dispatch.js'

/**
 * POST /api/control/sessions/:id/interaction - Dispatch an interaction to a session
 *
 * This is a convenience endpoint that creates a properly formatted INTERACTION_CREATE
 * event and dispatches it to the session. It handles generating interaction IDs,
 * tokens, and ensuring all required fields are present.
 *
 * Request body:
 * {
 *   type: number              // Interaction type (2 = APPLICATION_COMMAND, 3 = MESSAGE_COMPONENT, etc.)
 *   data: {                   // Interaction data
 *     name?: string           // Command name (for slash commands)
 *     type?: number           // Command type (1 = CHAT_INPUT, 2 = USER, 3 = MESSAGE)
 *     custom_id?: string      // Custom ID (for buttons/select menus)
 *     values?: string[]       // Selected values (for select menus)
 *     options?: Array<{       // Command options
 *       name: string
 *       type: number
 *       value: unknown
 *     }>
 *   }
 *   guild_id?: string         // Guild ID (defaults to first guild in session)
 *   channel_id?: string       // Channel ID (defaults to first channel in session)
 *   user?: {                  // User triggering interaction
 *     id?: string
 *     username?: string
 *   }
 *   metadata?: ActionMetadata // Optional metadata for simulation tracing
 * }
 *
 * Response:
 * {
 *   success: true,
 *   interaction_id: string,
 *   interaction_token: string
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
	let body: DispatchInteractionInput

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Validate required fields
	if (body.type === undefined || typeof body.type !== 'number') {
		return badRequest('Missing or invalid "type" field (must be a number)')
	}

	// Use shared handler
	return dispatchInteractionToSession(session, body)
}
