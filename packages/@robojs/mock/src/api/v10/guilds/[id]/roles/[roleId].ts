import { define } from '@robojs/server'
import { z } from 'zod'
import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockRoleToAPIRole } from '../../../../../discord/payloads.js'
import { RoleLimits } from '../../../../../types/index.js'
import { enforcePermissions } from '../../../../../utils/permission-check.js'

const RoleTagsSchema = z
	.object({
		premium_subscriber: z.null().optional(),
		bot_id: z.string().optional(),
		integration_id: z.string().optional(),
		subscription_listing_id: z.string().optional(),
		available_for_purchase: z.null().optional(),
		guild_connections: z.null().optional()
	})
	.passthrough()

const RoleColorsSchema = z
	.object({
		primary_color: z.number().int(),
		secondary_color: z.number().int().nullable(),
		tertiary_color: z.number().int().nullable()
	})
	.passthrough()

const GuildRoleResponseSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		permissions: z.string(),
		position: z.number().int(),
		color: z.number().int(),
		colors: RoleColorsSchema,
		hoist: z.boolean(),
		managed: z.boolean(),
		mentionable: z.boolean(),
		icon: z.string().nullable(),
		unicode_emoji: z.string().nullable(),
		tags: RoleTagsSchema.optional(),
		flags: z.number().int()
	})
	.passthrough()

const UpdateRoleRequestPartialSchema = z
	.object({
		name: z.string().max(100).nullable().optional(),
		permissions: z.number().int().nullable().optional(),
		color: z.number().int().min(0).max(16777215).nullable().optional(),
		colors: z
			.object({})
			.passthrough()
			.nullable()
			.optional(),
		hoist: z.boolean().nullable().optional(),
		mentionable: z.boolean().nullable().optional(),
		icon: z.string().nullable().optional(),
		unicode_emoji: z.string().max(100).nullable().optional()
	})
	.passthrough()

/**
 * GET /api/v10/guilds/:id/roles/:roleId - Get a guild role
 * PATCH /api/v10/guilds/:id/roles/:roleId - Modify a guild role
 * DELETE /api/v10/guilds/:id/roles/:roleId - Delete a guild role
 *
 * @see https://discord.com/developers/docs/resources/guild#get-guild-role
 * @see https://discord.com/developers/docs/resources/guild#modify-guild-role
 * @see https://discord.com/developers/docs/resources/guild#delete-guild-role
 */

function resolveGuildRole(request: RoboRequest) {
	// 1. Parse Authorization header -> get session
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

	// 2. Extract IDs from params
	const { id: guildId, roleId } = request.params as { id: string; roleId: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Validate role exists
	const role = session.state.getGuildRole(guildId, roleId)
	if (!role) {
		return new Response(JSON.stringify({ message: 'Unknown Role', code: 10011 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId, roleId, role }
}

export const GET = define(
	{
		summary: 'Get guild role',
		tags: ['Guild Roles'],
		params: z.object({ id: z.string().describe('Guild ID (Snowflake)'), roleId: z.string().describe('Role ID (Snowflake)') }),
		response: {
			200: GuildRoleResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuildRole(request)
		if (resolved instanceof Response) return resolved
		const { role } = resolved

		return mockRoleToAPIRole(role)
	}
)

export const PATCH = define(
	{
		summary: 'Modify guild role',
		tags: ['Guild Roles'],
		params: z.object({ id: z.string().describe('Guild ID (Snowflake)'), roleId: z.string().describe('Role ID (Snowflake)') }),
		body: UpdateRoleRequestPartialSchema,
		response: {
			200: GuildRoleResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuildRole(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId, roleId, role } = resolved

		// Check permissions for PATCH
		const permError = enforcePermissions(
			session,
			'PATCH',
			`/guilds/${guildId}/roles/${roleId}`,
			undefined,
			guildId,
			{ targetRoleId: roleId }
		)
		if (permError) return permError

		let body: {
			name?: string
			permissions?: string
			color?: number
			// Discord.js 14+ sends colors as an object with primary_color, secondary_color, tertiary_color
			colors?: {
				primary_color?: number | null
				secondary_color?: number | null
				tertiary_color?: number | null
			}
			hoist?: boolean
			icon?: string | null
			unicode_emoji?: string | null
			mentionable?: boolean
			position?: number
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Check if trying to modify @everyone's protected fields
		if (role.id === guildId) {
			if (body.name !== undefined || body.hoist !== undefined) {
				return new Response(
					JSON.stringify({ message: 'Cannot modify @everyone role name or hoist', code: 50028 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		}

		// Validate name length if provided
		if (body.name !== undefined) {
			if (body.name.length < RoleLimits.MIN_NAME_LENGTH) {
				return new Response(
					JSON.stringify({ message: `Role name must be at least ${RoleLimits.MIN_NAME_LENGTH} character`, code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			if (body.name.length > RoleLimits.MAX_NAME_LENGTH) {
				return new Response(
					JSON.stringify({ message: `Role name cannot exceed ${RoleLimits.MAX_NAME_LENGTH} characters`, code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		}

		// Handle color - support both legacy 'color' and new 'colors' object from Discord.js 14+
		let color: number | undefined = body.color
		if (body.colors?.primary_color !== undefined && body.colors.primary_color !== null) {
			color = body.colors.primary_color
		}

		// Validate color if provided
		if (color !== undefined) {
			if (color < 0 || color > RoleLimits.MAX_COLOR_VALUE) {
				return new Response(
					JSON.stringify({ message: 'Invalid color value', code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		}

		// Get audit log reason from header (may be URL-encoded)
		const rawReason = request.headers.get('X-Audit-Log-Reason')
		const reason = rawReason ? decodeURIComponent(rawReason) : undefined

		// Update the role
		const updatedRole = session.state.updateGuildRole(guildId, roleId, {
			name: body.name,
			permissions: body.permissions,
			color,
			hoist: body.hoist,
			icon: body.icon,
			unicodeEmoji: body.unicode_emoji,
			mentionable: body.mentionable
		}, reason)

		if (!updatedRole) {
			return new Response(JSON.stringify({ message: 'Failed to update role', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Handle position update separately if provided
		if (body.position !== undefined) {
			session.state.updateGuildRolePositions(guildId, [{ id: roleId, position: body.position }])
		}

		// Record action
		session.recordAction(
			'role_updated',
			{
				role_id: roleId,
				guild_id: guildId,
				updates: body
			},
			{
				endpoint: `PATCH /guilds/${guildId}/roles/${roleId}`,
				method: 'PATCH'
			}
		)

		// Dispatch GUILD_ROLE_UPDATE event
		await session.dispatchGuildRoleUpdate(guildId, updatedRole)

		return mockRoleToAPIRole(updatedRole)
	}
)

export const DELETE = define(
	{
		summary: 'Delete guild role',
		tags: ['Guild Roles'],
		params: z.object({ id: z.string().describe('Guild ID (Snowflake)'), roleId: z.string().describe('Role ID (Snowflake)') }),
		response: {
			204: z.undefined()
		}
	},
	async (request) => {
		const resolved = resolveGuildRole(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId, roleId } = resolved

		// Check permissions for DELETE
		const permError = enforcePermissions(
			session,
			'DELETE',
			`/guilds/${guildId}/roles/${roleId}`,
			undefined,
			guildId,
			{ targetRoleId: roleId }
		)
		if (permError) return permError

		// Cannot delete @everyone role
		if (roleId === guildId) {
			return new Response(
				JSON.stringify({ message: 'Cannot delete @everyone role', code: 50028 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Get audit log reason from header (may be URL-encoded)
		const rawReason = request.headers.get('X-Audit-Log-Reason')
		const reason = rawReason ? decodeURIComponent(rawReason) : undefined

		const deleted = session.state.deleteGuildRole(guildId, roleId, reason)
		if (!deleted) {
			return new Response(JSON.stringify({ message: 'Failed to delete role', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'role_deleted',
			{
				role_id: roleId,
				guild_id: guildId
			},
			{
				endpoint: `DELETE /guilds/${guildId}/roles/${roleId}`,
				method: 'DELETE'
			}
		)

		// Dispatch GUILD_ROLE_DELETE event
		await session.dispatchGuildRoleDelete(guildId, roleId)

		// Discord returns 204 No Content on successful delete
		return new Response(null, { status: 204 })
	}
)
