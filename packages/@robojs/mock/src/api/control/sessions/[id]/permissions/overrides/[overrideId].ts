import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../core/manager.js'
import { notFound } from '../../../../utils.js'
import type { PermissionOverride } from '../../../../../../types/index.js'

/**
 * GET/DELETE /api/control/sessions/:id/permissions/overrides/:overrideId
 *
 * GET Response:
 * {
 *   override: PermissionOverride
 * }
 *
 * DELETE Response:
 * {
 *   success: true,
 *   deleted_id: string
 * }
 *
 * @see Permissions Admin UI
 */
function resolveSessionAndOverride(request: RoboRequest) {
	const { id, overrideId } = request.params as { id: string; overrideId: string }

	if (!id) {
		return notFound('Session ID required')
	}

	if (!overrideId) {
		return notFound('Override ID required')
	}

	const session = sessionManager.get(id) ?? sessionManager.getByToken(id)

	if (!session) {
		return notFound('Session not found')
	}

	return { session, overrideId }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveSessionAndOverride(request)
	if (resolved instanceof Response) return resolved
	const { session, overrideId } = resolved

	const override = session.getPermissionOverride(overrideId)

	if (!override) {
		return notFound('Override not found')
	}

	return {
		override: formatOverrideForResponse(override)
	}
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveSessionAndOverride(request)
	if (resolved instanceof Response) return resolved
	const { session, overrideId } = resolved

	const existed = session.removePermissionOverride(overrideId)

	if (!existed) {
		return notFound('Override not found')
	}

	return {
		success: true,
		deleted_id: overrideId
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
