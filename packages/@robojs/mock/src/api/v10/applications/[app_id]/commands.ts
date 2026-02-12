import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { getStageServer } from '../../../../core/stage.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockCommandToAPICommand } from '../../../../discord/payloads.js'
import { CommandLimits, ApplicationCommandType } from '../../../../types/index.js'
import type { MockApplicationCommandConfig } from '../../../../types/index.js'

/**
 * GET /api/v10/applications/:app_id/commands - List all global commands
 * POST /api/v10/applications/:app_id/commands - Create a global command
 * PUT /api/v10/applications/:app_id/commands - Bulk overwrite global commands
 *
 * @see https://discord.com/developers/docs/interactions/application-commands#get-global-application-commands
 * @see https://discord.com/developers/docs/interactions/application-commands#create-global-application-command
 * @see https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
 */
export default async (request: RoboRequest) => {
	// 1. Parse Authorization header → get session
	const authHeader = request.headers.get('Authorization') || ''
	const sessionId = parseMockToken(authHeader)

	if (!sessionId) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const session = sessionManager.get(sessionId)
	if (!session) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 2. Extract app_id from params
	const { app_id: appId } = request.params as { app_id: string }

	// 3. Validate app_id matches session's application ID
	if (appId !== session.state.applicationId) {
		return new Response(JSON.stringify({ message: 'Missing Access', code: 50001 }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle GET - List global commands
	if (request.method === 'GET') {
		// Parse with_localizations query param (defaults to false per Discord API)
		const url = new URL(request.url)
		const withLocalizations = url.searchParams.get('with_localizations') === 'true'

		const commands = session.state.getGlobalCommands()
		return commands.map((cmd) => mockCommandToAPICommand(cmd, { withLocalizations }))
	}

	// Handle POST - Create global command
	if (request.method === 'POST') {
		let body: MockApplicationCommandConfig

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate required fields
		if (!body.name) {
			return new Response(JSON.stringify({ message: 'Missing required field: name', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name length
		if (body.name.length < CommandLimits.MIN_NAME_LENGTH || body.name.length > CommandLimits.MAX_NAME_LENGTH) {
			return new Response(
				JSON.stringify({
					error: `Command name must be between ${CommandLimits.MIN_NAME_LENGTH} and ${CommandLimits.MAX_NAME_LENGTH} characters`,
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate description for CHAT_INPUT commands
		const type = body.type ?? ApplicationCommandType.ChatInput
		if (type === ApplicationCommandType.ChatInput) {
			if (!body.description) {
				return new Response(JSON.stringify({ message: 'Missing required field: description', code: 50035 }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}

			if (body.description.length < CommandLimits.MIN_DESCRIPTION_LENGTH || body.description.length > CommandLimits.MAX_DESCRIPTION_LENGTH) {
				return new Response(
					JSON.stringify({
						error: `Command description must be between ${CommandLimits.MIN_DESCRIPTION_LENGTH} and ${CommandLimits.MAX_DESCRIPTION_LENGTH} characters`,
						code: 50035
					}),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			// Validate name pattern for CHAT_INPUT
			if (!CommandLimits.CHAT_INPUT_NAME_PATTERN.test(body.name.toLowerCase())) {
				return new Response(
					JSON.stringify({
						error: 'Command name must be lowercase and contain only letters, numbers, dashes, and underscores',
						code: 50035
					}),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		}

		// Validate options count
		if (body.options && body.options.length > CommandLimits.MAX_OPTIONS) {
			return new Response(
				JSON.stringify({
					error: `Command cannot have more than ${CommandLimits.MAX_OPTIONS} options`,
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Check for duplicate name
		const existingCommand = session.state.findCommandByName(body.name, undefined)
		if (existingCommand) {
			// Discord returns the existing command if name matches (upsert behavior)
			const updated = session.state.updateCommand(existingCommand.id, body)
			if (updated) {
				// Broadcast command update to Stage UI
				getStageServer().broadcastCommandsUpdate(sessionId)
				return new Response(JSON.stringify(mockCommandToAPICommand(updated)), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}

		// Check global command limit
		const globalCommands = session.state.getGlobalCommands()
		if (globalCommands.length >= CommandLimits.MAX_GLOBAL_COMMANDS) {
			return new Response(
				JSON.stringify({
					error: `Application has reached maximum global command limit of ${CommandLimits.MAX_GLOBAL_COMMANDS}`,
					code: 30032
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Create the command (global scope - no guildId)
		const command = session.state.createCommand(body, undefined)

		if (!command) {
			return new Response(JSON.stringify({ message: 'Failed to create command', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'rest_request',
			{
				command_id: command.id,
				command_name: command.name,
				scope: 'global'
			},
			{
				endpoint: `POST /applications/${appId}/commands`,
				method: 'POST'
			}
		)

		// Broadcast command update to Stage UI
		getStageServer().broadcastCommandsUpdate(sessionId)

		return new Response(JSON.stringify(mockCommandToAPICommand(command)), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle PUT - Bulk overwrite global commands
	if (request.method === 'PUT') {
		let body: MockApplicationCommandConfig[]

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!Array.isArray(body)) {
			return new Response(JSON.stringify({ message: 'Expected array of commands', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate count
		if (body.length > CommandLimits.MAX_GLOBAL_COMMANDS) {
			return new Response(
				JSON.stringify({
					error: `Cannot register more than ${CommandLimits.MAX_GLOBAL_COMMANDS} global commands`,
					code: 30032
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate each command
		for (const cmd of body) {
			if (!cmd.name) {
				return new Response(JSON.stringify({ message: 'Missing required field: name', code: 50035 }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			}

			const type = cmd.type ?? ApplicationCommandType.ChatInput
			if (type === ApplicationCommandType.ChatInput) {
				if (!cmd.description) {
					return new Response(JSON.stringify({ message: `Missing required field: description for command "${cmd.name}"`, code: 50035 }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					})
				}
			}
		}

		// Bulk overwrite
		const commands = session.state.bulkOverwriteCommands(body, undefined)

		if (!commands) {
			return new Response(JSON.stringify({ message: 'Failed to overwrite commands', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'rest_request',
			{
				command_count: commands.length,
				scope: 'global'
			},
			{
				endpoint: `PUT /applications/${appId}/commands`,
				method: 'PUT'
			}
		)

		// Broadcast command update to Stage UI
		getStageServer().broadcastCommandsUpdate(sessionId)

		return commands.map((cmd) => mockCommandToAPICommand(cmd))
	}

	// Method not allowed
	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}
