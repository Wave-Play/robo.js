import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { getStageServer } from '../../../../core/stage.js'
import { notFound, badRequest } from '../../utils.js'
import type { MockApplicationCommandConfig } from '../../../../types/index.js'

/**
 * GET /api/control/sessions/:id/commands - List all commands in session
 * POST /api/control/sessions/:id/commands - Add command(s) to session
 * DELETE /api/control/sessions/:id/commands - Delete all commands in session
 *
 * POST Request body:
 * {
 *   commands: [
 *     {
 *       name: string           // Required
 *       description?: string   // Required for CHAT_INPUT
 *       type?: number          // 1=ChatInput (default), 2=User, 3=Message
 *       options?: []           // Command options
 *     }
 *   ]
 * }
 *
 * Response:
 * {
 *   success: true,
 *   commands: [...]
 * }
 */

function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }
	if (!id) return notFound('Session ID required')
	const session = sessionManager.get(id)
	if (!session) return notFound('Session not found')
	return { session, id }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const commands = Array.from(session.state.commands.values())
	return {
		success: true,
		commands
	}
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session, id } = resolved

	const count = session.state.commands.size
	session.state.commands.clear()

	// Notify stage clients of the change
	try {
		getStageServer().refreshSessionState(id)
	} catch {
		// Stage server may not be initialized
	}

	return {
		success: true,
		deleted: count
	}
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session, id } = resolved

	let body: {
		commands?: MockApplicationCommandConfig[]
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	if (!body.commands || !Array.isArray(body.commands)) {
		return badRequest('Missing or invalid "commands" array')
	}

	const created: Array<{ id: string; name: string; type: number }> = []
	const errors: string[] = []

	for (const config of body.commands) {
		if (!config.name) {
			errors.push('Command missing "name" field')
			continue
		}

		const command = session.state.createCommand(config)
		if (command) {
			created.push({
				id: command.id,
				name: command.name,
				type: command.type
			})
		} else {
			errors.push(`Failed to create command "${config.name}"`)
		}
	}

	// Notify stage clients of new commands
	if (created.length > 0) {
		try {
			getStageServer().refreshSessionState(id)
		} catch {
			// Stage server may not be initialized
		}
	}

	return {
		success: errors.length === 0,
		created,
		errors: errors.length > 0 ? errors : undefined
	}
}
