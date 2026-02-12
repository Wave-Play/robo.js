import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { notFound, badRequest } from '../../utils.js'
import { createMockUser } from '../../../../session/state.js'

/**
 * Control API for managing poll votes in test scenarios
 *
 * POST /api/control/sessions/:id/poll-vote - Add a vote to a poll answer
 * DELETE /api/control/sessions/:id/poll-vote - Remove a vote from a poll answer
 *
 * Request body:
 * {
 *   message_id: string    - Message ID containing the poll
 *   answer_id: number     - Poll answer ID (1-indexed)
 *   user_id: string       - User ID who is voting
 * }
 *
 * Response:
 * {
 *   success: boolean
 *   message_id: string
 *   answer_id: number
 *   user_id: string
 *   action: 'add' | 'remove'
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
	const { session } = resolved

	let body: {
		message_id: string
		answer_id: number
		user_id: string
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	if (!body.message_id) {
		return badRequest('message_id is required')
	}
	if (body.answer_id === undefined) {
		return badRequest('answer_id is required')
	}
	if (!body.user_id) {
		return badRequest('user_id is required')
	}

	// Validate message exists and has poll
	const message = session.state.getMessage(body.message_id)
	if (!message) {
		return notFound('Message not found')
	}
	if (!message.poll) {
		return badRequest('Message does not have a poll')
	}

	// Validate answer exists
	const answerExists = message.poll.answers.some((a) => a.answer_id === body.answer_id)
	if (!answerExists) {
		return badRequest(`Answer ID ${body.answer_id} does not exist in poll`)
	}

	// Ensure user exists in state (create if not)
	let user = session.state.users.get(body.user_id)
	if (!user) {
		user = createMockUser({
			id: body.user_id,
			username: `User_${body.user_id.slice(-4)}`,
			discriminator: '0'
		})
		session.state.users.set(body.user_id, user)
	}

	// Add the vote
	const success = session.state.addPollVote(body.message_id, body.user_id, body.answer_id)

	if (!success) {
		return badRequest('Failed to add vote (user may have already voted for this answer)')
	}

	return {
		success: true,
		message_id: body.message_id,
		answer_id: body.answer_id,
		user_id: body.user_id,
		action: 'add'
	}
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	let body: {
		message_id: string
		answer_id: number
		user_id: string
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	if (!body.message_id) {
		return badRequest('message_id is required')
	}
	if (body.answer_id === undefined) {
		return badRequest('answer_id is required')
	}
	if (!body.user_id) {
		return badRequest('user_id is required')
	}

	// Validate message exists and has poll
	const message = session.state.getMessage(body.message_id)
	if (!message) {
		return notFound('Message not found')
	}
	if (!message.poll) {
		return badRequest('Message does not have a poll')
	}

	// Remove the vote
	const success = session.state.removePollVote(body.message_id, body.user_id, body.answer_id)

	if (!success) {
		return badRequest('Failed to remove vote (user may not have voted for this answer)')
	}

	return {
		success: true,
		message_id: body.message_id,
		answer_id: body.answer_id,
		user_id: body.user_id,
		action: 'remove'
	}
}
