import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../../../utils/id.js'
import type { MockCommandPermission } from '../../../../../../../../types/index.js'

/**
 * GET /api/v10/applications/:app_id/guilds/:guild_id/commands/:command_id/permissions
 * PUT /api/v10/applications/:app_id/guilds/:guild_id/commands/:command_id/permissions
 *
 * Note: Discord requires OAuth2 Bearer token for PUT (not Bot token).
 * Our mock server accepts Bearer tokens for testing purposes.
 *
 * @see https://discord.com/developers/docs/interactions/application-commands#get-application-command-permissions
 * @see https://discord.com/developers/docs/interactions/application-commands#edit-application-command-permissions
 */

const ApplicationCommandPermissionSchema = z.object({
	id: z.string(),
	type: z.number().int().describe('1 = Role, 2 = User, 3 = Channel'),
	permission: z.boolean()
})

const CommandPermissionsResponseSchema = z
	.object({
		id: z.string(),
		application_id: z.string(),
		guild_id: z.string(),
		permissions: z.array(ApplicationCommandPermissionSchema)
	})
	.passthrough()

function resolveCommandPermissions(request: RoboRequest) {
	// Extract params
	const { app_id: appId, guild_id: guildId, command_id: commandId } = request.params as {
		app_id: string
		guild_id: string
		command_id: string
	}

	// For PUT requests, Discord uses Bearer token (OAuth2) instead of Bot token
	// Our mock server accepts both for testing flexibility
	const authHeader = request.headers.get('Authorization') || ''

	let sessionId: string | null = null

	// Try Bot token first
	sessionId = parseMockToken(authHeader)

	// If not a Bot token, check for Bearer token format
	if (!sessionId && authHeader.startsWith('Bearer ')) {
		// For testing, we accept any Bearer token and try to find a session
		// In practice, tests should pass a valid session token
		const bearerToken = authHeader.substring(7)
		// Try to parse it as a mock token (session ID might be encoded)
		sessionId = parseMockToken(`Bot ${bearerToken}`)

		// If still not found, try direct session lookup
		if (!sessionId) {
			// For testing purposes, accept any session that matches the app ID
			for (const session of sessionManager.getAll()) {
				if (session.state.applicationId === appId) {
					sessionId = session.id
					break
				}
			}
		}
	}

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

	// Validate app_id matches session's application ID
	if (appId !== session.state.applicationId) {
		return new Response(JSON.stringify({ message: 'Missing Access', code: 50001 }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate command exists
	const command = session.state.getCommand(commandId)
	if (!command) {
		return new Response(JSON.stringify({ message: 'Unknown Application Command', code: 10063 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, appId, guildId, commandId }
}

export const GET = define(
	{
		summary: 'Get application command permissions',
		description: 'Fetches permissions for a specific command for your application in a guild',
		tags: ['Application Commands'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			guild_id: z.string().describe('The guild ID (Snowflake)'),
			command_id: z.string().describe('The command ID (Snowflake)')
		}),
		response: {
			200: CommandPermissionsResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveCommandPermissions(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, appId, guildId, commandId } = resolved

		const key = `${guildId}:${commandId}`
		const permissions = session.state.commandPermissions.get(key) || []

		return new Response(
			JSON.stringify({
				id: commandId,
				application_id: appId,
				guild_id: guildId,
				permissions: permissions.map((p) => ({
					id: p.id,
					type: p.type,
					permission: p.permission
				}))
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}
)

export const PUT = define(
	{
		summary: 'Set application command permissions',
		description: 'Edits command permissions for a specific command for your application in a guild. Requires OAuth2 Bearer token',
		tags: ['Application Commands'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)'),
			guild_id: z.string().describe('The guild ID (Snowflake)'),
			command_id: z.string().describe('The command ID (Snowflake)')
		}),
		body: z
			.object({
				permissions: z.array(ApplicationCommandPermissionSchema).max(100).nullable().optional()
			})
			.passthrough(),
		response: {
			200: CommandPermissionsResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveCommandPermissions(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, appId, guildId, commandId } = resolved

		let body: { permissions: MockCommandPermission[] }

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate permissions array
		if (!Array.isArray(body.permissions)) {
			return new Response(
				JSON.stringify({
					error: 'permissions must be an array',
					code: 50035
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate each permission entry
		for (const perm of body.permissions) {
			if (!perm.id || typeof perm.type !== 'number' || typeof perm.permission !== 'boolean') {
				return new Response(
					JSON.stringify({
						error: 'Each permission must have id, type (number), and permission (boolean)',
						code: 50035
					}),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			// Validate type is valid (1=Role, 2=User, 3=Channel)
			if (![1, 2, 3].includes(perm.type)) {
				return new Response(
					JSON.stringify({
						error: 'Permission type must be 1 (Role), 2 (User), or 3 (Channel)',
						code: 50035
					}),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		}

		// Store permissions
		const key = `${guildId}:${commandId}`
		session.state.commandPermissions.set(key, body.permissions)

		// Record action
		session.recordAction(
			'rest_request',
			{
				command_id: commandId,
				guild_id: guildId,
				permissions_count: body.permissions.length
			},
			{
				endpoint: `PUT /applications/${appId}/guilds/${guildId}/commands/${commandId}/permissions`,
				method: 'PUT'
			}
		)

		return new Response(
			JSON.stringify({
				id: commandId,
				application_id: appId,
				guild_id: guildId,
				permissions: body.permissions.map((p) => ({
					id: p.id,
					type: p.type,
					permission: p.permission
				}))
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}
)
