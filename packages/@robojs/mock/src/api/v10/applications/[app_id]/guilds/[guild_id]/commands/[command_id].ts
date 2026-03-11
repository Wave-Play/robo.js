import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
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

const ApplicationCommandResponseSchema = z
	.object({
		id: z.string(),
		application_id: z.string(),
		version: z.string(),
		default_member_permissions: z.string().nullable(),
		type: z.number().int(),
		name: z.string(),
		name_localized: z.string().optional(),
		name_localizations: z.record(z.string()).nullable().optional(),
		description: z.string(),
		description_localized: z.string().optional(),
		description_localizations: z.record(z.string()).nullable().optional(),
		guild_id: z.string().optional(),
		dm_permission: z.boolean().optional(),
		contexts: z.array(z.number()).nullable().optional(),
		integration_types: z.array(z.number()).optional(),
		options: z.array(z.object({}).passthrough()).optional(),
		nsfw: z.boolean().optional()
	})
	.passthrough()

const ApplicationCommandPatchBodySchema = z
	.object({
		name: z.string().min(1).max(32).optional(),
		name_localizations: z.record(z.string()).nullable().optional(),
		description: z.string().max(100).nullable().optional(),
		description_localizations: z.record(z.string()).nullable().optional(),
		options: z.array(z.object({}).passthrough()).nullable().optional(),
		default_member_permissions: z.number().nullable().optional(),
		dm_permission: z.boolean().nullable().optional(),
		contexts: z.array(z.number()).nullable().optional(),
		integration_types: z.array(z.number()).nullable().optional(),
		handler: z.number().nullable().optional()
	})
	.passthrough()

function resolveGuildCommand(request: RoboRequest) {
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

	return { session, appId, guildId, commandId, command }
}

export const GET = define(
	{
		summary: 'Get guild application command',
		description: 'Fetch a guild command for your application',
		tags: ['Application Commands'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			guild_id: z.string().describe('The guild ID (Snowflake)'),
			command_id: z.string().describe('The command ID (Snowflake)')
		}),
		query: z.object({
			with_localizations: z.string().optional().describe('Whether to include full localization dictionaries')
		}),
		response: {
			200: ApplicationCommandResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuildCommand(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { command } = resolved

		// Parse with_localizations query param (defaults to false per Discord API)
		const url = new URL(request.url)
		const withLocalizations = url.searchParams.get('with_localizations') === 'true'

		return mockCommandToAPICommand(command, { withLocalizations })
	}
)

export const PATCH = define(
	{
		summary: 'Update guild application command',
		description: 'Edit a guild command. Returns the updated command object on success',
		tags: ['Application Commands'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			guild_id: z.string().describe('The guild ID (Snowflake)'),
			command_id: z.string().describe('The command ID (Snowflake)')
		}),
		body: ApplicationCommandPatchBodySchema,
		response: {
			200: ApplicationCommandResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuildCommand(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, appId, guildId, commandId, command } = resolved

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
)

export const DELETE = define(
	{
		summary: 'Delete guild application command',
		description: 'Delete a guild command',
		tags: ['Application Commands'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			guild_id: z.string().describe('The guild ID (Snowflake)'),
			command_id: z.string().describe('The command ID (Snowflake)')
		}),
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveGuildCommand(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, appId, guildId, commandId } = resolved

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
)
