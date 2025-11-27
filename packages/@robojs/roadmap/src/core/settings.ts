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
import type { ThreadHistoryEntry } from '../types.js'
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

	/**
	 * Map of provider card IDs to arrays of historical thread entries.
	 *
	 * This tracks the history of threads for cards that have moved between columns,
	 * enabling linking to previous discussions. Each entry captures the thread's
	 * state (ID, column, forum, message count) at the time it was moved to a new forum.
	 *
	 * The message count is used to determine if linking is worthwhile (threads with
	 * only the starter message are typically not linked) and to provide informative
	 * link text like "View 52 messages from In Progress".
	 *
	 * @example
	 * ```ts
	 * {
	 *   "PROJ-123": [
	 *     {
	 *       threadId: "1234567890123456789",
	 *       column: "Backlog",
	 *       forumId: "9876543210987654321",
	 *       movedAt: 1704067200000,
	 *       messageCount: 3
	 *     },
	 *     {
	 *       threadId: "1111222233334444555",
	 *       column: "In Progress",
	 *       forumId: "5555666677778888999",
	 *       movedAt: 1704153600000,
	 *       messageCount: 52
	 *     }
	 *   ]
	 * }
	 * ```
	 */
	threadHistory?: Record<string, ThreadHistoryEntry[]>

	/**
	 * Map of Jira assignee display names to Discord user IDs.
	 *
	 * This mapping allows redacting Jira names from public Discord messages
	 * by replacing them with Discord user mentions. Jira names are matched
	 * exactly (case-sensitive). If no mapping exists for a Jira assignee,
	 * that assignee is hidden from Discord messages entirely.
	 *
	 * @example
	 * ```ts
	 * {
	 *   "Alice Jira": "1234567890123456789",
	 *   "Bob Jira": "9876543210987654321"
	 * }
	 * ```
	 */
	assigneeMapping?: Record<string, string>

	/**
	 * Template string for formatting Discord thread titles.
	 *
	 * Supports placeholders: `{id}` for the card ID and `{title}` for the card title.
	 * If not provided or empty, thread titles will use just the card title.
	 * The template is always respected even if it means truncating the title portion
	 * to fit Discord's 100 character limit.
	 *
	 * @defaultValue undefined (uses just the title)
	 *
	 * @example
	 * ```ts
	 * // Default format: "[ROBO-23] Lorem ipsum"
	 * threadTitleTemplate: "[{id}] {title}"
	 *
	 * // Alternative format: "ROBO-23 - Lorem ipsum"
	 * threadTitleTemplate: "{id} - {title}"
	 *
	 * // Just title (same as undefined/empty)
	 * threadTitleTemplate: "{title}"
	 * ```
	 */
	threadTitleTemplate?: string

	/**
	 * Per-guild column mapping overrides.
	 *
	 * Maps provider status names to column names (or null for no forum).
	 * Overrides provider-level defaults. Keys are matched case-insensitively.
	 *
	 * @example
	 * ```ts
	 * {
	 *   "QA": "Development",  // Map QA status to Development column
	 *   "Blocked": null        // Track Blocked status but don't create forum thread
	 * }
	 * ```
	 */
	columnMapping?: Record<string, string | null>

	/**
	 * Custom columns for this guild (overrides provider columns).
	 *
	 * If provided, replaces the default column set entirely.
	 * Each column can optionally disable forum creation by setting `createForum: false`.
	 *
	 * @example
	 * ```ts
	 * [
	 *   { id: 'planning', name: 'Planning', order: 0 },
	 *   { id: 'development', name: 'Development', order: 1 },
	 *   { id: 'review', name: 'Review', order: 2, createForum: false }
	 * ]
	 * ```
	 */
	customColumns?: Array<{
		readonly id: string
		readonly name: string
		readonly order: number
		readonly archived?: boolean
		readonly createForum?: boolean
	}>
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
		roadmapLogger.error(`getSettings: Guild ID is required (supplied guildId=${guildId})`)
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
			`updateSettings: Failed to persist settings for guild ${guildId}: ${(error as Error).message}`
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
 * Retrieves the thread history array for a specific card.
 *
 * This helper returns all historical thread entries for a card that has
 * moved between columns. Each entry contains the thread ID, column name,
 * forum ID, timestamp, and message count at the time of the move.
 *
 * @param guildId - The Discord guild ID
 * @param cardId - The provider card ID (e.g., "PROJ-123")
 * @returns Array of thread history entries, empty array if no history exists
 *
 * @example
 * ```ts
 * const history = getThreadHistory(guildId, 'PROJ-123');
 * if (history.length > 0) {
 *   const lastThread = history[history.length - 1];
 *   console.log(`Previous thread in ${lastThread.column}: ${lastThread.messageCount} messages`);
 * }
 * ```
 */
export function getThreadHistory(guildId: string, cardId: string): ThreadHistoryEntry[] {
	return getSettings(guildId).threadHistory?.[cardId] ?? []
}

/**
 * Retrieves the most recent thread entry for a specific column.
 *
 * This helper filters the thread history for a card to find entries matching
 * the target column name, then returns the most recent one based on the
 * `movedAt` timestamp. This is used by the sync engine to detect when cards
 * move back to previously visited columns, enabling thread reuse to prevent
 * duplicate threads.
 *
 * @param guildId - The Discord guild ID
 * @param cardId - The provider card ID (e.g., "PROJ-123")
 * @param targetColumn - The column name to search for (e.g., "Backlog")
 * @returns The most recent thread history entry for the target column, or null if no matching entries exist
 *
 * @example
 * ```ts
 * // Check if card has been in Backlog before
 * const previousBacklogThread = getThreadForColumn(guildId, 'PROJ-123', 'Backlog');
 * if (previousBacklogThread) {
 *   // Reuse the existing thread instead of creating a new one
 *   console.log(`Found previous thread: ${previousBacklogThread.threadId}`);
 * } else {
 *   // Create a new thread for this column
 *   console.log('No previous thread found, creating new one');
 * }
 * ```
 */
export function getThreadForColumn(
	guildId: string,
	cardId: string,
	targetColumn: string
): ThreadHistoryEntry | null {
	// Get all history entries for this card
	const history = getThreadHistory(guildId, cardId)

	// Filter entries matching the target column (exact case-sensitive match)
	const matchingEntries = history.filter((entry) => entry.column === targetColumn)

	// Return null if no matches found
	if (matchingEntries.length === 0) {
		return null
	}

	// Sort by movedAt descending (most recent first)
	matchingEntries.sort((a, b) => b.movedAt - a.movedAt)

	// Return the most recent entry
	return matchingEntries[0]
}

/**
 * Appends a new thread entry to a card's history.
 *
 * This helper is called when a thread is moved to a new forum (Phase 2).
 * It records the old thread's metadata including message count for future
 * reference and linking. Multiple entries can exist for cards that move
 * through multiple columns over time.
 *
 * @param guildId - The Discord guild ID
 * @param cardId - The provider card ID (e.g., "PROJ-123")
 * @param entry - The thread history entry to add
 *
 * @example
 * ```ts
 * // When moving a thread from "In Progress" to "Done"
 * const thread = await forum.client.channels.fetch(existingThreadId);
 * if (thread && thread.isThread()) {
 *   await addThreadToHistory(guildId, card.id, {
 *     threadId: thread.id,
 *     column: 'In Progress',
 *     forumId: thread.parentId,
 *     movedAt: Date.now(),
 *     messageCount: thread.messageCount
 *   });
 * }
 * ```
 */
export function addThreadToHistory(guildId: string, cardId: string, entry: ThreadHistoryEntry): void {
	// Get existing history for this card
	const existingHistory = getThreadHistory(guildId, cardId)

	// Get current threadHistory map
	const currentSettings = getSettings(guildId)
	const threadHistory = currentSettings.threadHistory ?? {}

	// Append new entry and sort by movedAt descending (most recent first)
	const combinedHistory = [...existingHistory, entry]
	combinedHistory.sort((a, b) => b.movedAt - a.movedAt)

	// Keep only the last 10 entries to prevent unbounded growth
	const trimmedHistory = combinedHistory.slice(0, 10)

	// Update threadHistory with trimmed array
	updateSettings(guildId, {
		threadHistory: {
			...threadHistory,
			[cardId]: trimmedHistory
		}
	})
}

/**
 * Retrieves the current thread ID and its column information for a card.
 *
 * This helper determines which column a card's current thread belongs to by
 * looking up the thread's parent forum ID in the forumChannels mapping. This
 * is used during sync to detect when a card has moved to a different column.
 *
 * @param guildId - The Discord guild ID
 * @param cardId - The provider card ID (e.g., "PROJ-123")
 * @param threadParentId - The thread's parent forum channel ID
 * @returns Object with threadId and column, or null if no thread exists or column cannot be determined
 *
 * @example
 * ```ts
 * const thread = await forum.client.channels.fetch(existingThreadId);
 * if (thread && thread.isThread()) {
 *   const currentInfo = getCurrentThreadInfo(guildId, card.id, thread.parentId);
 *   if (currentInfo && card.column !== currentInfo.column) {
 *     console.log('Column has changed!');
 *   }
 * }
 * ```
 */
export function getCurrentThreadInfo(
	guildId: string,
	cardId: string,
	threadParentId: string
): { threadId: string; column: string } | null {
	const threadId = getSyncedPostId(guildId, cardId)
	if (!threadId) {
		return null
	}

	// Get forum channels mapping to determine which column the thread is in
	const settings = getSettings(guildId)
	const forumChannels = settings.forumChannels ?? {}

	// Find the column whose forum ID matches the thread's parent forum
	for (const [columnName, forumId] of Object.entries(forumChannels)) {
		if (forumId === threadParentId) {
			return { threadId, column: columnName }
		}
	}

	// Could not determine column - thread's parent forum doesn't match any configured column
	return null
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

/**
 * Retrieves the assignee mapping for a guild.
 *
 * This helper returns the map of Jira assignee names to Discord user IDs.
 * Returns an empty object if no mappings exist.
 *
 * @param guildId - The Discord guild ID
 * @returns Record mapping Jira assignee names to Discord user IDs
 *
 * @example
 * ```ts
 * const mapping = getAssigneeMapping(guildId);
 * // { "Alice Jira": "1234567890123456789", "Bob Jira": "9876543210987654321" }
 * ```
 */
export function getAssigneeMapping(guildId: string): Record<string, string> {
	return getSettings(guildId).assigneeMapping ?? {}
}

/**
 * Sets a mapping between a Jira assignee name and a Discord user ID.
 *
 * This helper updates the assignee mapping for a specific Jira assignee.
 * The mapping is case-sensitive and matches Jira display names exactly.
 *
 * @param guildId - The Discord guild ID
 * @param jiraName - The Jira assignee display name (exact match, case-sensitive)
 * @param discordUserId - The Discord user ID to map to
 *
 * @example
 * ```ts
 * setAssigneeMapping(guildId, 'Alice Jira', '1234567890123456789');
 * ```
 */
export function setAssigneeMapping(guildId: string, jiraName: string, discordUserId: string): void {
	const currentSettings = getSettings(guildId)
	const assigneeMapping = currentSettings.assigneeMapping ?? {}

	updateSettings(guildId, {
		assigneeMapping: {
			...assigneeMapping,
			[jiraName]: discordUserId
		}
	})
}

/**
 * Removes a mapping for a Jira assignee name.
 *
 * This helper removes an existing assignee mapping. After removal, the
 * Jira assignee will be hidden from Discord messages (no mapping exists).
 *
 * @param guildId - The Discord guild ID
 * @param jiraName - The Jira assignee display name to unmap
 *
 * @example
 * ```ts
 * removeAssigneeMapping(guildId, 'Alice Jira');
 * ```
 */
export function removeAssigneeMapping(guildId: string, jiraName: string): void {
	const currentSettings = getSettings(guildId)
	const assigneeMapping = currentSettings.assigneeMapping ?? {}

	const { [jiraName]: removed, ...remaining } = assigneeMapping

	updateSettings(guildId, {
		assigneeMapping: remaining
	})
}

/**
 * Looks up the Discord user ID for a Jira assignee name.
 *
 * This helper performs a case-sensitive lookup of the Jira assignee name
 * in the assignee mapping. Returns undefined if no mapping exists.
 *
 * @param guildId - The Discord guild ID
 * @param jiraName - The Jira assignee display name to look up
 * @returns The Discord user ID if a mapping exists, undefined otherwise
 *
 * @example
 * ```ts
 * const discordUserId = getDiscordUserIdForJiraName(guildId, 'Alice Jira');
 * if (discordUserId) {
 *   // Use the Discord user ID
 * }
 * ```
 */
export function getDiscordUserIdForJiraName(guildId: string, jiraName: string): string | undefined {
	const assigneeMapping = getAssigneeMapping(guildId)
	return assigneeMapping[jiraName]
}

/**
 * Retrieves the column mapping for a guild.
 *
 * This helper returns the map of provider status names to column names (or null for no forum).
 * Returns an empty object if no mappings exist.
 *
 * @param guildId - The Discord guild ID
 * @returns Record mapping provider status names to column names (or null)
 *
 * @example
 * ```ts
 * const mapping = getColumnMapping(guildId);
 * // { "QA": "Development", "Blocked": null }
 * ```
 */
export function getColumnMapping(guildId: string): Record<string, string | null> {
	return getSettings(guildId).columnMapping ?? {}
}

/**
 * Sets a mapping between a provider status name and a column name (or null for no forum).
 *
 * This helper updates the column mapping for a specific status.
 * The mapping is case-insensitive and matches status names.
 *
 * @param guildId - The Discord guild ID
 * @param status - The provider status name (case-insensitive)
 * @param column - The column name to map to, or null to track without forum
 *
 * @example
 * ```ts
 * setColumnMapping(guildId, 'QA', 'Development');  // Map QA to Development
 * setColumnMapping(guildId, 'Blocked', null);       // Track Blocked without forum
 * ```
 */
export function setColumnMapping(guildId: string, status: string, column: string | null): void {
	const currentSettings = getSettings(guildId)
	const columnMapping = currentSettings.columnMapping ?? {}

	updateSettings(guildId, {
		columnMapping: {
			...columnMapping,
			[status]: column
		}
	})
}

/**
 * Removes a mapping for a provider status name.
 *
 * This helper removes an existing column mapping. After removal, the
 * status will use the provider-level default mapping.
 *
 * @param guildId - The Discord guild ID
 * @param status - The provider status name to unmap
 *
 * @example
 * ```ts
 * removeColumnMapping(guildId, 'QA');
 * ```
 */
export function removeColumnMapping(guildId: string, status: string): void {
	const currentSettings = getSettings(guildId)
	const columnMapping = currentSettings.columnMapping ?? {}

	const { [status]: removed, ...remaining } = columnMapping

	updateSettings(guildId, {
		columnMapping: remaining
	})
}

/**
 * Retrieves custom columns for a guild.
 *
 * This helper returns the custom column definitions if configured.
 * Returns undefined if no custom columns are set (uses provider defaults).
 *
 * @param guildId - The Discord guild ID
 * @returns Array of custom column definitions or undefined
 *
 * @example
 * ```ts
 * const columns = getCustomColumns(guildId);
 * // [{ id: 'planning', name: 'Planning', order: 0 }, ...]
 * ```
 */
export function getCustomColumns(
	guildId: string
): Array<{
	id: string
	name: string
	order: number
	archived?: boolean
	createForum?: boolean
}> | undefined {
	return getSettings(guildId).customColumns
}

/**
 * Sets custom columns for a guild.
 *
 * This helper replaces the default column set with custom columns.
 * If provided, these columns completely override the provider's default columns.
 *
 * @param guildId - The Discord guild ID
 * @param columns - Array of custom column definitions
 *
 * @example
 * ```ts
 * setCustomColumns(guildId, [
 *   { id: 'planning', name: 'Planning', order: 0 },
 *   { id: 'development', name: 'Development', order: 1 }
 * ]);
 * ```
 */
export function setCustomColumns(
	guildId: string,
	columns: Array<{
		id: string
		name: string
		order: number
		archived?: boolean
		createForum?: boolean
	}>
): void {
	updateSettings(guildId, {
		customColumns: columns
	})
}
