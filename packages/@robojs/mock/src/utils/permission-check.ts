/**
 * Permission enforcement helper for REST API endpoints
 *
 * Provides a simple utility function that endpoints can call to enforce permissions
 * based on the session's configured enforcement level.
 */

import type { Session } from '../session/session.js'
import type { MockServerState } from '../session/state.js'
import type { EnforcementContext, EnforcementOptions, PermissionEnforcementLevel } from '../core/permissions.js'
import {
	checkEndpointPermissionWithEnforcement,
	createPermissionErrorResponse
} from '../core/permissions.js'

/**
 * Options for enforcing permissions on an endpoint
 */
export interface EnforcePermissionsOptions {
	/** Request body (for contextual checks like role changes) */
	body?: unknown
	/** Message ID being operated on */
	messageId?: string
	/** Author ID of the message (for edit/delete checks) */
	messageAuthorId?: string
	/** Target user ID (for moderation actions) */
	targetUserId?: string
	/** Target role ID (for role management) */
	targetRoleId?: string
}

/**
 * Build permission context from session state
 *
 * @param state - Session state
 * @param channelId - Channel ID (optional - for channel-specific permissions)
 * @param guildId - Guild ID (optional - will be derived from channel if not provided)
 * @returns Permission context or null if not in a guild context
 */
function buildPermissionContext(
	state: MockServerState,
	channelId?: string,
	guildId?: string
): EnforcementContext | null {
	// Get channel and derive guild if needed
	const channel = channelId ? state.getChannel(channelId) : undefined
	const resolvedGuildId = guildId || channel?.guildId

	// If no guild context, can't enforce guild permissions
	if (!resolvedGuildId) {
		return null
	}

	// Get guild
	const guild = state.getGuild(resolvedGuildId)
	if (!guild) {
		return null
	}

	// Get bot member in guild
	const botMember = state.getGuildMember(resolvedGuildId, state.botUser.id)
	if (!botMember) {
		return null
	}

	// Get all roles for the guild
	const roles = state.getGuildRoles(resolvedGuildId)

	return {
		guildId: resolvedGuildId,
		channelId,
		member: botMember,
		channel,
		guild,
		roles,
		botUserId: state.botUser.id,
		// State accessors for contextual checks
		getMessage: (id: string) => state.getMessage(id),
		getMember: (userId: string) => state.getGuildMember(resolvedGuildId, userId),
		getRole: (roleId: string) => state.getGuildRole(resolvedGuildId, roleId)
	}
}

/**
 * Enforce permissions for an API endpoint
 *
 * Call this at the beginning of your endpoint handler. If it returns a Response,
 * return that response immediately (permission denied). If it returns null,
 * permission is granted and you can continue.
 *
 * @param session - The session making the request
 * @param method - HTTP method (GET, POST, PATCH, DELETE, PUT)
 * @param path - Request path (e.g., '/channels/123/messages')
 * @param channelId - Channel ID for channel-specific permissions (optional)
 * @param guildId - Guild ID (optional - derived from channel if not provided)
 * @param options - Additional options for contextual checks
 * @returns Response if permission denied, null if granted
 *
 * @example
 * ```typescript
 * export default async (request: RoboRequest) => {
 *   const session = getSession(request)
 *   const channelId = request.params.id
 *
 *   // Check permissions
 *   const permError = enforcePermissions(
 *     session,
 *     'POST',
 *     `/channels/${channelId}/messages`,
 *     channelId
 *   )
 *   if (permError) return permError
 *
 *   // Permission granted, continue with handler...
 * }
 * ```
 */
export function enforcePermissions(
	session: Session,
	method: string,
	path: string,
	channelId?: string,
	guildId?: string,
	options?: EnforcePermissionsOptions
): Response | null {
	// Get enforcement level from session (uses runtime value if set, else config default)
	const level: PermissionEnforcementLevel = session.permissionEnforcement

	// 'none' level: skip all checks
	if (level === 'none') {
		return null
	}

	// Build permission context from session state
	const context = buildPermissionContext(session.state, channelId, guildId)

	// If no guild context (DM or missing data), allow the request
	// DMs don't have guild permissions
	if (!context) {
		return null
	}

	// Build enforcement options
	const enforcementOptions: EnforcementOptions = {
		level,
		body: options?.body,
		messageId: options?.messageId,
		messageAuthorId: options?.messageAuthorId,
		targetUserId: options?.targetUserId,
		targetRoleId: options?.targetRoleId
	}

	// Check permissions
	const result = checkEndpointPermissionWithEnforcement(context, method, path, enforcementOptions)

	// If denied, record the event and return error response
	if (!result.allowed) {
		// Extract missing permissions from message (format: "Missing Permission: PermName")
		const missingPermissions = extractMissingPermissions(result.message || '')

		// Record the denied event for Stage UI display
		session.recordPermissionDenied({
			method,
			path,
			missingPermissions,
			code: result.code || 50013,
			message: result.message || 'Missing Permissions',
			channelId,
			guildId: context.guildId
		})

		return createPermissionErrorResponse(result)
	}

	// Permission granted
	return null
}

/**
 * Extract permission names from error message
 * Handles formats like "Missing Permission: SendMessages" or "Missing Permissions"
 */
function extractMissingPermissions(message: string): string[] {
	// Try to extract specific permission name from message
	const match = message.match(/Missing Permission: (\w+)/)
	if (match) {
		return [match[1]]
	}

	// Check for generic "Missing Permissions" message
	if (message.includes('Missing Permissions')) {
		return ['Unknown']
	}

	// Check for other error types like "Invalid Role"
	if (message.includes('Invalid Role')) {
		return ['ManageRoles']
	}

	// Check for message editing errors
	if (message.includes('Cannot edit a message authored by another user')) {
		return ['ManageMessages']
	}

	return ['Unknown']
}

/**
 * Get the current permission enforcement level for a session
 *
 * @param session - The session
 * @returns The enforcement level ('none', 'basic', or 'strict')
 */
export function getEnforcementLevel(session: Session): PermissionEnforcementLevel {
	return session.permissionEnforcement
}
