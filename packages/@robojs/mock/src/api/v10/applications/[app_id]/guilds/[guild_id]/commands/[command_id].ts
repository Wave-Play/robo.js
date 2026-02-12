import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../utils/id.js'
import { mockCommandToAPICommand } from '../../../../../../../discord/payloads.js'
import { CommandLimits, ApplicationCommandType } from '../../../../../../../types/index.js'
import type { MockApplicationCommandConfig } from '../../../../../../../types/index.js'

/**
 * GET /api/v10/applications/:app_id/guilds/:guild_id/commands/:command_id - Get a guild command
 * PATCH /api/v10/applications/:app_id/guilds/:guild_id/commands/:command_id - Edit a guild command
 * DELETE /api/v10/applications/:app_id/guilds/:guild_id/commands/:command_id - Delete a guild command
 *
 * @see https://discord.com/developers/docs/interactions/application-commands#get-guild-application-command
 * @see https://discord.com/developers/docs/interactions/application-commands#edit-guild-application-command
 * @see https://discord.com/developers/docs/interactions/application-commands#delete-guild-application-command
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

	// 2. Extract params
	const { app_id: appId, guild_id: guildId, command_id: commandId } = request.params as {
		app_id: string
		guild_id: string
		command_id: string
	}

	// 3. Validate app_id matches session's application ID
	if (appId !== session.state.applicationId) {
		return new Response(JSON.stringify({ message: 'Missing Access', code: 50001 }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 5. Get the command
	const command = session.state.getCommand(commandId)

	// 6. Validate command exists and belongs to this guild
	if (!command || command.guild_id !== guildId) {
		return new Response(JSON.stringify({ message: 'Unknown Application Command', code: 10063 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle GET - Get guild command
	if (request.method === 'GET') {
		// Parse with_localizations query param (defaults to false per Discord API)
		const url = new URL(request.url)
		const withLocalizations = url.searchParams.get('with_localizations') === 'true'

		return mockCommandToAPICommand(command, { withLocalizations })
	}

	// Handle PATCH - Edit guild command
	if (request.method === 'PATCH') {
		let body: Partial<MockApplicationCommandConfig>

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name if provided
		if (body.name !== undefined) {
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

			// Validate name pattern for CHAT_INPUT
			if (command.type === ApplicationCommandType.ChatInput) {
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

			// Check for duplicate name in guild (excluding self)
			const existingCommand = session.state.findCommandByName(body.name, guildId)
			if (existingCommand && existingCommand.id !== commandId) {
				return new Response(
					JSON.stringify({
						error: 'A command with this name already exists',
						code: 50035
					}),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		}

		// Validate description if provided
		if (body.description !== undefined && command.type === ApplicationCommandType.ChatInput) {
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
		}

		// Validate options count if provided
		if (body.options !== undefined && body.options.length > CommandLimits.MAX_OPTIONS) {
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

		// Update the command
		const updated = session.state.updateCommand(commandId, body)

		if (!updated) {
			return new Response(JSON.stringify({ message: 'Failed to update command', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'rest_request',
			{
				command_id: commandId,
				command_name: updated.name,
				guild_id: guildId,
				scope: 'guild'
			},
			{
				endpoint: `PATCH /applications/${appId}/guilds/${guildId}/commands/${commandId}`,
				method: 'PATCH'
			}
		)

		return new Response(JSON.stringify(mockCommandToAPICommand(updated)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle DELETE - Delete guild command
	if (request.method === 'DELETE') {
		const deleted = session.state.deleteCommand(commandId)

		if (!deleted) {
			return new Response(JSON.stringify({ message: 'Unknown Application Command', code: 10063 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'rest_request',
			{
				command_id: commandId,
				guild_id: guildId,
				scope: 'guild'
			},
			{
				endpoint: `DELETE /applications/${appId}/guilds/${guildId}/commands/${commandId}`,
				method: 'DELETE'
			}
		)

		return new Response(null, { status: 204 })
	}

	// Method not allowed
	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}
