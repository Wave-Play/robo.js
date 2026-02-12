import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockRoleToAPIRole } from '../../../../discord/payloads.js'
import { RoleLimits } from '../../../../types/index.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'

/**
 * GET /api/v10/guilds/:id/roles - List all roles for a guild
 * POST /api/v10/guilds/:id/roles - Create a guild role
 * PATCH /api/v10/guilds/:id/roles - Modify role positions (batch)
 *
 * @see https://discord.com/developers/docs/resources/guild#get-guild-roles
 * @see https://discord.com/developers/docs/resources/guild#create-guild-role
 * @see https://discord.com/developers/docs/resources/guild#modify-guild-role-positions
 */

function resolveGuild(request: RoboRequest) {
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

	// 2. Extract guild ID from params
	const { id: guildId } = request.params as { id: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveGuild(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId } = resolved

	const roles = session.state.getGuildRoles(guildId)
	return roles.map(mockRoleToAPIRole)
}

export async function POST(request: RoboRequest) {
	const resolved = resolveGuild(request)
	if (resolved instanceof Response) return resolved
	const { session, guild, guildId } = resolved

	// Check permissions
	const permError = enforcePermissions(
		session,
		'POST',
		`/guilds/${guildId}/roles`,
		undefined,
		guildId
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
	} = {}

	// Body is optional for POST
	try {
		const text = await request.text()
		if (text) {
			body = JSON.parse(text)
		}
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
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

	// Check guild role limit
	if (guild.roles.length >= RoleLimits.MAX_ROLES_PER_GUILD) {
		return new Response(
			JSON.stringify({
				error: `Guild has reached maximum role limit of ${RoleLimits.MAX_ROLES_PER_GUILD}`,
				code: 30005
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Get audit log reason from header (may be URL-encoded)
	const rawReason = request.headers.get('X-Audit-Log-Reason')
	const reason = rawReason ? decodeURIComponent(rawReason) : undefined

	// Create the role
	const role = session.state.createGuildRole(guildId, {
		name: body.name,
		permissions: body.permissions,
		color,
		hoist: body.hoist,
		icon: body.icon,
		unicodeEmoji: body.unicode_emoji,
		mentionable: body.mentionable,
		reason
	})

	if (!role) {
		return new Response(JSON.stringify({ message: 'Failed to create role', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'role_created',
		{
			role_id: role.id,
			guild_id: guildId,
			name: role.name
		},
		{
			endpoint: `POST /guilds/${guildId}/roles`,
			method: 'POST'
		}
	)

	// Dispatch GUILD_ROLE_CREATE event
	await session.dispatchGuildRoleCreate(guildId, role)

	return new Response(JSON.stringify(mockRoleToAPIRole(role)), {
		status: 200, // Discord returns 200, not 201
		headers: { 'Content-Type': 'application/json' }
	})
}

export async function PATCH(request: RoboRequest) {
	const resolved = resolveGuild(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId } = resolved

	// Check permissions
	const permError = enforcePermissions(
		session,
		'PATCH',
		`/guilds/${guildId}/roles`,
		undefined,
		guildId
	)
	if (permError) return permError

	let body: Array<{ id: string; position?: number }>

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (!Array.isArray(body)) {
		return new Response(JSON.stringify({ message: 'Expected array of role positions', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Build positions array
	const positions = body
		.filter((item) => item.position !== undefined)
		.map((item) => ({
			id: item.id,
			position: item.position!
		}))

	// Update positions
	session.state.updateGuildRolePositions(guildId, positions)

	// Record action
	session.recordAction(
		'role_positions_updated',
		{
			guild_id: guildId,
			positions
		},
		{
			endpoint: `PATCH /guilds/${guildId}/roles`,
			method: 'PATCH'
		}
	)

	// Return all roles with updated positions
	const roles = session.state.getGuildRoles(guildId)
	return roles.map(mockRoleToAPIRole)
}
