import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../core/manager.js'
import { getStageServer } from '../../../../../../core/stage.js'
import { parseMockToken } from '../../../../../../utils/id.js'
import { mockCommandToAPICommand } from '../../../../../../discord/payloads.js'
import { CommandLimits, ApplicationCommandType } from '../../../../../../types/index.js'
import type { MockApplicationCommandConfig } from '../../../../../../types/index.js'

/**
 * GET /api/v10/applications/:app_id/guilds/:guild_id/commands - List all guild commands
 * POST /api/v10/applications/:app_id/guilds/:guild_id/commands - Create a guild command
 * PUT /api/v10/applications/:app_id/guilds/:guild_id/commands - Bulk overwrite guild commands
 *
 * @see https://discord.com/developers/docs/interactions/application-commands#get-guild-application-commands
 * @see https://discord.com/developers/docs/interactions/application-commands#create-guild-application-command
 * @see https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-guild-application-commands
 */

function resolveGuildCommands(request: RoboRequest) {
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

	// 2. Extract params
	const { app_id: appId, guild_id: guildId } = request.params as { app_id: string; guild_id: string }

	// 3. Validate app_id matches session's application ID
	if (appId !== session.state.applicationId) {
		return new Response(JSON.stringify({ message: 'Missing Access', code: 50001 }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate guild exists (optional - Discord doesn't require this but good for testing)
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, sessionId, appId, guildId }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveGuildCommands(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId } = resolved

	// Parse with_localizations query param (defaults to false per Discord API)
	const url = new URL(request.url)
	const withLocalizations = url.searchParams.get('with_localizations') === 'true'

	const commands = session.state.getGuildCommands(guildId)
	return commands.map((cmd) => mockCommandToAPICommand(cmd, { withLocalizations }))
}

export async function POST(request: RoboRequest) {
	const resolved = resolveGuildCommands(request)
	if (resolved instanceof Response) return resolved
	const { session, sessionId, appId, guildId } = resolved

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

	// Check for duplicate name in guild scope
	const existingCommand = session.state.findCommandByName(body.name, guildId)
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

	// Check guild command limit
	const guildCommands = session.state.getGuildCommands(guildId)
	if (guildCommands.length >= CommandLimits.MAX_GUILD_COMMANDS) {
		return new Response(
			JSON.stringify({
				error: `Guild has reached maximum command limit of ${CommandLimits.MAX_GUILD_COMMANDS}`,
				code: 30032
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Create the command (guild scope)
	const command = session.state.createCommand(body, guildId)

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
			guild_id: guildId,
			scope: 'guild'
		},
		{
			endpoint: `POST /applications/${appId}/guilds/${guildId}/commands`,
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

export async function PUT(request: RoboRequest) {
	const resolved = resolveGuildCommands(request)
	if (resolved instanceof Response) return resolved
	const { session, sessionId, appId, guildId } = resolved

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
	if (body.length > CommandLimits.MAX_GUILD_COMMANDS) {
		return new Response(
			JSON.stringify({
				error: `Cannot register more than ${CommandLimits.MAX_GUILD_COMMANDS} guild commands`,
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
	const commands = session.state.bulkOverwriteCommands(body, guildId)

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
			guild_id: guildId,
			scope: 'guild'
		},
		{
			endpoint: `PUT /applications/${appId}/guilds/${guildId}/commands`,
			method: 'PUT'
		}
	)

	// Broadcast command update to Stage UI
	getStageServer().broadcastCommandsUpdate(sessionId)

	return commands.map((cmd) => mockCommandToAPICommand(cmd))
}
