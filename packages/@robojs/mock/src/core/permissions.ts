/**
 * Permission calculation and enforcement utilities for Discord Mock Server
 *
 * Implements Discord's permission calculation algorithm:
 * 1. Start with @everyone role permissions
 * 2. Apply all member role permissions (OR together)
 * 3. Administrator bypasses all checks
 * 4. Apply channel overwrites in order: @everyone, role overwrites, member overwrite
 */

import { PermissionFlagsBits } from 'discord-api-types/v10'
import type { Snowflake } from 'discord-api-types/v10'
import type { MockGuild, MockChannel, MockGuildMember, MockRole } from '../types/index.js'
import { OverwriteType } from '../types/index.js'

// Re-export for convenience
export { PermissionFlagsBits }

/**
 * All permission bits combined (for administrator bypass)
 */
const ALL_PERMISSIONS = BigInt('0xFFFFFFFFFFFFFFFF')

/**
 * Permission flag names for human-readable output
 */
const PERMISSION_NAMES: Record<string, bigint> = {
	CreateInstantInvite: PermissionFlagsBits.CreateInstantInvite,
	KickMembers: PermissionFlagsBits.KickMembers,
	BanMembers: PermissionFlagsBits.BanMembers,
	Administrator: PermissionFlagsBits.Administrator,
	ManageChannels: PermissionFlagsBits.ManageChannels,
	ManageGuild: PermissionFlagsBits.ManageGuild,
	AddReactions: PermissionFlagsBits.AddReactions,
	ViewAuditLog: PermissionFlagsBits.ViewAuditLog,
	PrioritySpeaker: PermissionFlagsBits.PrioritySpeaker,
	Stream: PermissionFlagsBits.Stream,
	ViewChannel: PermissionFlagsBits.ViewChannel,
	SendMessages: PermissionFlagsBits.SendMessages,
	SendTTSMessages: PermissionFlagsBits.SendTTSMessages,
	ManageMessages: PermissionFlagsBits.ManageMessages,
	EmbedLinks: PermissionFlagsBits.EmbedLinks,
	AttachFiles: PermissionFlagsBits.AttachFiles,
	ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
	MentionEveryone: PermissionFlagsBits.MentionEveryone,
	UseExternalEmojis: PermissionFlagsBits.UseExternalEmojis,
	ViewGuildInsights: PermissionFlagsBits.ViewGuildInsights,
	Connect: PermissionFlagsBits.Connect,
	Speak: PermissionFlagsBits.Speak,
	MuteMembers: PermissionFlagsBits.MuteMembers,
	DeafenMembers: PermissionFlagsBits.DeafenMembers,
	MoveMembers: PermissionFlagsBits.MoveMembers,
	UseVAD: PermissionFlagsBits.UseVAD,
	ChangeNickname: PermissionFlagsBits.ChangeNickname,
	ManageNicknames: PermissionFlagsBits.ManageNicknames,
	ManageRoles: PermissionFlagsBits.ManageRoles,
	ManageWebhooks: PermissionFlagsBits.ManageWebhooks,
	ManageGuildExpressions: PermissionFlagsBits.ManageGuildExpressions,
	UseApplicationCommands: PermissionFlagsBits.UseApplicationCommands,
	RequestToSpeak: PermissionFlagsBits.RequestToSpeak,
	ManageEvents: PermissionFlagsBits.ManageEvents,
	ManageThreads: PermissionFlagsBits.ManageThreads,
	CreatePublicThreads: PermissionFlagsBits.CreatePublicThreads,
	CreatePrivateThreads: PermissionFlagsBits.CreatePrivateThreads,
	UseExternalStickers: PermissionFlagsBits.UseExternalStickers,
	SendMessagesInThreads: PermissionFlagsBits.SendMessagesInThreads,
	UseEmbeddedActivities: PermissionFlagsBits.UseEmbeddedActivities,
	ModerateMembers: PermissionFlagsBits.ModerateMembers,
	ViewCreatorMonetizationAnalytics: PermissionFlagsBits.ViewCreatorMonetizationAnalytics,
	UseSoundboard: PermissionFlagsBits.UseSoundboard,
	UseExternalSounds: PermissionFlagsBits.UseExternalSounds,
	SendVoiceMessages: PermissionFlagsBits.SendVoiceMessages
}

/**
 * Compute base permissions for a member in a guild (without channel overwrites)
 *
 * @param member - The guild member
 * @param guild - The guild
 * @param roles - All roles in the guild
 * @returns The computed base permission bitfield
 */
export function computeBasePermissions(
	member: MockGuildMember,
	guild: MockGuild,
	roles: MockRole[]
): bigint {
	// Guild owner has all permissions
	if (member.userId === guild.ownerId) {
		return ALL_PERMISSIONS
	}

	// Start with @everyone role permissions
	const everyoneRole = roles.find((r) => r.id === guild.id)
	let permissions = BigInt(everyoneRole?.permissions || '0')

	// Apply all member role permissions (OR together)
	for (const roleId of member.roles) {
		const role = roles.find((r) => r.id === roleId)
		if (role) {
			permissions |= BigInt(role.permissions)
		}
	}

	// Administrator bypasses all
	if (permissions & PermissionFlagsBits.Administrator) {
		return ALL_PERMISSIONS
	}

	return permissions
}

/**
 * Compute permissions for a member in a specific channel
 *
 * @param member - The guild member
 * @param channel - The channel
 * @param guild - The guild
 * @param roles - All roles in the guild
 * @returns The computed permission bitfield
 */
export function computePermissions(
	member: MockGuildMember,
	channel: MockChannel,
	guild: MockGuild,
	roles: MockRole[]
): bigint {
	// Start with base permissions
	let permissions = computeBasePermissions(member, guild, roles)

	// Administrator bypasses all channel overwrites
	if (permissions & PermissionFlagsBits.Administrator) {
		return ALL_PERMISSIONS
	}

	// Get channel overwrites
	const overwrites = channel.permissionOverwrites || []
	if (overwrites.length === 0) {
		return permissions
	}

	// 1. Apply @everyone overwrite
	const everyoneOverwrite = overwrites.find((o) => o.id === guild.id)
	if (everyoneOverwrite) {
		permissions &= ~BigInt(everyoneOverwrite.deny)
		permissions |= BigInt(everyoneOverwrite.allow)
	}

	// 2. Apply role overwrites (OR together)
	let roleAllow = 0n
	let roleDeny = 0n
	for (const roleId of member.roles) {
		const overwrite = overwrites.find((o) => o.id === roleId && o.type === OverwriteType.Role)
		if (overwrite) {
			roleAllow |= BigInt(overwrite.allow)
			roleDeny |= BigInt(overwrite.deny)
		}
	}
	permissions &= ~roleDeny
	permissions |= roleAllow

	// 3. Apply member overwrite
	const memberOverwrite = overwrites.find((o) => o.id === member.userId && o.type === OverwriteType.Member)
	if (memberOverwrite) {
		permissions &= ~BigInt(memberOverwrite.deny)
		permissions |= BigInt(memberOverwrite.allow)
	}

	return permissions
}

/**
 * Check if a permission bitfield has a specific permission
 *
 * @param permissions - The permission bitfield
 * @param flag - The permission flag to check
 * @returns true if the permission is set
 */
export function hasPermission(permissions: bigint, flag: bigint): boolean {
	return (permissions & flag) === flag
}

/**
 * Check if a permission bitfield has any of the specified permissions
 *
 * @param permissions - The permission bitfield
 * @param flags - The permission flags to check
 * @returns true if any permission is set
 */
export function hasAnyPermission(permissions: bigint, ...flags: bigint[]): boolean {
	for (const flag of flags) {
		if ((permissions & flag) === flag) {
			return true
		}
	}
	return false
}

/**
 * Check if a permission bitfield has all of the specified permissions
 *
 * @param permissions - The permission bitfield
 * @param flags - The permission flags to check
 * @returns true if all permissions are set
 */
export function hasAllPermissions(permissions: bigint, ...flags: bigint[]): boolean {
	for (const flag of flags) {
		if ((permissions & flag) !== flag) {
			return false
		}
	}
	return true
}

/**
 * Get human-readable permission names from a bitfield
 *
 * @param permissions - The permission bitfield
 * @returns Array of permission names
 */
export function getPermissionNames(permissions: bigint): string[] {
	const names: string[] = []
	for (const [name, flag] of Object.entries(PERMISSION_NAMES)) {
		if ((permissions & flag) === flag) {
			names.push(name)
		}
	}
	return names
}

/**
 * Parse a permission string to bigint
 *
 * @param permissions - The permission string
 * @returns The permission bitfield as bigint
 */
export function parsePermissions(permissions: string): bigint {
	try {
		return BigInt(permissions)
	} catch {
		return 0n
	}
}

// ============================================================================
// Role Hierarchy Helpers
// ============================================================================

/**
 * Check if a user is the server owner
 *
 * @param userId - The user ID to check
 * @param guild - The guild to check against
 * @returns true if the user is the guild owner
 */
export function isServerOwner(userId: Snowflake, guild: MockGuild): boolean {
	return guild.ownerId === userId
}

/**
 * Get the highest role position for a member
 *
 * @param member - The guild member
 * @param roles - All roles in the guild
 * @returns The highest role position (0 if no roles)
 */
export function getHighestRolePosition(member: MockGuildMember, roles: MockRole[]): number {
	if (!member.roles.length) return 0
	let highest = 0
	for (const roleId of member.roles) {
		const role = roles.find((r) => r.id === roleId)
		if (role && role.position > highest) {
			highest = role.position
		}
	}
	return highest
}

/**
 * Check if an actor can perform moderation actions on a target member
 * Enforces role hierarchy: can only act on members with lower highest role
 *
 * @param actor - The member performing the action
 * @param target - The member being acted upon
 * @param guild - The guild
 * @param roles - All roles in the guild
 * @returns true if the actor can act on the target
 */
export function canActOnMember(
	actor: MockGuildMember,
	target: MockGuildMember,
	guild: MockGuild,
	roles: MockRole[]
): boolean {
	// Can't act on server owner
	if (isServerOwner(target.userId, guild)) {
		return false
	}
	// Owner can act on anyone
	if (isServerOwner(actor.userId, guild)) {
		return true
	}
	// Must have higher role position
	return getHighestRolePosition(actor, roles) > getHighestRolePosition(target, roles)
}

/**
 * Check if a member can manage a specific role
 * Enforces role hierarchy: can only manage roles below your highest role
 *
 * @param member - The member trying to manage the role
 * @param role - The role to manage
 * @param guild - The guild
 * @param roles - All roles in the guild
 * @returns true if the member can manage the role
 */
export function canManageRole(
	member: MockGuildMember,
	role: MockRole,
	guild: MockGuild,
	roles: MockRole[]
): boolean {
	// Owner can manage all roles
	if (isServerOwner(member.userId, guild)) {
		return true
	}
	// Can only manage roles below highest role position
	const memberHighest = getHighestRolePosition(member, roles)
	return role.position < memberHighest
}

/**
 * Discord error codes for permission-related issues
 */
export const DiscordErrorCodes = {
	UNKNOWN_GUILD: 10004,
	UNKNOWN_CHANNEL: 10003,
	UNKNOWN_MEMBER: 10007,
	UNKNOWN_ROLE: 10011,
	UNKNOWN_MESSAGE: 10008,
	MISSING_ACCESS: 50001,
	MISSING_PERMISSIONS: 50013,
	CANNOT_EDIT_SYSTEM_MESSAGE: 50021,
	CANNOT_EDIT_OTHER_USER_MESSAGE: 50005,
	INVALID_ROLE: 50028
} as const

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
	allowed: boolean
	code?: number
	message?: string
}

/**
 * Context for permission checking
 */
export interface PermissionContext {
	guildId: Snowflake
	channelId?: Snowflake
	member: MockGuildMember
	channel?: MockChannel
	guild: MockGuild
	roles: MockRole[]
	botUserId: Snowflake
}

/**
 * Create a permission denied result
 */
export function permissionDenied(code: number = DiscordErrorCodes.MISSING_PERMISSIONS, message: string = 'Missing Permissions'): PermissionCheckResult {
	return { allowed: false, code, message }
}

/**
 * Create a permission allowed result
 */
export function permissionAllowed(): PermissionCheckResult {
	return { allowed: true }
}

/**
 * Endpoint permission requirements mapping
 * Maps endpoint patterns to required permissions
 */
const ENDPOINT_PERMISSIONS: Record<string, { method: string; permissions: bigint[] }[]> = {
	// Channel messages
	'/channels/:id/messages': [
		{ method: 'POST', permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel] },
		{ method: 'GET', permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }
	],
	'/channels/:id/messages/:messageId': [
		{ method: 'PATCH', permissions: [PermissionFlagsBits.ViewChannel] }, // Own message or ManageMessages
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ViewChannel] } // Own message or ManageMessages
	],
	'/channels/:id/messages/bulk-delete': [
		{ method: 'POST', permissions: [PermissionFlagsBits.ManageMessages] }
	],

	// Channels
	'/channels/:id': [
		{ method: 'GET', permissions: [PermissionFlagsBits.ViewChannel] },
		{ method: 'PATCH', permissions: [PermissionFlagsBits.ManageChannels] },
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageChannels] } // Threads need ManageThreads (contextual)
	],

	// Invites
	'/channels/:id/invites': [
		{ method: 'GET', permissions: [PermissionFlagsBits.ManageChannels] },
		{ method: 'POST', permissions: [PermissionFlagsBits.CreateInstantInvite] }
	],

	// Threads
	'/channels/:id/threads': [{ method: 'POST', permissions: [PermissionFlagsBits.CreatePublicThreads] }],
	'/channels/:id/messages/:messageId/threads': [
		{ method: 'POST', permissions: [PermissionFlagsBits.CreatePublicThreads] }
	],

	// Roles
	'/guilds/:id/roles': [
		{ method: 'GET', permissions: [] }, // No special permission required
		{ method: 'POST', permissions: [PermissionFlagsBits.ManageRoles] },
		{ method: 'PATCH', permissions: [PermissionFlagsBits.ManageRoles] }
	],
	'/guilds/:id/roles/:roleId': [
		{ method: 'GET', permissions: [] },
		{ method: 'PATCH', permissions: [PermissionFlagsBits.ManageRoles] },
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageRoles] }
	],

	// Members
	'/guilds/:id/members/:userId': [
		{ method: 'GET', permissions: [] },
		{ method: 'PATCH', permissions: [] }, // Contextual: nick, roles, timeout, voice all have different requirements
		{ method: 'DELETE', permissions: [PermissionFlagsBits.KickMembers] } // Kick - hierarchy checked contextually
	],

	// Member roles
	'/guilds/:id/members/:userId/roles/:roleId': [
		{ method: 'PUT', permissions: [PermissionFlagsBits.ManageRoles] },
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageRoles] }
	],

	// Bans
	'/guilds/:id/bans': [
		{ method: 'GET', permissions: [PermissionFlagsBits.BanMembers] }
	],
	'/guilds/:id/bans/:userId': [
		{ method: 'GET', permissions: [PermissionFlagsBits.BanMembers] },
		{ method: 'PUT', permissions: [PermissionFlagsBits.BanMembers] }, // Hierarchy checked contextually
		{ method: 'DELETE', permissions: [PermissionFlagsBits.BanMembers] }
	],

	// Guild settings
	'/guilds/:id': [
		{ method: 'GET', permissions: [] },
		{ method: 'PATCH', permissions: [PermissionFlagsBits.ManageGuild] },
		{ method: 'DELETE', permissions: [] } // Owner only - checked contextually
	],

	// Channel permissions
	'/channels/:id/permissions/:overwriteId': [
		{ method: 'PUT', permissions: [PermissionFlagsBits.ManageRoles] },
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageRoles] }
	],

	// Webhooks
	'/guilds/:id/webhooks': [
		{ method: 'GET', permissions: [PermissionFlagsBits.ManageWebhooks] }
	],
	'/channels/:id/webhooks': [
		{ method: 'GET', permissions: [PermissionFlagsBits.ManageWebhooks] },
		{ method: 'POST', permissions: [PermissionFlagsBits.ManageWebhooks] }
	],
	'/webhooks/:webhookId': [
		{ method: 'GET', permissions: [] }, // Token-based access
		{ method: 'PATCH', permissions: [PermissionFlagsBits.ManageWebhooks] },
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageWebhooks] }
	],

	// Emojis
	'/guilds/:id/emojis': [
		{ method: 'GET', permissions: [] },
		{ method: 'POST', permissions: [PermissionFlagsBits.ManageGuildExpressions] }
	],
	'/guilds/:id/emojis/:emojiId': [
		{ method: 'GET', permissions: [] },
		{ method: 'PATCH', permissions: [PermissionFlagsBits.ManageGuildExpressions] },
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageGuildExpressions] }
	],

	// Stickers
	'/guilds/:id/stickers': [
		{ method: 'GET', permissions: [] },
		{ method: 'POST', permissions: [PermissionFlagsBits.ManageGuildExpressions] }
	],
	'/guilds/:id/stickers/:stickerId': [
		{ method: 'GET', permissions: [] },
		{ method: 'PATCH', permissions: [PermissionFlagsBits.ManageGuildExpressions] },
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageGuildExpressions] }
	],

	// Reactions
	'/channels/:id/messages/:messageId/reactions/:emoji/@me': [
		{ method: 'PUT', permissions: [PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory] },
		{ method: 'DELETE', permissions: [] }
	],
	'/channels/:id/messages/:messageId/reactions/:emoji/:userId': [
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageMessages] }
	],
	'/channels/:id/messages/:messageId/reactions/:emoji': [
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageMessages] } // Delete all reactions for emoji
	],
	'/channels/:id/messages/:messageId/reactions': [
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageMessages] } // Delete all reactions
	],

	// Pins
	'/channels/:id/pins': [{ method: 'GET', permissions: [PermissionFlagsBits.ViewChannel] }],
	'/channels/:id/pins/:messageId': [
		{ method: 'PUT', permissions: [PermissionFlagsBits.ManageMessages] },
		{ method: 'DELETE', permissions: [PermissionFlagsBits.ManageMessages] }
	],

	// Interactions
	'/interactions/:id/:token/callback': [{ method: 'POST', permissions: [] }],
	'/webhooks/:appId/:token/messages/:messageId': [
		{ method: 'GET', permissions: [] },
		{ method: 'PATCH', permissions: [] },
		{ method: 'DELETE', permissions: [] }
	]
}

/**
 * Match a path against endpoint patterns
 */
function matchEndpointPattern(path: string): string | null {
	// Normalize path: remove /api/v10 prefix if present
	let normalizedPath = path
	if (normalizedPath.startsWith('/api/v10')) {
		normalizedPath = normalizedPath.replace('/api/v10', '')
	}

	// Try exact patterns first
	for (const pattern of Object.keys(ENDPOINT_PERMISSIONS)) {
		const regex = patternToRegex(pattern)
		if (regex.test(normalizedPath)) {
			return pattern
		}
	}

	return null
}

/**
 * Convert an endpoint pattern to a regex
 */
function patternToRegex(pattern: string): RegExp {
	const regexStr = pattern.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/')
	return new RegExp(`^${regexStr}$`)
}

/**
 * Check if a request has permission to access an endpoint
 *
 * @param context - Permission context with member, guild, channel info
 * @param method - HTTP method
 * @param path - Request path
 * @param body - Optional request body (for message author checks, etc.)
 * @returns Permission check result
 */
export function checkEndpointPermission(
	context: PermissionContext,
	method: string,
	path: string,
	_body?: unknown
): PermissionCheckResult {
	const pattern = matchEndpointPattern(path)

	// If no pattern match, allow (unknown endpoint)
	if (!pattern) {
		return permissionAllowed()
	}

	const endpointConfig = ENDPOINT_PERMISSIONS[pattern]
	const methodConfig = endpointConfig?.find((c) => c.method === method)

	// If no method config, allow (method not restricted)
	if (!methodConfig) {
		return permissionAllowed()
	}

	// If no permissions required, allow
	if (methodConfig.permissions.length === 0) {
		return permissionAllowed()
	}

	// Compute member permissions
	let permissions: bigint
	if (context.channel) {
		permissions = computePermissions(context.member, context.channel, context.guild, context.roles)
	} else {
		permissions = computeBasePermissions(context.member, context.guild, context.roles)
	}

	// Administrator bypasses all checks
	if (hasPermission(permissions, PermissionFlagsBits.Administrator)) {
		return permissionAllowed()
	}

	// Check required permissions
	for (const required of methodConfig.permissions) {
		if (!hasPermission(permissions, required)) {
			const missingName = Object.entries(PERMISSION_NAMES).find(([_, flag]) => flag === required)?.[0] || 'Unknown'
			return permissionDenied(
				DiscordErrorCodes.MISSING_PERMISSIONS,
				`Missing Permission: ${missingName}`
			)
		}
	}

	return permissionAllowed()
}

/**
 * Create a permission check Response for API endpoints
 */
export function createPermissionErrorResponse(result: PermissionCheckResult): Response {
	return new Response(
		JSON.stringify({
			message: result.message || 'Missing Permissions',
			code: result.code || DiscordErrorCodes.MISSING_PERMISSIONS
		}),
		{
			status: 403,
			headers: { 'Content-Type': 'application/json' }
		}
	)
}

// ============================================================================
// Permission Enforcement
// ============================================================================

/**
 * Permission enforcement level
 */
export type PermissionEnforcementLevel = 'none' | 'basic' | 'strict'

/**
 * Options for permission enforcement
 */
export interface EnforcementOptions {
	/** Enforcement level */
	level: PermissionEnforcementLevel
	/** Request body (for contextual checks) */
	body?: unknown
	/** Message ID (for edit/delete message checks) */
	messageId?: string
	/** Message author ID (for edit/delete checks - who wrote the message) */
	messageAuthorId?: string
	/** Target user ID (for moderation actions) */
	targetUserId?: string
	/** Target role ID (for role management) */
	targetRoleId?: string
}

/**
 * Extended context for enforcement checks
 */
export interface EnforcementContext extends PermissionContext {
	/** Get a message by ID from state */
	getMessage?: (id: string) => { authorId: string } | undefined
	/** Get a member by user ID from state */
	getMember?: (userId: string) => MockGuildMember | undefined
	/** Get a role by ID from state */
	getRole?: (roleId: string) => MockRole | undefined
}

/**
 * Check endpoint permission with enforcement level
 *
 * @param context - Extended permission context
 * @param method - HTTP method
 * @param path - Request path
 * @param options - Enforcement options
 * @returns Permission check result
 */
export function checkEndpointPermissionWithEnforcement(
	context: EnforcementContext,
	method: string,
	path: string,
	options: EnforcementOptions
): PermissionCheckResult {
	// 'none' level: always allow
	if (options.level === 'none') {
		return permissionAllowed()
	}

	// Owner bypass (all levels when user is owner)
	if (isServerOwner(context.botUserId, context.guild)) {
		return permissionAllowed()
	}

	// Basic permission check first
	const basicResult = checkEndpointPermission(context, method, path, options.body)
	if (!basicResult.allowed) {
		return basicResult
	}

	// 'basic' level: just basic permission checks (no hierarchy/context)
	if (options.level === 'basic') {
		return permissionAllowed()
	}

	// 'strict' level: full contextual and hierarchy checks
	return checkContextualPermissions(context, method, path, options)
}

/**
 * Check contextual permissions for strict enforcement mode
 * Handles special cases like:
 * - Message edit/delete: own message vs others
 * - Reaction removal: own vs others
 * - Member kick/ban: role hierarchy
 * - Role assignment: role hierarchy
 * - Thread DELETE: ManageThreads instead of ManageChannels
 * - Guild DELETE: Owner only
 * - Voice permissions: MoveMembers, MuteMembers, DeafenMembers
 * - SendMessagesInThreads for thread channels
 */
function checkContextualPermissions(
	context: EnforcementContext,
	method: string,
	path: string,
	options: EnforcementOptions
): PermissionCheckResult {
	// Normalize path
	let normalizedPath = path
	if (normalizedPath.startsWith('/api/v10')) {
		normalizedPath = normalizedPath.replace('/api/v10', '')
	}

	// Compute member permissions for additional checks
	let permissions: bigint
	if (context.channel) {
		permissions = computePermissions(context.member, context.channel, context.guild, context.roles)
	} else {
		permissions = computeBasePermissions(context.member, context.guild, context.roles)
	}

	// === MESSAGE EDIT/DELETE CHECKS ===
	// PATCH/DELETE /channels/:id/messages/:messageId
	if (normalizedPath.match(/^\/channels\/[^/]+\/messages\/[^/]+$/) && (method === 'PATCH' || method === 'DELETE')) {
		const messageAuthorId = options.messageAuthorId
		const isOwnMessage = messageAuthorId === context.botUserId

		if (method === 'PATCH') {
			// Can only edit own messages (or suppress embeds with ManageMessages - but that's via flags)
			if (!isOwnMessage) {
				return permissionDenied(
					DiscordErrorCodes.CANNOT_EDIT_OTHER_USER_MESSAGE,
					'Cannot edit a message authored by another user'
				)
			}
		} else if (method === 'DELETE') {
			// Own message: just need ViewChannel (already checked in basic)
			// Others' message: need ManageMessages
			if (!isOwnMessage && !hasPermission(permissions, PermissionFlagsBits.ManageMessages)) {
				return permissionDenied(
					DiscordErrorCodes.MISSING_PERMISSIONS,
					'Missing Permission: ManageMessages'
				)
			}
		}
	}

	// === REACTION REMOVAL CHECKS ===
	// DELETE /channels/:id/messages/:messageId/reactions/:emoji/:userId
	const reactionMatch = normalizedPath.match(/^\/channels\/[^/]+\/messages\/[^/]+\/reactions\/[^/]+\/([^/]+)$/)
	if (reactionMatch && method === 'DELETE') {
		const targetUserId = reactionMatch[1]
		const isOwnReaction = targetUserId === '@me' || targetUserId === context.botUserId

		// Removing others' reactions requires ManageMessages
		if (!isOwnReaction && !hasPermission(permissions, PermissionFlagsBits.ManageMessages)) {
			return permissionDenied(
				DiscordErrorCodes.MISSING_PERMISSIONS,
				'Missing Permission: ManageMessages'
			)
		}
	}

	// === ROLE HIERARCHY CHECKS ===
	// PUT/DELETE /guilds/:id/members/:userId/roles/:roleId
	if (normalizedPath.match(/^\/guilds\/[^/]+\/members\/[^/]+\/roles\/[^/]+$/) && (method === 'PUT' || method === 'DELETE')) {
		if (options.targetRoleId && context.getRole) {
			const role = context.getRole(options.targetRoleId)
			if (role && !canManageRole(context.member, role, context.guild, context.roles)) {
				return permissionDenied(
					DiscordErrorCodes.INVALID_ROLE,
					'Invalid Role'
				)
			}
		}
	}

	// === ROLE CRUD HIERARCHY CHECKS ===
	// PATCH/DELETE /guilds/:id/roles/:roleId
	if (normalizedPath.match(/^\/guilds\/[^/]+\/roles\/[^/]+$/) && (method === 'PATCH' || method === 'DELETE')) {
		if (options.targetRoleId && context.getRole) {
			const role = context.getRole(options.targetRoleId)
			if (role && !canManageRole(context.member, role, context.guild, context.roles)) {
				return permissionDenied(
					DiscordErrorCodes.INVALID_ROLE,
					'Invalid Role'
				)
			}
		}
	}

	// === MEMBER MODERATION HIERARCHY CHECKS ===
	// DELETE /guilds/:id/members/:userId (kick)
	// PUT/DELETE /guilds/:id/bans/:userId (ban/unban)
	const kickMatch = normalizedPath.match(/^\/guilds\/[^/]+\/members\/([^/]+)$/)
	const banMatch = normalizedPath.match(/^\/guilds\/[^/]+\/bans\/([^/]+)$/)

	if (kickMatch && method === 'DELETE') {
		const targetUserId = options.targetUserId || kickMatch[1]
		if (targetUserId && context.getMember) {
			const targetMember = context.getMember(targetUserId)
			if (targetMember && !canActOnMember(context.member, targetMember, context.guild, context.roles)) {
				return permissionDenied(
					DiscordErrorCodes.MISSING_PERMISSIONS,
					'Missing Permissions'
				)
			}
		}
	}

	if (banMatch && method === 'PUT') {
		const targetUserId = options.targetUserId || banMatch[1]
		if (targetUserId && context.getMember) {
			const targetMember = context.getMember(targetUserId)
			// Can ban non-members, but if they're a member, check hierarchy
			if (targetMember && !canActOnMember(context.member, targetMember, context.guild, context.roles)) {
				return permissionDenied(
					DiscordErrorCodes.MISSING_PERMISSIONS,
					'Missing Permissions'
				)
			}
		}
	}

	// === MEMBER UPDATE CHECKS ===
	// PATCH /guilds/:id/members/:userId
	const memberPatchMatch = normalizedPath.match(/^\/guilds\/[^/]+\/members\/([^/]+)$/)
	if (memberPatchMatch && method === 'PATCH' && options.body) {
		const targetUserId = options.targetUserId || memberPatchMatch[1]
		const body = options.body as Record<string, unknown>

		// Changing nickname
		if ('nick' in body) {
			if (targetUserId === context.botUserId) {
				// Own nickname: need ChangeNickname
				if (!hasPermission(permissions, PermissionFlagsBits.ChangeNickname)) {
					return permissionDenied(
						DiscordErrorCodes.MISSING_PERMISSIONS,
						'Missing Permission: ChangeNickname'
					)
				}
			} else {
				// Others' nickname: need ManageNicknames + hierarchy
				if (!hasPermission(permissions, PermissionFlagsBits.ManageNicknames)) {
					return permissionDenied(
						DiscordErrorCodes.MISSING_PERMISSIONS,
						'Missing Permission: ManageNicknames'
					)
				}
				if (context.getMember) {
					const targetMember = context.getMember(targetUserId)
					if (targetMember && !canActOnMember(context.member, targetMember, context.guild, context.roles)) {
						return permissionDenied(
							DiscordErrorCodes.MISSING_PERMISSIONS,
							'Missing Permissions'
						)
					}
				}
			}
		}

		// Changing roles
		if ('roles' in body && context.getMember && context.getRole) {
			const targetMember = context.getMember(targetUserId)
			if (targetMember) {
				const newRoles = body.roles as string[]
				const addedRoles = newRoles.filter((r) => !targetMember.roles.includes(r))
				const removedRoles = targetMember.roles.filter((r) => !newRoles.includes(r))

				// Check hierarchy for each role being added/removed
				for (const roleId of [...addedRoles, ...removedRoles]) {
					const role = context.getRole(roleId)
					if (role && !canManageRole(context.member, role, context.guild, context.roles)) {
						return permissionDenied(
							DiscordErrorCodes.INVALID_ROLE,
							'Invalid Role'
						)
					}
				}
			}
		}

		// Timeout (communication_disabled_until)
		if ('communication_disabled_until' in body) {
			if (!hasPermission(permissions, PermissionFlagsBits.ModerateMembers)) {
				return permissionDenied(
					DiscordErrorCodes.MISSING_PERMISSIONS,
					'Missing Permission: ModerateMembers'
				)
			}
			if (context.getMember) {
				const targetMember = context.getMember(targetUserId)
				if (targetMember && !canActOnMember(context.member, targetMember, context.guild, context.roles)) {
					return permissionDenied(
						DiscordErrorCodes.MISSING_PERMISSIONS,
						'Missing Permissions'
					)
				}
			}
		}

		// === VOICE PERMISSIONS (channel_id, mute, deaf) ===
		// Moving to different voice channel
		if ('channel_id' in body) {
			if (!hasPermission(permissions, PermissionFlagsBits.MoveMembers)) {
				return permissionDenied(
					DiscordErrorCodes.MISSING_PERMISSIONS,
					'Missing Permission: MoveMembers'
				)
			}
		}

		// Muting
		if ('mute' in body) {
			if (!hasPermission(permissions, PermissionFlagsBits.MuteMembers)) {
				return permissionDenied(
					DiscordErrorCodes.MISSING_PERMISSIONS,
					'Missing Permission: MuteMembers'
				)
			}
		}

		// Deafening
		if ('deaf' in body) {
			if (!hasPermission(permissions, PermissionFlagsBits.DeafenMembers)) {
				return permissionDenied(
					DiscordErrorCodes.MISSING_PERMISSIONS,
					'Missing Permission: DeafenMembers'
				)
			}
		}
	}

	// === THREAD DELETE CHECK ===
	// DELETE /channels/:id - Threads need ManageThreads, not ManageChannels
	if (normalizedPath.match(/^\/channels\/[^/]+$/) && method === 'DELETE') {
		// Check if channel is a thread (types 10, 11, 12)
		if (context.channel && (context.channel.type === 10 || context.channel.type === 11 || context.channel.type === 12)) {
			if (!hasPermission(permissions, PermissionFlagsBits.ManageThreads)) {
				return permissionDenied(
					DiscordErrorCodes.MISSING_PERMISSIONS,
					'Missing Permission: ManageThreads'
				)
			}
		}
	}

	// === GUILD DELETE CHECK ===
	// DELETE /guilds/:id - Only owner can delete guild
	if (normalizedPath.match(/^\/guilds\/[^/]+$/) && method === 'DELETE') {
		if (!isServerOwner(context.botUserId, context.guild)) {
			return permissionDenied(
				DiscordErrorCodes.MISSING_PERMISSIONS,
				'Missing Permissions'
			)
		}
	}

	// === MESSAGE POST IN THREAD CHECK ===
	// POST /channels/:id/messages - Threads need SendMessagesInThreads
	if (normalizedPath.match(/^\/channels\/[^/]+\/messages$/) && method === 'POST') {
		// Check if channel is a thread (types 10, 11, 12)
		if (context.channel && (context.channel.type === 10 || context.channel.type === 11 || context.channel.type === 12)) {
			if (!hasPermission(permissions, PermissionFlagsBits.SendMessagesInThreads)) {
				return permissionDenied(
					DiscordErrorCodes.MISSING_PERMISSIONS,
					'Missing Permission: SendMessagesInThreads'
				)
			}
		}
	}

	return permissionAllowed()
}
