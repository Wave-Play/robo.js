import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { notFound, badRequest } from '../../../utils.js'
import type { PermissionOverride } from '../../../../../types/index.js'

/**
 * GET/POST /api/control/sessions/:id/permissions/overrides
 *
 * GET Response:
 * {
 *   overrides: PermissionOverride[],
 *   count: number
 * }
 *
 * POST Request body:
 * {
 *   user_id: string,           // Required: User ID or '*' for all users
 *   channel_id?: string,       // Optional: Channel scope
 *   guild_id?: string,         // Optional: Guild scope
 *   permissions: Record<string, 'grant' | 'deny' | 'inherit'>,
 *   expires_in?: number,       // Optional: TTL in seconds
 *   reason?: string            // Optional: Note about the override
 * }
 *
 * POST Response:
 * {
 *   success: true,
 *   override: PermissionOverride
 * }
 *
 * DELETE (clear all):
 * Response: { success: true, cleared: number }
 *
 * @see Permissions Admin UI
 */
function resolveSession(request: RoboRequest) {
	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id) ?? sessionManager.getByToken(id)

	if (!session) {
		return notFound('Session not found')
	}

	return { session }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const overrides = session.getPermissionOverrides()

	return {
		overrides: overrides.map(formatOverrideForResponse),
		count: overrides.length
	}
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	const count = session.getPermissionOverrides().length
	session.clearPermissionOverrides()

	return {
		success: true,
		cleared: count
	}
}

export async function POST(request: RoboRequest) {
	const resolved = resolveSession(request)
	if (resolved instanceof Response) return resolved
	const { session } = resolved

	let body: {
		user_id?: string
		channel_id?: string
		guild_id?: string
		permissions?: Record<string, 'grant' | 'deny' | 'inherit'>
		expires_in?: number
		reason?: string
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Validate required fields
	if (!body.user_id) {
		return badRequest('user_id is required')
	}

	if (!body.permissions || typeof body.permissions !== 'object') {
		return badRequest('permissions is required and must be an object')
	}

	// Validate permission values
	const validValues = ['grant', 'deny', 'inherit']
	for (const [permName, value] of Object.entries(body.permissions)) {
		if (!validValues.includes(value)) {
			return badRequest(`Invalid permission value for ${permName}: must be 'grant', 'deny', or 'inherit'`)
		}
	}

	// Calculate expiration timestamp if TTL provided
	let expiresAt: number | null = null
	if (body.expires_in && typeof body.expires_in === 'number' && body.expires_in > 0) {
		expiresAt = Date.now() + body.expires_in * 1000
	}

	// Add the override
	const override = session.addPermissionOverride({
		userId: body.user_id,
		channelId: body.channel_id ?? null,
		guildId: body.guild_id ?? null,
		permissions: body.permissions,
		expiresAt,
		reason: body.reason
	})

	return {
		success: true,
		override: formatOverrideForResponse(override)
	}
}

/**
 * Format a PermissionOverride for API response
 * Converts camelCase to snake_case for consistency with Discord API
 */
function formatOverrideForResponse(override: PermissionOverride) {
	return {
		id: override.id,
		user_id: override.userId,
		channel_id: override.channelId,
		guild_id: override.guildId,
		permissions: override.permissions,
		expires_at: override.expiresAt,
		created_at: override.createdAt,
		reason: override.reason
	}
}
