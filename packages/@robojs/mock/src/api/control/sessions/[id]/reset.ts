import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound, badRequest } from '../../utils.js'

/**
 * POST /api/control/sessions/:id/reset - Reset session state
 *
 * Resets the session state while keeping the session alive.
 * The bot user is preserved, but all guilds, channels, messages,
 * interactions, and users are cleared.
 *
 * Request Body (optional):
 * {
 *   clear_actions?: boolean  // Also clear recorded actions (default: true)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   sequence: number
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

	// Check if session is ending
	if (session.isEnding) {
		return badRequest('Cannot reset ending session')
	}

	// Parse request body for options
	let clearActions = true
	try {
		const body = await request.json().catch(() => ({}))
		if (typeof body === 'object' && body !== null) {
			if ('clear_actions' in body) {
				clearActions = body.clear_actions !== false
			}
		}
	} catch {
		// Ignore parse errors, use defaults
	}

	// Reset state (clears guilds, channels, messages, interactions, users except bot)
	session.state.reset()

	// Clear recorded actions if requested
	if (clearActions) {
		session.clearActions()
	}

	return {
		success: true,
		message: clearActions ? 'Session state and actions reset' : 'Session state reset (actions preserved)',
		sequence: session.state.sequence
	}
}
