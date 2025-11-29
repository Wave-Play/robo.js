import type { Guild, ForumChannel, ThreadChannel, Message } from 'discord.js'
import {
	ContainerBuilder,
	SectionBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	MessageFlags,
	ButtonBuilder,
	ButtonStyle
} from 'discord.js'
import type { RoadmapProvider } from '../providers/base.js'
import type { RoadmapCard, RoadmapColumn, SyncResult, SyncError } from '../types.js'
import {
	updateSettings,
	getSyncedPostId,
	setSyncedPost,
	addThreadToHistory,
	getCurrentThreadInfo,
	getThreadForColumn,
	getDiscordUserIdForJiraName,
	getSettings,
	getColumnMapping,
	getCustomColumns
} from './settings.js'
import { getAllForumChannels, updateForumTagsForColumn } from './forum-manager.js'
import { roadmapLogger } from './logger.js'
import { options } from '../events/_start.js'

/**
 * Error thrown when a sync is canceled via AbortSignal.
 */
export class SyncCanceledError extends Error {
	constructor() {
		super('Sync canceled by user')
		this.name = 'SyncCanceledError'
	}
}

/**
 * Checks if an assignee has a direct Discord User ID (from custom field).
 *
 * @param assignee - RoadmapCard assignee
 * @returns Discord User ID if assignee has direct Discord ID, undefined otherwise
 */
function getDirectDiscordUserId(assignee: { id: string; name: string }): string | undefined {
	// Check if name starts with "Discord:" marker (from custom field)
	if (assignee.name.startsWith('Discord:')) {
		// Extract Discord User ID from the marker
		const discordUserId = assignee.name.substring(8) // "Discord:".length
		// Validate it's a valid Discord User ID format (17-19 digits)
		if (/^\d{17,19}$/.test(discordUserId)) {
			return discordUserId
		}
	}
	// Also check if the id itself is a Discord User ID (fallback)
	if (/^\d{17,19}$/.test(assignee.id)) {
		return assignee.id
	}
	return undefined
}

/**
 * Discord API error with error code.
 * @see https://discord.com/developers/docs/topics/opcodes-and-status-codes#json
 */
interface DiscordError extends Error {
	readonly code?: number | string
}

/**
 * Type guard to check if an error is a Discord API error with a code.
 */
function isDiscordError(error: unknown): error is DiscordError {
	return error instanceof Error && 'code' in error
}

/**
 * Options for synchronizing roadmap data to Discord.
 */
export interface SyncOptions {
	/** The Discord guild to sync */
	guild: Guild
	/** The roadmap provider instance */
	provider: RoadmapProvider
	/** Optional sync identifier for traceability across logs/UI */
	syncId?: string
	/** Optional flag to preview changes without applying them (defaults to false) */
	dryRun?: boolean
	/** Optional callback invoked during sync to report progress */
	onProgress?: (update: SyncProgressUpdate) => void | Promise<void>
	/**
	 * Optional abort signal that allows callers to cancel an in-flight sync.
	 *
	 * When triggered, the sync stops before processing the next card and throws
	 * a `SyncCanceledError`, preserving progress up to that point.
	 */
	signal?: AbortSignal
}

/**
 * Progress update data sent during sync operations.
 *
 * @remarks
 * This interface provides real-time feedback about sync progress, enabling
 * UI updates and progress tracking. The stats object is a snapshot of current
 * progress and will be updated as the sync proceeds.
 */
export interface SyncProgressUpdate {
	/** Zero-based index of the card currently being processed */
	readonly currentIndex: number
	/** Total number of cards to process in this sync */
	readonly totalCards: number
	/** The card currently being processed */
	readonly currentCard: RoadmapCard
	/** Current sync statistics (snapshot) */
	readonly stats: {
		readonly total: number
		readonly created: number
		readonly updated: number
		readonly archived: number
		readonly errors: number
	}
	/** Whether this is a dry run (no changes applied) */
	readonly dryRun: boolean
	/** List of errors that have occurred during synchronization */
	readonly errors: readonly SyncError[]
}

/**
 * Type of operation to perform on a thread.
 */
export type ThreadOperation = 'create' | 'update' | 'archive' | 'skip'

/**
 * Formats a roadmap card into Discord message content with automatic truncation.
 *
 * Includes description and metadata (assignees, labels, last updated). Content is
 * truncated to respect Discord limits (2000 for forum thread starter messages and message edits).
 * Assignees are redacted - only mapped Discord users are mentioned, and Jira names are never shown.
 *
 * @param card - The roadmap card to format.
 * @param guildId - The Discord guild ID for looking up assignee mappings.
 * @param guild - Optional guild object for validating Discord user existence.
 * @param maxLength - Maximum character limit (default: 2000).
 * @returns Formatted message content.
 *
 * @example
 * ```ts
 * const content = formatCardContent(card, guildId, guild, 2000);
 * ```
 */
export async function formatCardContent(
	card: RoadmapCard,
	guildId: string,
	guild?: Guild,
	maxLength: number = 2000
): Promise<string> {
	// Use a safe default if description is undefined
	const desc = card.description || 'No description provided.'

	// Start with card description
	let content = desc

	// Add separator
	content += '\n\n---\n\n'

	// Build metadata sections
	const metadata: string[] = []

	// Assignees section - use mapping to redact Jira names
	if (card.assignees && card.assignees.length > 0) {
		const discordMentions: string[] = []

		for (const assignee of card.assignees) {
			// Check if assignee has direct Discord User ID from custom field (priority)
			let discordUserId = getDirectDiscordUserId(assignee)
			if (!discordUserId) {
				// Fall back to Jira assignee mapping
				discordUserId = getDiscordUserIdForJiraName(guildId, assignee.name)
				if (!discordUserId) {
					// No mapping exists - skip this assignee (never show Jira name)
					continue
				}
			}

			// Validate Discord user exists in guild if guild object is provided
			if (guild) {
				try {
					const member = await guild.members.fetch(discordUserId).catch(() => null)
					if (!member) {
						// User not in guild - log warning and skip
						roadmapLogger.warn(
							`Assignee mapping for Jira name "${assignee.name}" points to Discord user ${discordUserId} who is not in guild ${guildId}`
						)
						continue
					}
				} catch (error) {
					// Fetch failed - log warning and skip
					roadmapLogger.warn(
						`Failed to validate Discord user ${discordUserId} for Jira assignee "${assignee.name}" in guild ${guildId}: ${(error as Error).message}`
					)
					continue
				}
			}

			// User exists - add mention
			discordMentions.push(`<@${discordUserId}>`)
		}

		// Only show assignee section if at least one valid Discord mention exists
		if (discordMentions.length > 0) {
			metadata.push(`**Assigned to:** ${discordMentions.join(', ')}`)
		}
	}

	// Labels section
	if (card.labels && card.labels.length > 0) {
		metadata.push(`**Labels:** ${card.labels.join(', ')}`)
	}

	// Last updated section
	metadata.push(`**Last Updated:** ${card.updatedAt.toLocaleDateString()}`)

	// Join metadata
	const metadataContent = metadata.join('\n')

	// Combine description and metadata
	let fullContent = content + metadataContent

	// Truncate if needed to respect Discord limits
	if (fullContent.length > maxLength) {
		roadmapLogger.warn(
			`formatCardContent: Truncating content for card ${card.id} (original: ${fullContent.length}, limit: ${maxLength})`
		)

		const separator = '\n\n---\n\n'
		const truncationMarker = '\n... (truncated)'
		
		// Calculate space needed for fixed parts
		const fixedPartsLength = metadataContent.length + separator.length + truncationMarker.length
		const availableSpace = maxLength - fixedPartsLength

		// Metadata itself is too long, preserve minimal description
		if (availableSpace <= 0) {
			const minDescLength = 45 // Preserve first 45 characters of description
			const maxMetadataLength = maxLength - separator.length - truncationMarker.length - minDescLength - truncationMarker.length
			// Clamp to avoid negative substring lengths
			const truncatedMetadata = metadataContent.substring(0, Math.max(0, maxMetadataLength)) + truncationMarker
			const minimalDesc = desc.substring(0, Math.min(minDescLength, desc.length)) + truncationMarker
			fullContent = minimalDesc + separator + truncatedMetadata
		} else {
			// Ensure we don't exceed available space
			const maxDescLength = Math.min(availableSpace, desc.length)
			const truncatedDescription = desc.substring(0, maxDescLength) + truncationMarker
			fullContent = truncatedDescription + separator + metadataContent
		}
	}

	// Final safety check to guarantee character limit (hard cut if still over)
	if (fullContent.length > maxLength) {
		roadmapLogger.warn(
			`formatCardContent: Content still exceeds limit after truncation (${fullContent.length} > ${maxLength}), applying hard cut`
		)
		fullContent = fullContent.substring(0, maxLength)
	}

	return fullContent
}

/**
 * Formats a roadmap card into Discord Components v2 structure with rich presentation.
 *
 * Uses ContainerBuilder, SectionBuilder, and TextDisplayBuilder to create a visually
 * appealing layout with the card description, assignee avatar as thumbnail accessory,
 * and metadata (assignees, labels, last updated) in separate sections.
 *
 * Assignees are redacted - only mapped Discord users are mentioned, and Jira names are never shown.
 * The first assignee's avatar is displayed as a thumbnail accessory in the main content section.
 *
 * @param card - The roadmap card to format.
 * @param guildId - The Discord guild ID for looking up assignee mappings.
 * @param guild - Optional guild object for validating Discord user existence and fetching avatars.
 * @returns Object containing Components v2 structure with flags and components array.
 *
 * @example
 * ```ts
 * const { flags, components } = await formatCardContentV2(card, guildId, guild);
 * await thread.send({ flags, components });
 * ```
 */
export async function formatCardContentV2(
	card: RoadmapCard,
	guildId: string,
	guild?: Guild
): Promise<{ flags: number; components: ContainerBuilder[] }> {
	const desc = card.description || 'No description provided.'

	// Create main container
	const container = new ContainerBuilder()

	// Build assignee information for thumbnail and mentions
	let firstAssigneeAvatarUrl: string | null = null
	const discordMentions: string[] = []

	if (card.assignees && card.assignees.length > 0) {
		for (const assignee of card.assignees) {
			// Check if assignee has direct Discord User ID from custom field (priority)
			let discordUserId = getDirectDiscordUserId(assignee)
			if (!discordUserId) {
				// Fall back to Jira assignee mapping
				discordUserId = getDiscordUserIdForJiraName(guildId, assignee.name)
				if (!discordUserId) {
					continue
				}
			}

			// If guild is provided, validate user exists and fetch avatar
			if (guild) {
				try {
					const member = await guild.members.fetch(discordUserId).catch(() => null)
					if (!member) {
						const assigneeSource = getDirectDiscordUserId(assignee) ? 'custom field' : `Jira name "${assignee.name}"`
						roadmapLogger.warn(
							`Assignee from ${assigneeSource} points to Discord user ${discordUserId} who is not in guild ${guildId}`
						)
						continue
					}

					// Use first valid assignee's avatar for thumbnail
					if (!firstAssigneeAvatarUrl) {
						firstAssigneeAvatarUrl = member.displayAvatarURL({ size: 256 }) || member.user.displayAvatarURL({ size: 256 })
					}

					discordMentions.push(`<@${discordUserId}>`)
				} catch (error) {
					const assigneeSource = getDirectDiscordUserId(assignee) ? 'custom field' : `Jira assignee "${assignee.name}"`
					roadmapLogger.warn(
						`Failed to validate Discord user ${discordUserId} for ${assigneeSource} in guild ${guildId}: ${(error as Error).message}`
					)
				}
			} else {
				// No guild provided - still add mention but no avatar
				discordMentions.push(`<@${discordUserId}>`)
			}
		}
	}

	// Build metadata text displays first to calculate their total length
	// Discord counts ALL TextDisplay content across all components (4000 char total limit)
	const metadataTexts: string[] = []
	
	if (discordMentions.length > 0) {
		metadataTexts.push(`**Assigned to:** ${discordMentions.join(', ')}`)
	}
	
	if (card.labels && card.labels.length > 0) {
		metadataTexts.push(`**Labels:** ${card.labels.join(', ')}`)
	}
	
	metadataTexts.push(`**Last Updated:** ${card.updatedAt.toLocaleDateString()}`)
	
	const metadataTotalLength = metadataTexts.reduce((sum, text) => sum + text.length, 0)

	// Truncate description to account for metadata text
	// Total limit is 4000 characters across ALL TextDisplay components
	const TEXT_DISPLAY_MAX_LENGTH = 4000
	const truncationMarker = '\n... (truncated)'
	const codeBlockCloser = '\n```'
	
	// Calculate available space for description (accounting for metadata)
	const availableForDesc = TEXT_DISPLAY_MAX_LENGTH - metadataTotalLength
	let truncatedDesc = desc
	
	if (desc.length > availableForDesc) {
		roadmapLogger.warn(
			`formatCardContentV2: Truncating description for card ${card.id} (original: ${desc.length}, available: ${availableForDesc}, metadata: ${metadataTotalLength})`
		)
		
		// Account for truncation marker and potential code block closer
		const maxDescLength = availableForDesc - truncationMarker.length - codeBlockCloser.length
		truncatedDesc = desc.substring(0, Math.max(0, maxDescLength))
		
		// Check if we're in the middle of a code block (unclosed ```)
		const codeBlockMatches = truncatedDesc.match(/```/g)
		const codeBlockCount = codeBlockMatches ? codeBlockMatches.length : 0
		
		// If odd number of ```, we're in the middle of a code block - close it
		if (codeBlockCount % 2 === 1) {
			truncatedDesc += codeBlockCloser
		}
		
		truncatedDesc += truncationMarker
		
		// Final safety check - ensure total doesn't exceed limit
		const totalLength = truncatedDesc.length + metadataTotalLength
		if (totalLength > TEXT_DISPLAY_MAX_LENGTH) {
			// Hard cut description if still over
			const maxAllowed = TEXT_DISPLAY_MAX_LENGTH - metadataTotalLength
			truncatedDesc = truncatedDesc.substring(0, Math.max(0, maxAllowed))
		}
	}

	// Main content section with description
	// Sections in Components v2 MUST have an accessory (button or thumbnail)
	const mainSection = new SectionBuilder().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(truncatedDesc)
	)

	// Add thumbnail accessory if we have an assignee avatar, otherwise use placeholder button
	if (firstAssigneeAvatarUrl) {
		mainSection.setThumbnailAccessory(
			new ThumbnailBuilder({ media: { url: firstAssigneeAvatarUrl } })
		)
	} else {
		// Use placeholder button to satisfy Components v2 requirement
		// Zero-width space label makes it visually minimal
		mainSection.setButtonAccessory(
			new ButtonBuilder()
				.setCustomId(`@robojs/roadmap:card-placeholder:${card.id}`)
				.setLabel('\u200b') // Zero-width space
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(true)
		)
	}

	container.addSectionComponents(mainSection)

	// Add separator before metadata
	container.addSeparatorComponents(
		new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large)
	)

	// Build metadata text displays from pre-calculated texts
	const metadataDisplays: TextDisplayBuilder[] = metadataTexts.map(
		(text) => new TextDisplayBuilder().setContent(text)
	)

	// Add metadata to container
	if (metadataDisplays.length > 0) {
		container.addTextDisplayComponents(...metadataDisplays)
	}

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container]
	}
}

/**
 * Formats a roadmap card title for use as a Discord thread name.
 *
 * Uses a configurable template string from guild settings, supporting placeholders:
 * - `{id}` - The card ID (e.g., "ROBO-23")
 * - `{title}` - The card title
 *
 * If no template is provided or it's empty, uses just the card title.
 * Handles Discord's 100 character limit by truncating the title portion while
 * preserving the template structure.
 *
 * @param card - The roadmap card to format.
 * @param guildId - The Discord guild ID for looking up settings.
 * @returns Formatted thread name respecting Discord's 100 character limit.
 *
 * @example
 * ```ts
 * const threadName = formatThreadName(card, guildId);
 * // With threadTitleTemplate: "[{id}] {title}"
 * // Returns: "[ROBO-23] Lorem ipsum"
 * // With threadTitleTemplate: "{id} - {title}"
 * // Returns: "ROBO-23 - Lorem ipsum"
 * // With no template or empty string
 * // Returns: "Lorem ipsum"
 * ```
 */
export function formatThreadName(card: RoadmapCard, guildId: string): string {
	const settings = getSettings(guildId)
	// Check guild-specific setting first, then fall back to plugin default
	const template = settings.threadTitleTemplate ?? options.threadTitleTemplate

	// If no template or empty, use just the title (backward compatible)
	if (!template || template.trim() === '') {
		return card.title.length > 100 ? card.title.substring(0, 97) + '...' : card.title
	}

	// Replace placeholders in template
	let threadName = template
		.replace(/\{id\}/g, card.id)
		.replace(/\{title\}/g, card.title)

	// If the result fits within 100 characters, we're done
	if (threadName.length <= 100) {
		return threadName
	}

	// Need to truncate - find where {title} appears and truncate that portion
	const titlePlaceholder = '{title}'
	const titleIndex = template.indexOf(titlePlaceholder)

	if (titleIndex === -1) {
		// No {title} placeholder, just truncate the whole thing
		return threadName.length > 100 ? threadName.substring(0, 97) + '...' : threadName
	}

	// Calculate the fixed portion (everything except {title})
	const beforeTitle = template.substring(0, titleIndex)
	const afterTitle = template.substring(titleIndex + titlePlaceholder.length)
	const fixedPortion = beforeTitle.replace(/\{id\}/g, card.id) + afterTitle.replace(/\{id\}/g, card.id)
	const fixedLength = fixedPortion.length

	// Calculate how much space is left for the title
	const maxTitleLength = 100 - fixedLength

	if (maxTitleLength <= 0) {
		// Fixed portion itself is too long, just truncate everything
		return threadName.length > 100 ? threadName.substring(0, 97) + '...' : threadName
	}

	// Truncate title to fit
	let truncatedTitle: string
	if (card.title.length > maxTitleLength) {
		truncatedTitle = card.title.substring(0, maxTitleLength - 3) + '...'
	} else {
		truncatedTitle = card.title
	}

	// Rebuild with truncated title
	threadName = beforeTitle.replace(/\{id\}/g, card.id) + truncatedTitle + afterTitle.replace(/\{id\}/g, card.id)

	// Final safety check: ensure we never exceed 100 characters
	return threadName.length > 100 ? threadName.substring(0, 100) : threadName
}

/**
 * Determines whether a thread has user activity beyond the starter message.
 *
 * The Discord API includes the starter message in the `messageCount`, so a value greater
 * than 1 indicates that at least one user message exists in the thread.
 *
 * @param thread - The Discord thread channel to inspect.
 * @returns True if the thread contains user messages, false otherwise.
 *
 * @example
 * ```ts
 * if (hasUserMessages(oldThread)) {
 *   // Include link to previous discussion
 * }
 * ```
 */
function hasUserMessages(thread: ThreadChannel): boolean {
	const messageCount = thread.messageCount ?? 0

	return messageCount > 1
}

/**
 * Moves a roadmap card's discussion thread to a new forum when the column changes.
 *
 * Creates a replacement thread in the destination forum, optionally links to the previous
 * discussion when meaningful user activity exists, locks/archives the old thread, updates
 * synced post mappings, and records a thread history entry.
 *
 * @param card - The roadmap card associated with the thread.
 * @param existingThread - The thread that needs to be moved.
 * @param targetForum - The destination forum channel.
 * @param appliedTags - Tag IDs to apply to the new thread.
 * @param guildId - Guild ID for settings persistence.
 * @returns The newly created thread in the destination forum.
 * @throws If required Discord references are missing or thread creation fails.
 *
 * @example
 * ```ts
 * await moveThreadToNewForum(card, oldThread, newForum, appliedTags, guildId)
 * ```
 */
export async function moveThreadToNewForum(
	card: RoadmapCard,
	existingThread: ThreadChannel,
	targetForum: ForumChannel,
	appliedTags: string[],
	guildId: string
): Promise<ThreadChannel> {
	if (!targetForum) {
		throw new Error(`Target forum is required to move thread for card ${card.id}`)
	}

	const previousForumId = existingThread.parentId

	if (!previousForumId) {
		throw new Error(`Thread ${existingThread.id} is missing its parent forum reference`)
	}

	if (previousForumId === targetForum.id) {
		roadmapLogger.debug(
			`moveThreadToNewForum: Thread ${existingThread.id} for card ${card.id} already in target forum ${targetForum.id}`
		)

		return existingThread
	}

	const totalMessages = existingThread.messageCount ?? 0
	const userActivity = hasUserMessages(existingThread)
	const threadName = formatThreadName(card, guildId)

	// Always use clean card content for starter message with Components v2
	const { flags, components } = await formatCardContentV2(card, guildId, targetForum.guild)

	const newThread = await targetForum.threads.create({
		name: threadName,
		message: { flags, components },
		appliedTags,
		reason: 'Roadmap sync: card moved to new column'
	})

	roadmapLogger.info(
		`Created new thread for card ${card.id} in forum ${targetForum.name} (moved from forum ${existingThread.parent?.name ?? previousForumId}). Old thread: ${existingThread.url} | New thread: ${newThread.url}`
	)

	// Post bot comment in new thread with previous discussion link (if user activity exists)
	if (userActivity) {
		try {
			const userMessageCount = Math.max(0, totalMessages - 1)
			const previousDiscussionMessage = `📜 See ${userMessageCount} message${userMessageCount === 1 ? '' : 's'} in previous discussion: ${existingThread.url}`
			const botMessage = await newThread.send(previousDiscussionMessage)
			roadmapLogger.debug(
				`Posted previous discussion link in new thread ${newThread.id} for card ${card.id}. Message ID: ${botMessage.id}, Thread URL: ${newThread.url}`
			)
		} catch (error) {
			roadmapLogger.warn(
				`Failed to post previous discussion link in new thread ${newThread.id} for card ${card.id}: ${error instanceof Error ? error.message : String(error)}`
			)
		}
	}

	// Post notification message in old thread before locking/archiving
	try {
		const notificationMessage = `🔄 This thread has been moved to ${card.column}. Continue discussion here: ${newThread.url}`
		const notificationBotMessage = await existingThread.send(notificationMessage)
		roadmapLogger.debug(
			`Posted move notification in old thread ${existingThread.id} for card ${card.id}. Message ID: ${notificationBotMessage.id}, Thread URL: ${existingThread.url}`
		)
	} catch (error) {
		// Handle cases where thread is already locked, archived, or inaccessible
		roadmapLogger.warn(
			`Failed to post move notification in old thread ${existingThread.id} for card ${card.id} (thread may be locked/archived): ${error instanceof Error ? error.message : String(error)}`
		)
	}

	// Lock and archive old thread
	try {
		await existingThread.setLocked(true, 'Roadmap sync: card moved to new column')
		await existingThread.setArchived(true, 'Roadmap sync: card moved to new column')
		roadmapLogger.info(`Locked and archived old thread ${existingThread.id} for card ${card.id}. Thread URL: ${existingThread.url}`)
	} catch (error) {
		roadmapLogger.warn(
			`Failed to lock/archive old thread ${existingThread.id} for card ${card.id}: ${error instanceof Error ? error.message : String(error)}`
		)
	}

	const currentThreadInfo = getCurrentThreadInfo(guildId, card.id, previousForumId)
	const previousColumnName = currentThreadInfo?.column ?? existingThread.parent?.name ?? 'Unknown'

	addThreadToHistory(guildId, card.id, {
		threadId: existingThread.id,
		column: previousColumnName,
		forumId: previousForumId,
		movedAt: Date.now(),
		messageCount: totalMessages
	})

	setSyncedPost(guildId, card.id, newThread.id)

	return newThread
}

/**
 * Synchronizes a single roadmap card to Discord and returns thread metadata.
 *
 * @param card - The roadmap card to sync.
 * @param guild - The Discord guild to sync to.
 * @param provider - The roadmap provider instance.
 * @returns Object containing thread ID and URL, or null if skipped (e.g., archived column).
 * @throws Error if forums not configured, card column not found, or Discord sync fails.
 *
 * @example
 * ```ts
 * const result = await syncSingleCard(newCard, guild, provider);
 * if (result) {
 *   const { threadId, threadUrl } = result;
 * }
 * ```
 */
export async function syncSingleCard(
	card: RoadmapCard,
	guild: Guild,
	provider: RoadmapProvider
): Promise<{ threadId: string; threadUrl: string } | null> {
	try {
		// Validate inputs
		if (!card) {
			throw new Error('Card is required')
		}
		if (!guild) {
			throw new Error('Guild is required')
		}
		if (!provider) {
			throw new Error('Provider is required')
		}

		roadmapLogger.debug(`Starting sync for card ${card.id} (${card.title})`)

		// Fetch required context - forums
		const forums = await getAllForumChannels(guild)
		if (forums.size === 0) {
			throw new Error('No roadmap forums configured. Run /roadmap setup first.')
		}

		// Fetch required context - columns
		const columns = await provider.getColumns()
		const columnsMap = new Map(columns.map((col) => [col.name, col]))

		roadmapLogger.debug(`Fetched context: ${forums.size} forums, ${columns.length} columns`)

		// Get target forum for card's column
		let forum = forums.get(card.column)
		if (!forum) {
			const columnObj = columnsMap.get(card.column)
			if (columnObj?.archived) {
				roadmapLogger.debug(`Skipping archived column ${card.column} for card ${card.id} (no forum needed)`)
				return null
			} else {
				throw new Error(`No forum channel found for column ${card.column}. Run /roadmap setup first.`)
			}
		}

		// Update forum tags for the card's labels before syncing
		if (card.labels && card.labels.length > 0) {
			try {
				await updateForumTagsForColumn(guild, card.column, card.labels)

				// Refresh forum mapping to get updated availableTags
				const refreshedForums = await getAllForumChannels(guild)
				const refreshedForum = refreshedForums.get(card.column)
				if (!refreshedForum) {
					throw new Error(`Forum channel for column ${card.column} disappeared during tag update`)
				}
				forum = refreshedForum
			} catch (error) {
				roadmapLogger.warn(
					`Failed to update forum tags for column ${card.column}, continuing with existing tags:`,
					error
				)
			}
		}

		// Build tag mapping from available tags (case-insensitive)
		const labelToTagId = new Map<string, string>()
		for (const tag of forum.availableTags) {
			labelToTagId.set(tag.name.toLowerCase(), tag.id)
		}

		// Determine operation and sync
		const operation = await syncCard(card, forums, labelToTagId, columnsMap, guild.id, false)

		roadmapLogger.debug(`Sync operation completed: ${operation} for card ${card.id}`)

		// Get thread ID after sync
		const threadId = getSyncedPostId(guild.id, card.id)
		if (!threadId) {
			throw new Error('Failed to sync card: no thread created')
		}

		// Build thread URL
		const threadUrl = `https://discord.com/channels/${guild.id}/${threadId}`

		// Update sync timestamp to keep it consistent with full sync
		await updateSettings(guild.id, { lastSyncTimestamp: Date.now() })

		roadmapLogger.info(`Successfully synced card ${card.id}: thread ${threadId}`)

		return { threadId, threadUrl }
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		roadmapLogger.error(`Failed to sync card ${card.id} (${card.title}): ${message}`)
		throw new Error(`Failed to sync card ${card.id} (${card.title}): ${message}`)
	}
}

/**
 * Attempts to reuse a historical thread when a card returns to a previously visited column.
 *
 * This helper checks thread history for a matching column, fetches and validates the candidate
 * thread, reactivates it (unarchives/unlocks), updates its content, and handles the previous
 * active thread by archiving it and adding it to history.
 *
 * @param card - The roadmap card being synced
 * @param existingThread - The currently active thread (from syncedPosts)
 * @param forum - The target forum channel for the card's current column
 * @param labelToTagId - Map of lowercase label names to Discord tag IDs
 * @param guildId - Guild ID for settings operations
 * @param dryRun - Whether this is a dry run (no mutations)
 * @returns The reused thread if successful, null if reuse failed or not applicable
 */
async function tryReuseHistoricalThread(
	card: RoadmapCard,
	existingThread: ThreadChannel | null,
	forum: ForumChannel,
	labelToTagId: Map<string, string>,
	guildId: string,
	dryRun: boolean
): Promise<ThreadChannel | null> {
	// Only attempt reuse if we have an existing thread in a different forum
	if (!existingThread || existingThread.parentId === forum.id) {
		return null
	}

	roadmapLogger.debug(
		`Column change detected for card ${card.id}. Checking thread history for target column ${card.column}`
	)

	// Step 1: Check history for a thread in the target column
	const historyEntry = getThreadForColumn(guildId, card.id, card.column)
	if (!historyEntry) {
		roadmapLogger.debug(`No historical thread found for card ${card.id} in column ${card.column}`)
		return null
	}

	roadmapLogger.debug(
		`Found historical thread ${historyEntry.threadId} for card ${card.id} in column ${card.column} (moved at ${new Date(historyEntry.movedAt).toISOString()})`
	)

	// Step 2: Fetch and validate the candidate thread
	let candidateThread: ThreadChannel
	try {
		const channel = await forum.client.channels.fetch(historyEntry.threadId)
		if (!channel || !channel.isThread() || channel.parentId !== forum.id) {
			roadmapLogger.debug(
				`Candidate thread ${historyEntry.threadId} for card ${card.id} is invalid (exists: ${Boolean(channel)}, isThread: ${channel?.isThread()}, correctForum: ${channel && channel.isThread() ? (channel as ThreadChannel).parentId === forum.id : false})`
			)
			return null
		}
		candidateThread = channel as ThreadChannel
		roadmapLogger.debug(
			`Validated candidate thread ${candidateThread.id} for card ${card.id}. Thread URL: ${candidateThread.url}`
		)
	} catch (error) {
		roadmapLogger.debug(
			`Failed to fetch candidate thread ${historyEntry.threadId} for card ${card.id}: ${error instanceof Error ? error.message : String(error)}`
		)
		return null
	}

	// Handle dry run mode - exit early before any mutations
	if (dryRun) {
		roadmapLogger.info(
			`[DRY RUN] Would reuse thread ${historyEntry.threadId} for card ${card.id} in column ${card.column}. Thread URL: ${candidateThread.url}`
		)
		return candidateThread // Return the thread to indicate success (caller will handle dry run return)
	}

	// Step 3: Reactivate the thread (unarchive and unlock)
	try {
		await candidateThread.setArchived(false, 'Roadmap sync: reactivating thread for column return')
		roadmapLogger.debug(`Unarchived thread ${candidateThread.id} for card ${card.id}`)
	} catch (error) {
		roadmapLogger.warn(
			`Failed to unarchive thread ${candidateThread.id} for card ${card.id}: ${error instanceof Error ? error.message : String(error)}`
		)
		// Fall back to standard flow
		return null
	}

	try {
		await candidateThread.setLocked(false, 'Roadmap sync: reactivating thread for column return')
		roadmapLogger.debug(`Unlocked thread ${candidateThread.id} for card ${card.id}`)
	} catch (error) {
		roadmapLogger.warn(
			`Failed to unlock thread ${candidateThread.id} for card ${card.id}: ${error instanceof Error ? error.message : String(error)}`
		)
		return null
	}

	// Step 4: Update reused thread content
	const reuseTags = card.labels
		.map((label) => labelToTagId.get(label.toLowerCase()))
		.filter((tagId): tagId is string => Boolean(tagId))
		.slice(0, 5)
	const reuseThreadName = formatThreadName(card, guildId)

	try {
		// Update thread metadata (name and tags)
		await candidateThread.edit({
			name: reuseThreadName,
			appliedTags: reuseTags,
			reason: 'Roadmap sync: card returned to column'
		})
		roadmapLogger.debug(`Updated thread metadata for ${candidateThread.id} (card ${card.id})`)

		// Update starter message if bot-authored with Components v2
		try {
			const starter = (await candidateThread.fetchStarterMessage()) as Message | null
			if (starter && starter.author.id === forum.client.user?.id) {
				const { flags, components } = await formatCardContentV2(card, guildId, forum.guild)
				// Explicitly remove content field when using Components v2
				await starter.edit({ flags, components, content: null })
				roadmapLogger.debug(`Updated starter message for thread ${candidateThread.id} (card ${card.id})`)
			}
		} catch (error) {
			roadmapLogger.warn(
				`Failed to update starter message for thread ${candidateThread.id} (card ${card.id}): ${error instanceof Error ? error.message : String(error)}`
			)
			// Non-critical, continue with reuse
		}
	} catch (error) {
		roadmapLogger.warn(
			`Failed to update reused thread ${candidateThread.id} for card ${card.id}: ${error instanceof Error ? error.message : String(error)}. Falling back to standard flow.`
		)
		return null
	}

	// Step 5: Handle previous active thread (if it exists and is different)
	if (existingThread && existingThread.id !== candidateThread.id) {
		// Post notification in old thread
		try {
			const notificationMessage = `🔄 This thread has been moved to ${card.column}. Continue discussion here: ${candidateThread.url}`
			await existingThread.send(notificationMessage)
			roadmapLogger.debug(
				`Posted move notification in old thread ${existingThread.id} for card ${card.id}. Thread URL: ${existingThread.url}`
			)
		} catch (error) {
			roadmapLogger.warn(
				`Failed to post move notification in old thread ${existingThread.id} for card ${card.id}: ${error instanceof Error ? error.message : String(error)}`
			)
		}

		// Lock and archive the previous thread
		try {
			await existingThread.setLocked(true, 'Roadmap sync: card returned to previous column')
			await existingThread.setArchived(true, 'Roadmap sync: card returned to previous column')
			roadmapLogger.debug(
				`Locked and archived old thread ${existingThread.id} for card ${card.id}. Thread URL: ${existingThread.url}`
			)
		} catch (error) {
			roadmapLogger.warn(
				`Failed to lock/archive old thread ${existingThread.id} for card ${card.id}: ${error instanceof Error ? error.message : String(error)}`
			)
		}

		// Add previous thread to history
		try {
			const currentThreadInfo = getCurrentThreadInfo(guildId, card.id, existingThread.parentId!)
			const previousColumnName = currentThreadInfo?.column ?? existingThread.parent?.name ?? 'Unknown'

			addThreadToHistory(guildId, card.id, {
				threadId: existingThread.id,
				column: previousColumnName,
				forumId: existingThread.parentId!,
				movedAt: Date.now(),
				messageCount: existingThread.messageCount ?? 0
			})
			roadmapLogger.debug(`Added thread ${existingThread.id} to history for card ${card.id}`)
		} catch (error) {
			roadmapLogger.warn(
				`Failed to add thread ${existingThread.id} to history for card ${card.id}: ${error instanceof Error ? error.message : String(error)}`
			)
		}
	}

	// Step 6: Update sync mappings
	setSyncedPost(guildId, card.id, candidateThread.id)
	roadmapLogger.info(
		`Reused thread ${candidateThread.id} for card ${card.id} in column ${card.column}. Thread URL: ${candidateThread.url}`
	)

	return candidateThread
}

/**
 * Handles column changes by moving the thread to a new forum.
 *
 * Creates a new thread in the target forum, links to previous discussion if applicable,
 * archives the old thread, and updates sync mappings/history.
 *
 * @param card - The roadmap card being synced
 * @param existingThread - The thread in the old forum
 * @param forum - The target forum channel
 * @param appliedTags - Tag IDs to apply to the new thread
 * @param guildId - Guild ID for settings operations
 * @param dryRun - Whether this is a dry run
 * @returns 'create' operation type
 */
async function handleColumnMoveWithNewThread(
	card: RoadmapCard,
	existingThread: ThreadChannel,
	forum: ForumChannel,
	appliedTags: string[],
	guildId: string,
	dryRun: boolean
): Promise<ThreadOperation> {
	roadmapLogger.debug(
		`Initiating thread move for card ${card.id} from forum ${existingThread.parentId} to ${forum.id}`
	)

	if (dryRun) {
		roadmapLogger.info(
			`[DRY RUN] Would move thread for card ${card.id} from forum ${existingThread.parent?.name ?? existingThread.parentId} to forum ${forum.name}`
		)
		return 'create'
	}

	try {
		await moveThreadToNewForum(card, existingThread, forum, appliedTags, guildId)
		roadmapLogger.info(`Successfully moved thread for card ${card.id} to forum ${forum.name}`)
		return 'create'
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		roadmapLogger.error(`Failed to move thread for card ${card.id}: ${message}`)
		throw error
	}
}

/**
 * Applies in-place operations (create/update/archive) for cards that haven't moved forums.
 *
 * Determines the appropriate operation based on thread existence and column state,
 * then executes the operation with appropriate error handling.
 *
 * @param card - The roadmap card being synced
 * @param forum - The forum channel for the card's column
 * @param column - The column metadata
 * @param existingThreadId - The existing thread ID (if any)
 * @param existingThread - The existing thread (if fetched)
 * @param appliedTags - Tag IDs to apply
 * @param formattedContentV2 - Formatted card content with Components v2 structure
 * @param threadName - Formatted thread name
 * @param guildId - Guild ID for settings operations
 * @param dryRun - Whether this is a dry run
 * @returns The operation type that was performed
 */
async function applyInPlaceOperation(
	card: RoadmapCard,
	forum: ForumChannel,
	column: RoadmapColumn | undefined,
	existingThreadId: string | undefined,
	existingThread: ThreadChannel | null,
	appliedTags: string[],
	formattedContentV2: { flags: number; components: ContainerBuilder[] },
	threadName: string,
	guildId: string,
	dryRun: boolean
): Promise<ThreadOperation> {
	// Determine operation based on existing thread and column state
	let operation: ThreadOperation = 'skip'

	if (existingThreadId && column?.archived && column.createForum !== true) {
		operation = 'archive'
	} else if (existingThreadId) {
		operation = 'update'
	} else if (column?.archived && column.createForum !== true) {
		// Skip creating new threads for cards in archived columns that don't create forums
		operation = 'skip'
	} else {
		operation = 'create'
	}

	// Handle dry run
	if (dryRun) {
		roadmapLogger.info(`[DRY RUN] Would ${operation} thread for card ${card.id}: ${threadName}`)
		return operation
	}

	// Execute operation
	if (operation === 'create') {
		const thread = await forum.threads.create({
			name: threadName,
			message: formattedContentV2,
			appliedTags,
			reason: 'Roadmap sync: new card'
		})
		setSyncedPost(guildId, card.id, thread.id)
		roadmapLogger.info(`Created thread for card ${card.id}: ${thread.name}`)
		return 'create'
	} else if (operation === 'update') {
		try {
			// Reuse existingThread from column change detection if available, otherwise fetch
			let thread: ThreadChannel
			if (existingThread && existingThread.parentId === forum.id) {
				thread = existingThread
			} else {
				// Use client.channels.fetch to reliably access archived threads
				const channel = await forum.client.channels.fetch(existingThreadId!)
				if (!channel || !channel.isThread() || channel.parentId !== forum.id) {
					// Thread was deleted or invalid, treat as create
					roadmapLogger.warn(`Thread ${existingThreadId} not found for card ${card.id}, creating new thread`)
					const newThread = await forum.threads.create({
						name: threadName,
						message: formattedContentV2,
						appliedTags,
						reason: 'Roadmap sync: recreating deleted thread'
					})
					setSyncedPost(guildId, card.id, newThread.id)
					roadmapLogger.info(`Created thread for card ${card.id}: ${newThread.name}`)
					return 'create'
				}
				thread = channel as ThreadChannel
			}
			await thread.edit({ name: threadName, appliedTags, reason: 'Roadmap sync: card updated' })

			// Update starter message if bot authored it with Components v2
			const starter = (await thread.fetchStarterMessage()) as Message | null
			if (starter && starter.author.id === forum.client.user?.id) {
				const { flags, components } = await formatCardContentV2(card, guildId, forum.guild)
				// Explicitly remove content field when using Components v2
				await starter.edit({ flags, components, content: null })
			}

			roadmapLogger.info(`Updated thread for card ${card.id}: ${thread.name}`)
			return 'update'
		} catch (error) {
			if (isDiscordError(error) && error.code === 10008) {
				// Unknown message/thread - treat as create
				roadmapLogger.warn(`Thread ${existingThreadId} not found for card ${card.id}, creating new thread`)
				const newThread = await forum.threads.create({
					name: threadName,
					message: formattedContentV2,
					appliedTags,
					reason: 'Roadmap sync: recreating deleted thread'
				})
				setSyncedPost(guildId, card.id, newThread.id)
				roadmapLogger.info(`Created thread for card ${card.id}: ${newThread.name}`)
				return 'create'
			}
			throw error
		}
	} else if (operation === 'archive') {
		try {
			// Reuse existingThread from column change detection if available, otherwise fetch
			let thread: ThreadChannel
			if (existingThread && existingThread.parentId === forum.id) {
				thread = existingThread
			} else {
				// Use client.channels.fetch to reliably access archived threads
				const channel = await forum.client.channels.fetch(existingThreadId!)
				if (!channel || !channel.isThread() || channel.parentId !== forum.id) {
					roadmapLogger.warn(`Thread ${existingThreadId} not found for card ${card.id}, skipping archive`)
					return 'skip'
				}
				thread = channel as ThreadChannel
			}
			await thread.setArchived(true, 'Roadmap sync: card completed')
			roadmapLogger.info(`Archived thread for card ${card.id}: ${thread.name}`)
			return 'archive'
		} catch (error) {
			if (isDiscordError(error) && error.code === 10008) {
				// Unknown message/thread - already gone, skip
				roadmapLogger.warn(`Thread ${existingThreadId} not found for card ${card.id}, skipping archive`)
				return 'skip'
			}
			throw error
		}
	}

	return 'skip'
}

/**
 * Syncs a single card to its Discord forum thread (create/update/archive).
 *
 * Routes cards to the appropriate forum, maps labels to Discord tags, and formats content.
 * Determines operation based on existing thread and column state.
 */
async function syncCard(
	card: RoadmapCard,
	forums: Map<string, ForumChannel>,
	labelToTagId: Map<string, string>,
	columns: Map<string, RoadmapColumn>,
	guildId: string,
	dryRun: boolean
): Promise<ThreadOperation> {
	// Get the target forum for this card's column
	const column = columns.get(card.column)
	const forum = forums.get(card.column)

	// If no forum channel found for this column, log error and skip
	if (!forum) {
		roadmapLogger.warn(`No forum channel found for column ${card.column}, skipping card ${card.id}`)
		return 'skip'
	}

	// Fetch existing thread (if any) for column change detection
	const existingThreadId = getSyncedPostId(guildId, card.id)
	let existingThread: ThreadChannel | null = null

	if (existingThreadId) {
		try {
			const channel = await forum.client.channels.fetch(existingThreadId)
			if (channel && channel.isThread()) {
				existingThread = channel as ThreadChannel
				if (existingThread.parentId !== forum.id) {
					roadmapLogger.debug(
						`Column change detected for card ${card.id}: thread in forum ${existingThread.parentId}, target forum ${forum.id}`
					)
				}
			}
		} catch (error) {
			existingThread = null
			roadmapLogger.debug(
				`Could not fetch thread ${existingThreadId} for column change detection (card ${card.id}): ${error instanceof Error ? error.message : String(error)}`
			)
		}
	}

	// Branch 1: Try reusing historical thread if card returned to a previous column
	const reusedThread = await tryReuseHistoricalThread(card, existingThread, forum, labelToTagId, guildId, dryRun)
	if (reusedThread) {
		return 'update'
	}

	// Prepare thread metadata for create/update/move operations
	const appliedTags = card.labels
		.map((label) => labelToTagId.get(label.toLowerCase()))
		.filter((tagId): tagId is string => Boolean(tagId))
		.slice(0, 5)
	const formattedContentV2 = await formatCardContentV2(card, guildId, forum.guild)
	const threadName = formatThreadName(card, guildId)

	// Branch 2: Handle column move with new thread creation
	if (existingThread && existingThread.parentId && existingThread.parentId !== forum.id) {
		return await handleColumnMoveWithNewThread(card, existingThread, forum, appliedTags, guildId, dryRun)
	}

	// Branch 3: Apply in-place operation (create/update/archive)
	return await applyInPlaceOperation(
		card,
		forum,
		column,
		existingThreadId,
		existingThread,
		appliedTags,
		formattedContentV2,
		threadName,
		guildId,
		dryRun
	)
}

/**
 * Synchronizes roadmap data from a provider to Discord forum posts.
 *
 * Fetches cards and columns from the provider, updates forum tags, and creates/updates/archives
 * threads based on card state. The operation is idempotent - existing threads are tracked and
 * updated in place.
 *
 * @param options - Sync configuration (guild, provider, dryRun).
 * @returns Sync result with statistics.
 * @throws Error if no forum channels configured or missing Discord permissions.
 *
 * @example
 * ```ts
 * const result = await syncRoadmap({
 *   guild: interaction.guild,
 *   provider
 * });
 * ```
 */
export async function syncRoadmap(options: SyncOptions): Promise<SyncResult> {
	const { guild, provider, syncId, dryRun = false, onProgress, signal } = options

	try {
		// Validate prerequisites - get all forum channels
		const forums = await getAllForumChannels(guild)
		if (forums.size === 0) {
			throw new Error('No roadmap forums configured. Run /roadmap setup first.')
		}

		roadmapLogger.info(
			`Starting roadmap sync${syncId ? ` [${syncId}]` : ''} for guild ${guild.name} with ${forums.size} forum channels${dryRun ? ' [DRY RUN]' : ''}`
		)

		// Fetch provider data
		const cards = await provider.fetchCards()
		let columns = await provider.getColumns()
		
		// Check for custom columns (guild-level override)
		const customColumns = getCustomColumns(guild.id)
		if (customColumns) {
			columns = customColumns.map((col) => ({
				id: col.id,
				name: col.name,
				order: col.order,
				archived: col.archived ?? false,
				createForum: col.createForum ?? (col.archived ? false : true)
			}))
			roadmapLogger.debug(`Using custom columns for guild ${guild.id}: ${columns.map((c) => c.name).join(', ')}`)
		}
		
		roadmapLogger.info(
			`Fetched ${cards.length} cards and ${columns.length} columns from provider${syncId ? ` [${syncId}]` : ''}`
		)

		// Get guild-level column mapping overrides
		const guildColumnMapping = getColumnMapping(guild.id)
		
		// Apply column mapping to cards (guild overrides first, then provider config)
		const mappedCards = cards.map((card) => {
			const originalStatus = (card.metadata?.originalStatus as string) || card.column
			
			// Try to resolve column using provider's resolveColumn with guild mapping
			const resolved = provider.resolveColumn(originalStatus, guildColumnMapping)
			
			if (resolved === null) {
				// Status mapped to null - track but don't create forum thread
				return {
					...card,
					column: originalStatus, // Keep original for tracking
					metadata: {
						...(card.metadata || {}),
						originalStatus,
						trackOnly: true // Flag to skip forum creation
					}
				}
			} else if (resolved !== undefined) {
				// Mapped to a column
				return {
					...card,
					column: resolved,
					metadata: {
						...(card.metadata || {}),
						originalStatus
					}
				}
			}
			
			// No mapping found - use card's existing column (provider default)
			return {
				...card,
				metadata: {
					...(card.metadata || {}),
					originalStatus
				}
			}
		})

		// Create column map for quick lookup
		const columnMap = new Map(columns.map((col) => [col.name, col]))

		// Group cards by column for tag updates (exclude track-only cards)
		const cardsByColumn = new Map<string, RoadmapCard[]>()
		for (const card of mappedCards) {
			// Skip cards that are tracked but not synced to forums
			const trackOnly = (card.metadata as { trackOnly?: boolean })?.trackOnly
			if (trackOnly) {
				continue
			}
			
			if (!cardsByColumn.has(card.column)) {
				cardsByColumn.set(card.column, [])
			}
			cardsByColumn.get(card.column)!.push(card)
		}

		// Update tags for each forum (including archived columns with createForum: true)
		for (const column of columns) {
			// Skip archived columns that don't create forums
			if (column.archived && column.createForum !== true) {
				continue
			}

			const cardsInColumn = cardsByColumn.get(column.name) || []
			const allLabelsFlat = cardsInColumn.flatMap((card) => card.labels)

			// Deduplicate labels case-insensitively
			const labelMap = new Map<string, string>()
			for (const label of allLabelsFlat) {
				const lowerLabel = label.toLowerCase()
				if (!labelMap.has(lowerLabel)) {
					labelMap.set(lowerLabel, label)
				}
			}
			const columnLabels = Array.from(labelMap.values())

			if (columnLabels.length > 0) {
				try {
					await updateForumTagsForColumn(guild, column.name, columnLabels)
				} catch (error) {
					roadmapLogger.warn(
						`Failed to update forum tags for column ${column.name}, continuing with existing tags:`,
						error
					)
				}
			}
		}

		// Refresh forum channels to get updated tags
		const refreshedForums = await getAllForumChannels(guild)
		if (refreshedForums.size === 0) {
			throw new Error('Forum channels disappeared during sync')
		}

		// Build tag ID mapping per forum (case-insensitive)
		const forumTagMappings = new Map<string, Map<string, string>>()
		for (const [columnName, forum] of refreshedForums.entries()) {
			const labelNameToTagId = new Map<string, string>()
			for (const tag of forum.availableTags) {
				labelNameToTagId.set(tag.name.toLowerCase(), tag.id)
			}
			forumTagMappings.set(columnName, labelNameToTagId)
		}

		// Initialize sync statistics
		const stats = {
			total: mappedCards.length,
			created: 0,
			updated: 0,
			archived: 0,
			errors: 0
		}

		// Initialize error collection array
		const syncErrors: SyncError[] = []

		// Helper function to create a SyncError from an error and card
		const createSyncError = (error: unknown, card: RoadmapCard): SyncError => {
			const errorMessage = error instanceof Error ? error.message : String(error)
			let errorType: SyncError['errorType'] = 'unknown'

			if (isDiscordError(error)) {
				errorType = 'discord_api'
			} else if (errorMessage.includes('provider') || errorMessage.includes('API')) {
				errorType = 'provider_api'
			} else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
				errorType = 'validation'
			}

			return {
				cardId: card.id,
				cardTitle: card.title,
				errorMessage,
				errorType,
				cardUrl: card.url
			}
		}

		// Send initial progress update if callback provided
		if (onProgress && mappedCards.length > 0) {
			try {
				await onProgress({
					currentIndex: 0,
					totalCards: mappedCards.length,
					currentCard: mappedCards[0],
					stats: { ...stats },
					dryRun,
					errors: [...syncErrors]
				})
			} catch (error) {
				roadmapLogger.warn(
					`Initial progress callback failed: ${error instanceof Error ? error.message : String(error)}`
				)
			}
		}

		// Process each card
		for (let i = 0; i < mappedCards.length; i++) {
			if (signal?.aborted) {
				roadmapLogger.info(
					`Sync canceled by user${syncId ? ` [${syncId}]` : ''} for guild ${guild.id} after processing ${i}/${mappedCards.length} cards`
				)
				throw new SyncCanceledError()
			}

			const card = mappedCards[i]
			
			// Skip cards that are tracked but not synced to forums
			const trackOnly = (card.metadata as { trackOnly?: boolean })?.trackOnly
			if (trackOnly) {
				// Still track in syncedPosts but without thread ID
				setSyncedPost(guild.id, card.id, '')
				const originalStatus = (card.metadata as { originalStatus?: string })?.originalStatus || card.column
				roadmapLogger.debug(`Skipping forum sync for card ${card.id} (track-only status: ${originalStatus})`)
				continue
			}
			
			try {
				// Get the tag mapping for this card's column
				const labelToTagId = forumTagMappings.get(card.column) || new Map<string, string>()
				const operation = await syncCard(card, refreshedForums, labelToTagId, columnMap, guild.id, dryRun)

				// Update statistics
				if (operation === 'create') stats.created++
				else if (operation === 'update') stats.updated++
				else if (operation === 'archive') stats.archived++
			} catch (error) {
				stats.errors++
				roadmapLogger.error(`Failed to sync card ${card.id} (${card.title}):`, error)

				// Collect error details
				const syncError = createSyncError(error, card)
				syncErrors.push(syncError)

				// Handle specific Discord API errors
				if (isDiscordError(error)) {
					if (error.code === 429) {
						roadmapLogger.warn('Rate limit exceeded. Consider reducing sync frequency.')
					} else if (error.code === 403) {
						throw new Error(
							'Missing permissions to manage forum threads. Ensure the bot has "Manage Threads" and "Send Messages in Threads" permissions.'
						)
					}
				}
			}

			// Invoke progress callback if provided
			if (onProgress) {
				try {
					await onProgress({
						currentIndex: i,
						totalCards: mappedCards.length,
						currentCard: card,
						stats: { ...stats },
						dryRun,
						errors: [...syncErrors]
					})
				} catch (error) {
					roadmapLogger.warn(
						`Progress callback failed for card ${card.id}: ${error instanceof Error ? error.message : String(error)}`
					)
				}
			}
		}

		// Update sync timestamp
		if (!dryRun) {
			await updateSettings(guild.id, { lastSyncTimestamp: Date.now() })
		}

		roadmapLogger.info(
			`Sync completed${syncId ? ` [${syncId}]` : ''}: ${stats.created} created, ${stats.updated} updated, ${stats.archived} archived, ${stats.errors} errors`
		)

		// Return sync result
		return {
			cards: mappedCards,
			columns,
			syncedAt: new Date(),
			stats,
			errors: syncErrors
		}
	} catch (error) {
		roadmapLogger.error(`Sync failed${options.syncId ? ` [${options.syncId}]` : ''}:`, error)
		throw error
	}
}
