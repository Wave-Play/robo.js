/**
 * Settings management for guild-specific roadmap configuration.
 *
 * This module provides functions to persist and retrieve roadmap settings
 * using Robo.js's Flashcore state management. Settings are stored per-guild
 * with automatic persistence across bot restarts.
 *
 * Settings are namespaced using the pattern: `@robojs/roadmap:{guildId}`
 */

import { getState, setState } from 'robo.js'
import { ID_NAMESPACE } from './constants.js'
import { roadmapLogger } from './logger.js'

/**
 * Guild-specific roadmap configuration settings.
 *
 * All properties are optional to support incremental updates and default values.
 * The plugin uses a category-based multi-forum structure where each column
 * (Backlog, In Progress, Done) gets its own dedicated forum channel.
 */
export interface RoadmapSettings {
	/**
	 * The Discord category ID containing all roadmap forum channels.
	 *
	 * This category organizes all column-specific forum channels in one place
	 * and allows for unified permission management across all roadmap forums.
	 */
	categoryId?: string

	/**
	 * Map of column names to Discord forum channel IDs.
	 *
	 * Each column (e.g., 'Backlog', 'In Progress', 'Done') has its own
	 * dedicated forum channel where cards in that column are posted.
	 *
	 * @example
	 * ```ts
	 * {
	 *   "Backlog": "1234567890123456789",
	 *   "In Progress": "9876543210987654321",
	 *   "Done": "1111222233334444555"
	 * }
	 * ```
	 */
	forumChannels?: Record<string, string>

	/**
	 * Whether the roadmap forums are publicly accessible or private.
	 *
	 * This setting applies to all forum channels within the roadmap category.
	 * - `true`: Everyone can view and comment on existing threads, but only admins/mods can create new threads
	 * - `false`: Only administrators and moderators can view the forums
	 * - `undefined`: Defaults to false (private)
	 */
	isPublic?: boolean

	/**
	 * Unix timestamp in milliseconds of the last successful sync operation.
	 *
	 * This timestamp is used to determine when the next sync should occur
	 * and for displaying "last synced" information to users.
	 */
	lastSyncTimestamp?: number

	/**
	 * Map of provider card IDs to Discord thread IDs.
	 *
	 * This mapping tracks which external cards (e.g., Jira issues) have been
	 * synced to which Discord forum posts, enabling updates instead of duplicates.
	 * Threads can be in any of the column-specific forum channels.
	 *
	 * @example
	 * ```ts
	 * {
	 *   "PROJ-123": "1234567890123456789",
	 *   "PROJ-456": "9876543210987654321"
	 * }
	 * ```
	 */
	syncedPosts?: Record<string, string>

	/**
	 * Array of Discord role IDs that are authorized to create roadmap cards.
	 *
	 * Users with any of these roles (in addition to administrators) can create
	 * new cards using the `/roadmap add` command or via the API. If empty or
	 * undefined, only administrators can create cards.
	 *
	 * @example
	 * ```ts
	 * ["1234567890123456789", "9876543210987654321"]
	 * ```
	 */
	authorizedCreatorRoles?: string[]
}

/**
 * Retrieves roadmap settings for a guild.
 *
 * Returns empty object if no settings exist.
 *
 * @param guildId - The Discord guild ID.
 * @returns The guild's roadmap settings.
 * @throws Error if guildId is null or undefined.
 */
export function getSettings(guildId: string | null): RoadmapSettings {
	// Validate guild ID is provided
	if (!guildId) {
		roadmapLogger.error('getSettings: Guild ID is required (supplied guildId=%s)', guildId)
		throw new Error('Guild ID is required to get roadmap settings')
	}

	// Load settings from Flashcore with namespaced key
	const settings = getState<RoadmapSettings>('settings', { namespace: ID_NAMESPACE + guildId }) ?? {}
	roadmapLogger.debug(`Loaded roadmap settings for guild ${guildId}:`, settings)

	return settings
}

/**
 * Updates roadmap settings for a guild (merges with existing).
 *
 * @param guildId - The Discord guild ID.
 * @param settings - Partial settings to merge.
 * @returns The merged settings.
 * @throws Error if guildId is null or undefined or persistence fails.
 */
export function updateSettings(guildId: string | null, settings: Partial<RoadmapSettings>): RoadmapSettings {
	// Validate guild ID is provided
	if (!guildId) {
		throw new Error('Guild ID is required to update roadmap settings')
	}

	try {
		// Merge new settings with existing settings
		const currentSettings = getSettings(guildId)
		const newSettings = { ...currentSettings, ...settings }

		// Persist merged settings to Flashcore
		setState<RoadmapSettings>('settings', newSettings, { namespace: ID_NAMESPACE + guildId, persist: true })
		roadmapLogger.debug(`Updated roadmap settings for guild ${guildId}:`, newSettings)

		return newSettings
	} catch (error) {
		roadmapLogger.error(
			'updateSettings: Failed to persist settings for guild %s: %s',
			guildId,
			(error as Error).message
		)
		throw new Error(`Failed to update settings for guild ${guildId}: ${(error as Error).message}`)
	}
}

/**
 * Gets the roadmap category ID for a guild.
 *
 * @param guildId - The Discord guild ID.
 * @returns The category ID, or undefined if not configured.
 */
export function getCategoryId(guildId: string): string | undefined {
	return getSettings(guildId).categoryId
}

/**
 * Gets the forum channel ID for a specific column.
 *
 * @param guildId - The Discord guild ID.
 * @param columnName - The column name (e.g., 'Backlog').
 * @returns The forum channel ID, or undefined if not configured.
 */
export function getForumChannelIdForColumn(guildId: string, columnName: string): string | undefined {
	return getSettings(guildId).forumChannels?.[columnName]
}

/**
 * Gets all forum channel IDs mapped by column name.
 *
 * @param guildId - The Discord guild ID.
 * @returns Record mapping column names to forum channel IDs.
 */
export function getAllForumChannels(guildId: string): Record<string, string> {
	return getSettings(guildId).forumChannels ?? {}
}

/**
 * Checks if the forum is configured as public.
 *
 * @param guildId - The Discord guild ID.
 * @returns True if the forum is public, false otherwise
 *
 * @example
 * ```ts
 * if (isForumPublic(guildId)) {
 *   console.log('Forum is publicly accessible');
 * } else {
 *   console.log('Forum is private (admin/mod only)');
 * }
 * ```
 */
export function isForumPublic(guildId: string): boolean {
	return getSettings(guildId).isPublic ?? false
}

/**
 * Retrieves the Discord thread ID for a synced provider card.
 *
 * This helper looks up the thread ID associated with a specific
 * external card ID (e.g., a Jira issue key).
 *
 * @param guildId - The Discord guild ID
 * @param cardId - The provider card ID (e.g., "PROJ-123")
 * @returns The Discord thread ID, or undefined if not synced
 *
 * @example
 * ```ts
 * const threadId = getSyncedPostId(guildId, 'PROJ-123');
 * if (threadId) {
 *   // Update existing thread
 * } else {
 *   // Create new thread
 * }
 * ```
 */
export function getSyncedPostId(guildId: string, cardId: string): string | undefined {
	return getSettings(guildId).syncedPosts?.[cardId]
}

/**
 * Records a synced post mapping between a provider card and Discord thread.
 *
 * This helper updates just the synced posts mapping without affecting
 * other settings. It's used after successfully creating or updating a
 * forum post to track the relationship.
 *
 * @param guildId - The Discord guild ID
 * @param cardId - The provider card ID (e.g., "PROJ-123")
 * @param threadId - The Discord thread ID
 *
 * @example
 * ```ts
 * // After creating a forum post
 * const thread = await forumChannel.threads.create({...});
 * setSyncedPost(guildId, jiraIssue.key, thread.id);
 * ```
 */
export function setSyncedPost(guildId: string, cardId: string, threadId: string): void {
	// Get current synced posts map
	const currentSettings = getSettings(guildId)
	const syncedPosts = currentSettings.syncedPosts ?? {}

	// Update synced posts with new mapping
	updateSettings(guildId, {
		syncedPosts: {
			...syncedPosts,
			[cardId]: threadId
		}
	})
}

/**
 * Retrieves the list of role IDs authorized to create roadmap cards.
 *
 * This helper extracts the authorized creator roles from the guild's settings.
 * If no roles are configured, an empty array is returned, meaning only
 * administrators can create cards.
 *
 * @param guildId - The Discord guild ID
 * @returns Array of role IDs that can create cards
 *
 * @example
 * ```ts
 * const authorizedRoles = getAuthorizedCreatorRoles(guildId);
 * if (authorizedRoles.length > 0) {
 *   console.log('Roles that can create cards:', authorizedRoles);
 * } else {
 *   console.log('Only admins can create cards');
 * }
 * ```
 */
export function getAuthorizedCreatorRoles(guildId: string): string[] {
	return getSettings(guildId).authorizedCreatorRoles ?? []
}

/**
 * Sets the list of role IDs authorized to create roadmap cards.
 *
 * This helper updates the authorized creator roles setting. Pass an empty
 * array to restrict card creation to administrators only.
 *
 * @param guildId - The Discord guild ID
 * @param roleIds - Array of role IDs to authorize
 *
 * @example
 * ```ts
 * // Authorize specific roles
 * setAuthorizedCreatorRoles(guildId, ['1234567890123456789', '9876543210987654321']);
 *
 * // Restrict to admins only
 * setAuthorizedCreatorRoles(guildId, []);
 * ```
 */
export function setAuthorizedCreatorRoles(guildId: string, roleIds: string[]): void {
	updateSettings(guildId, { authorizedCreatorRoles: roleIds })
}

/**
 * Checks if a user is authorized to create roadmap cards.
 *
 * A user is authorized if they are an administrator OR if they have any role
 * that is in the authorized creator roles list. Administrators are always
 * authorized regardless of the role configuration.
 *
 * @param guildId - The Discord guild ID
 * @param userRoleIds - Array of role IDs the user has
 * @param isAdmin - Whether the user is an administrator
 * @returns True if the user can create cards, false otherwise
 *
 * @example
 * ```ts
 * const member = interaction.member;
 * const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
 * const userRoles = member.roles.cache.map(r => r.id);
 *
 * if (canUserCreateCards(guildId, userRoles, isAdmin)) {
 *   // Allow card creation
 * } else {
 *   // Deny access
 * }
 * ```
 */
export function canUserCreateCards(guildId: string, userRoleIds: string[], isAdmin: boolean): boolean {
	// Admins can always create cards
	if (isAdmin) {
		return true
	}

	// Check if user has any authorized role
	const authorizedRoles = getAuthorizedCreatorRoles(guildId)

	return userRoleIds.some((roleId) => authorizedRoles.includes(roleId))
}
