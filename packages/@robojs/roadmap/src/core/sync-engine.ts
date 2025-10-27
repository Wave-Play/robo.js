import type { Guild, ForumChannel, ThreadChannel, Message } from 'discord.js'
import type { RoadmapProvider } from '../providers/base.js'
import type { RoadmapCard, RoadmapColumn, SyncResult } from '../types.js'
import { updateSettings, getSyncedPostId, setSyncedPost } from './settings.js'
import { getAllForumChannels, updateForumTagsForColumn } from './forum-manager.js'
import { roadmapLogger } from './logger.js'

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
	/** Optional flag to preview changes without applying them (defaults to false) */
	dryRun?: boolean
}

/**
 * Type of operation to perform on a thread.
 */
export type ThreadOperation = 'create' | 'update' | 'archive' | 'skip'

/**
 * Formats a roadmap card into Discord message content with automatic truncation.
 *
 * Includes description and metadata (assignees, labels, last updated). Content is
 * truncated to respect Discord limits (4000 for thread creation, 2000 for updates).
 *
 * @param card - The roadmap card to format.
 * @param maxLength - Maximum character limit (default: 2000).
 * @returns Formatted message content.
 *
 * @example
 * ```ts
 * const content = formatCardContent(card, 4000);
 * ```
 */
export function formatCardContent(card: RoadmapCard, maxLength: number = 2000): string {
	// Use a safe default if description is undefined
	const desc = card.description || 'No description provided.'

	// Start with card description
	let content = desc

	// Add separator
	content += '\n\n---\n\n'

	// Build metadata sections
	const metadata: string[] = []

	// Assignees section
	if (card.assignees && card.assignees.length > 0) {
		const assigneeNames = card.assignees.map((a) => a.name).join(', ')
		metadata.push(`**Assigned to:** ${assigneeNames}`)
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
			'formatCardContent: Truncating content for card %s (original: %d, limit: %d)',
			card.id,
			fullContent.length,
			maxLength
		)

		const separator = '\n\n---\n\n'
		const truncationMarker = '\n... (truncated)'
		const availableSpace = maxLength - metadataContent.length - separator.length - truncationMarker.length

		// Metadata itself is too long, preserve minimal description
		if (availableSpace <= 0) {
			const minDescLength = 45 // Preserve first 45 characters of description
			const maxMetadataLength = maxLength - separator.length - truncationMarker.length - minDescLength
			// Clamp to avoid negative substring lengths
			const truncatedMetadata = metadataContent.substring(0, Math.max(0, maxMetadataLength)) + truncationMarker
			const minimalDesc = desc.substring(0, minDescLength) + truncationMarker
			fullContent = minimalDesc + separator + truncatedMetadata
		} else {
			const truncatedDescription = desc.substring(0, availableSpace) + truncationMarker
			fullContent = truncatedDescription + separator + metadataContent
		}
	}

	// Final safety check to guarantee character limit
	if (fullContent.length > maxLength) {
		fullContent = fullContent.substring(0, maxLength)
	}

	return fullContent
}

/**
 * Synchronizes a single roadmap card to Discord and returns thread metadata.
 *
 * @param card - The roadmap card to sync.
 * @param guild - The Discord guild to sync to.
 * @param provider - The roadmap provider instance.
 * @returns Object containing thread ID and URL.
 * @throws Error if forums not configured, card column not found, or Discord sync fails.
 *
 * @example
 * ```ts
 * const { threadId, threadUrl } = await syncSingleCard(newCard, guild, provider);
 * ```
 */
export async function syncSingleCard(
	card: RoadmapCard,
	guild: Guild,
	provider: RoadmapProvider
): Promise<{ threadId: string; threadUrl: string }> {
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
			throw new Error(`No forum channel found for column ${card.column}`)
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
		roadmapLogger.error(`No forum channel found for column ${card.column}, skipping card ${card.id}`)

		return 'skip'
	}

	// Determine operation based on existing thread and column state
	const existingThreadId = getSyncedPostId(guildId, card.id)
	let operation: ThreadOperation = 'skip'

	if (existingThreadId && column?.archived) {
		operation = 'archive'
	} else if (existingThreadId) {
		operation = 'update'
	} else if (column?.archived) {
		// Skip creating new threads for cards already in archived columns
		operation = 'skip'
	} else {
		operation = 'create'
	}

	// Map labels to tag IDs (case-insensitive, max 5 tags)
	const appliedTags = card.labels
		.map((label) => labelToTagId.get(label.toLowerCase()))
		.filter((tagId): tagId is string => Boolean(tagId))
		.slice(0, 5)

	// Format thread content with appropriate character limits
	const formattedContent = formatCardContent(card, 4000)
	const threadName = card.title.length > 100 ? card.title.substring(0, 97) + '...' : card.title

	// Execute operation
	if (dryRun) {
		roadmapLogger.info(`[DRY RUN] Would ${operation} thread for card ${card.id}: ${threadName}`)

		return operation
	}

	if (operation === 'create') {
		const thread = await forum.threads.create({
			name: threadName,
			message: { content: formattedContent },
			appliedTags,
			reason: 'Roadmap sync: new card'
		})
		setSyncedPost(guildId, card.id, thread.id)
		roadmapLogger.info(`Created thread for card ${card.id}: ${thread.name}`)

		return 'create'
	} else if (operation === 'update') {
		try {
			// Use client.channels.fetch to reliably access archived threads
			const channel = await forum.client.channels.fetch(existingThreadId!)
			if (!channel || !channel.isThread() || channel.parentId !== forum.id) {
				// Thread was deleted or invalid, treat as create
				roadmapLogger.warn(`Thread ${existingThreadId} not found for card ${card.id}, creating new thread`)
				const newThread = await forum.threads.create({
					name: threadName,
					message: { content: formattedContent },
					appliedTags,
					reason: 'Roadmap sync: recreating deleted thread'
				})
				setSyncedPost(guildId, card.id, newThread.id)
				roadmapLogger.info(`Created thread for card ${card.id}: ${newThread.name}`)

				return 'create'
			}

			const thread = channel as ThreadChannel
			await thread.edit({ name: threadName, appliedTags, reason: 'Roadmap sync: card updated' })

			// Update starter message if bot authored it
			// Message edits have a 2000 character limit in Discord
			const starter = (await thread.fetchStarterMessage()) as Message | null
			if (starter && starter.author.id === forum.client.user?.id) {
				await starter.edit({ content: formatCardContent(card, 2000) })
			}

			roadmapLogger.info(`Updated thread for card ${card.id}: ${thread.name}`)

			return 'update'
		} catch (error) {
			if (isDiscordError(error) && error.code === 10008) {
				// Unknown message/thread - treat as create
				roadmapLogger.warn(`Thread ${existingThreadId} not found for card ${card.id}, creating new thread`)
				const newThread = await forum.threads.create({
					name: threadName,
					message: { content: formattedContent },
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
			// Use client.channels.fetch to reliably access archived threads
			const channel = await forum.client.channels.fetch(existingThreadId!)
			if (!channel || !channel.isThread() || channel.parentId !== forum.id) {
				roadmapLogger.warn(`Thread ${existingThreadId} not found for card ${card.id}, skipping archive`)

				return 'skip'
			}

			const thread = channel as ThreadChannel
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
	const { guild, provider, dryRun = false } = options

	try {
		// Validate prerequisites - get all forum channels
		const forums = await getAllForumChannels(guild)
		if (forums.size === 0) {
			throw new Error('No roadmap forums configured. Run /roadmap setup first.')
		}

		roadmapLogger.info(
			`Starting roadmap sync for guild ${guild.name} with ${forums.size} forum channels${dryRun ? ' [DRY RUN]' : ''}`
		)

		// Fetch provider data
		const cards = await provider.fetchCards()
		const columns = await provider.getColumns()
		roadmapLogger.info(`Fetched ${cards.length} cards and ${columns.length} columns from provider`)

		// Create column map for quick lookup
		const columnMap = new Map(columns.map((col) => [col.name, col]))

		// Group cards by column for tag updates
		const cardsByColumn = new Map<string, RoadmapCard[]>()
		for (const card of cards) {
			if (!cardsByColumn.has(card.column)) {
				cardsByColumn.set(card.column, [])
			}
			cardsByColumn.get(card.column)!.push(card)
		}

		// Update tags for each non-archived forum
		for (const column of columns) {
			// Skip archived columns
			if (column.archived) {
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
			total: cards.length,
			created: 0,
			updated: 0,
			archived: 0,
			errors: 0
		}

		// Process each card
		for (const card of cards) {
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
		}

		// Update sync timestamp
		if (!dryRun) {
			await updateSettings(guild.id, { lastSyncTimestamp: Date.now() })
		}

		roadmapLogger.info(
			`Sync completed: ${stats.created} created, ${stats.updated} updated, ${stats.archived} archived, ${stats.errors} errors`
		)

		// Return sync result
		return {
			cards,
			columns,
			syncedAt: new Date(),
			stats
		}
	} catch (error) {
		roadmapLogger.error('Sync failed:', error)
		throw error
	}
}
