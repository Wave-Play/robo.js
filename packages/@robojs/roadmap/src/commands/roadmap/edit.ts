/**
 * Roadmap card editing command
 *
 * This command allows authorized users to update existing roadmap cards in the external provider
 * (e.g., Jira). It validates authorization, updates the card, syncs the changes to Discord,
 * and provides feedback on the operation.
 *
 * Authorization:
 * - Administrators are always authorized
 * - Users with roles configured in /roadmap setup are authorized
 * - All other users are denied
 *
 * Prerequisites:
 * - Roadmap provider must be initialized (check via isProviderReady)
 * - Forum channels must be set up (via /roadmap setup)
 * - User must be authorized (admin or have an authorized role)
 * - Card must exist in the provider
 *
 * Features:
 * - Updates card in external provider with optional title, description, column, and labels
 * - Autocomplete for card selection showing existing synced cards
 * - Automatically syncs changes to Discord thread
 * - Comprehensive error handling with user-friendly messages
 * - Ephemeral replies to keep card edits private
 * - Partial updates: only provided fields are changed
 *
 * @module
 */

import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	ThreadChannel,
	Guild,
	ForumChannel
} from 'discord.js'
import { ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js'
import { createCommandConfig } from 'robo.js'
import type { CommandResult } from 'robo.js'
import { getProvider, isProviderReady, options } from '../../events/_start.js'
import { canUserCreateCards, getSettings, getSyncedPostId } from '../../core/settings.js'
import type { UpdateCardInput, RoadmapCard, RoadmapColumn } from '../../types.js'
import { formatCardContentV2, formatThreadName, moveThreadToNewForum } from '../../core/sync-engine.js'
import { client } from 'robo.js'
import { roadmapLogger } from '../../core/logger.js'
import { getForumChannelForColumn } from '../../core/forum-manager.js'

// In-memory cache for card titles and column options
interface CardCacheItem {
	cardId: string
	title: string
	identifier: string
	column?: string
}

interface CardTitleCache {
	items: CardCacheItem[]
	timestamp: number
}

interface ColumnCache {
	columns: Array<{ name: string; value: string }>
	timestamp: number
}

const cardCacheMap = new Map<string, CardTitleCache>() // Keyed by guildId
const columnCacheMap = new Map<string, ColumnCache>() // Keyed by guildId
const CACHE_TTL_MS = 60000 // 60 seconds

interface ColumnChangeContext {
	guild: Guild
	guildId: string
	currentCard: RoadmapCard
	updatedCard: RoadmapCard
	requestedColumn?: string | null
	thread: ThreadChannel
}

interface ColumnChangeResult {
	moved: boolean
	thread?: ThreadChannel
	newThreadId?: string
	oldThreadId?: string
	errorMessage?: string
}

interface DiscordApiError {
	readonly code?: number | string
}

function getDiscordErrorCode(error: unknown): number | string | undefined {
	if (error && typeof error === 'object' && 'code' in error) {
		return (error as DiscordApiError).code
	}

	return undefined
}

function getAppliedTagsFromForum(forum: ForumChannel, labels: string[]): string[] {
	const labelToTagId = new Map<string, string>()
	for (const tag of forum.availableTags) {
		labelToTagId.set(tag.name.toLowerCase(), tag.id)
	}

	return labels
		.map((label) => labelToTagId.get(label.toLowerCase()))
		.filter((tagId): tagId is string => Boolean(tagId))
		.slice(0, 5)
}

async function handleColumnChange({
	guild,
	guildId,
	currentCard,
	updatedCard,
	requestedColumn,
	thread
}: ColumnChangeContext): Promise<ColumnChangeResult> {
	const columnChanged =
		(requestedColumn && requestedColumn !== currentCard.column) || updatedCard.column !== currentCard.column

	if (!columnChanged) {
		return { moved: false, thread }
	}

	roadmapLogger.debug(
		`Column change detected for card ${updatedCard.id} in guild ${guildId}: ${currentCard.column} -> ${updatedCard.column}`
	)

	const targetForum = await getForumChannelForColumn(guild, updatedCard.column)
	if (!targetForum) {
		roadmapLogger.error(
			`Forum channel for column ${updatedCard.column} not found in guild ${guildId} while moving card ${updatedCard.id}`
		)

		return {
			moved: false,
			thread,
			errorMessage: `Forum channel for column ${updatedCard.column} not found. Run /roadmap setup to configure forums.`
		}
	}

	if (thread.parentId === targetForum.id) {
		roadmapLogger.debug(
			`Thread ${thread.id} for card ${updatedCard.id} already in forum ${targetForum.id}, skipping move`
		)

		return { moved: false, thread }
	}

	roadmapLogger.debug(
		`Checking if thread ${thread.id} needs to move from forum ${thread.parentId ?? 'unknown'} to ${targetForum.id}`
	)

	const appliedTags = getAppliedTagsFromForum(targetForum, updatedCard.labels)

	try {
		const newThread = await moveThreadToNewForum(updatedCard, thread, targetForum, appliedTags, guildId)
		roadmapLogger.info(
			`Successfully moved thread for card ${updatedCard.id} from forum ${thread.parent?.name ?? thread.parentId ?? 'unknown'} to ${targetForum.name}`
		)

		return {
			moved: true,
			thread: newThread,
			newThreadId: newThread.id,
			oldThreadId: thread.id
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		const errorCode = getDiscordErrorCode(error)

		if (errorCode === 403) {
			roadmapLogger.error(
				`Missing permissions to move thread for card ${updatedCard.id} from forum ${thread.parent?.name ?? thread.parentId ?? 'unknown'} to ${targetForum.name}: ${message}`
			)

			return {
				moved: false,
				thread,
				errorMessage:
					"Card was updated in the provider but the bot is missing permissions to move the Discord thread. Ensure it has 'Manage Threads' and 'Send Messages in Threads' for both forums."
			}
		}

		roadmapLogger.error(
			`Failed to move thread for card ${updatedCard.id} from forum ${thread.parent?.name ?? thread.parentId ?? 'unknown'} to ${targetForum.name}: ${message}`
		)

		return {
			moved: false,
			thread,
			errorMessage: `Card was updated in the provider but failed to move the Discord thread: ${message}. Run /roadmap sync to retry.`
		}
	}
}

/**
 * Jira-specific metadata structure for issue type information.
 */
interface JiraIssueMetadata {
	readonly issue?: {
		readonly fields?: {
			readonly issuetype?: {
				readonly name?: string
			}
		}
	}
}

/**
 * Command configuration
 *
 * Allows authorized users to edit existing roadmap cards with autocomplete for card selection.
 * Authorization is checked at runtime based on role configuration, not via defaultMemberPermissions.
 * Column choices are populated dynamically at first autocomplete call to match provider columns.
 */
export const config = createCommandConfig({
	description: 'Edits an existing roadmap card',
	dmPermission: false,
	options: [
		{
			name: 'card',
			description: 'Select the card to edit',
			type: 'string',
			required: true,
			autocomplete: true
		},
		{
			name: 'title',
			description: 'Updated card title',
			type: 'string',
			required: false
		},
		{
			name: 'description',
			description: 'Updated card description',
			type: 'string',
			required: false
		},
		{
			name: 'column',
			description: 'Updated column',
			type: 'string',
			required: false,
			autocomplete: true
		},
		{
			name: 'labels',
			description: 'Updated comma-separated labels (replaces existing)',
			type: 'string',
			required: false
		}
	]
} as const)

/**
 * Autocomplete handler for card and column selection
 *
 * Handles autocomplete for both 'card' and 'column' options with caching to minimize
 * network requests. For cards, fetches titles on first call and caches for 60 seconds.
 * For columns, fetches from provider and caches for 60 seconds.
 *
 * @param interaction - Discord autocomplete interaction
 * @returns Array of autocomplete options (max 25 for Discord API limit)
 */
export const autocomplete = async (interaction: AutocompleteInteraction) => {
	try {
		// Get focused option and guild ID
		const focusedOption = interaction.options.getFocused(true)
		const guildId = interaction.guildId

		// Validate guild context
		if (!guildId) {
			return []
		}

		// Handle column autocomplete
		if (focusedOption.name === 'column') {
			// Get provider instance
			const provider = getProvider()
			if (!provider) {
				return []
			}

			// Check cache first
			const cached = columnCacheMap.get(guildId)
			if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
				// Filter cached columns by user input
				const userInput = ((focusedOption.value as string) ?? '').toLowerCase()
				const filtered = userInput
					? cached.columns.filter((opt) => opt.name.toLowerCase().includes(userInput))
					: cached.columns

				return filtered.slice(0, 25)
			}

			// Fetch columns from provider if cache stale
			try {
				const columns = await provider.getColumns()
				const options = columns.map((col) => ({
					name: col.name,
					value: col.name
				}))

				// Cache the result
				columnCacheMap.set(guildId, {
					columns: options,
					timestamp: Date.now()
				})

				// Filter by user input
				const userInput = ((focusedOption.value as string) ?? '').toLowerCase()
				const filtered = userInput ? options.filter((opt) => opt.name.toLowerCase().includes(userInput)) : options

				return filtered.slice(0, 25)
			} catch (error) {
				roadmapLogger.warn('Failed to fetch columns for autocomplete:', error)

				return []
			}
		}

		// Handle card autocomplete
		if (focusedOption.name === 'card') {
			// Get settings to find synced cards
			const settings = getSettings(guildId)
			if (!settings?.syncedPosts || Object.keys(settings.syncedPosts).length === 0) {
				return []
			}

			// Get provider instance
			const provider = getProvider()
			if (!provider) {
				return []
			}

			// Check cache first
			const cached = cardCacheMap.get(guildId)
			let items: CardCacheItem[]

			if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
				items = cached.items
			} else {
				// Fetch all card titles with Promise.all
				const cardIds = Object.keys(settings.syncedPosts)

				// Map card IDs to fetch promises
				const cardFetches = cardIds.map(async (cardId) => {
					try {
						const card = await provider.getCard(cardId)
						if (card) {
							return {
								cardId,
								title: card.title,
								identifier: card.id ?? cardId,
								column: card.column
							}
						}
					} catch (error) {
						roadmapLogger.warn(`Failed to fetch card ${cardId} for autocomplete:`, error)
					}
					return null
				}) // Wait for all fetches and filter nulls
				const results = await Promise.all(cardFetches)
				items = results.filter((r): r is CardCacheItem => r !== null)
				cardCacheMap.set(guildId, { items, timestamp: Date.now() })
			}

			// Build options from cached cards
			const options: Array<{ name: string; value: string }> = []
			let matchCount = 0

			for (const item of items) {
				// Short-circuit after 25 matches
				if (matchCount >= 25) {
					break
				}

				const baseName = item.column
					? `${item.title} (${item.identifier}, ${item.column})`
					: `${item.title} (${item.identifier})`

				const name = baseName.length > 100 ? baseName.substring(0, 97) + '...' : baseName
				options.push({ name, value: item.cardId })
				matchCount++
			}

			// Filter by user input
			const userInput = ((focusedOption.value as string) ?? '').toLowerCase()
			const filtered = userInput ? options.filter((opt) => opt.name.toLowerCase().includes(userInput)) : options

			// Sort and limit to 25
			return filtered.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 25)
		}

		return []
	} catch (error) {
		roadmapLogger.error('Autocomplete error:', error)

		return []
	}
}

/**
 * Roadmap card editing command handler
 *
 * Validates authorization, updates the card in the external provider, syncs changes to Discord,
 * and provides detailed feedback about the operation.
 *
 * Flow:
 * 1. Validate guild context
 * 2. Defer reply (ephemeral)
 * 3. Check user authorization (admin or authorized role)
 * 4. Check provider initialization
 * 5. Parse command options
 * 6. Validate at least one field is provided
 * 7. Validate column against provider columns if provided
 * 8. Fetch current card to ensure it exists
 * 9. Update card via provider
 * 10. Update Discord thread if synced
 * 11. Format and send results
 *
 * Error handling:
 * - Unauthorized users: Directs to /roadmap setup for role configuration
 * - Missing configuration: Provides actionable setup guidance
 * - Card not found: Indicates card may have been deleted
 * - Invalid column: Lists valid columns
 * - No fields provided: Directs user to provide at least one field
 * - Provider errors: Categorizes and provides specific feedback
 * - Discord sync errors: Notes that card was updated but Discord may not be synced
 *
 * @param interaction - Discord command interaction
 * @returns Result message or void
 *
 * @example
 * User runs: /roadmap edit card:PROJ-123 title:"Updated title" labels:"bug, urgent"
 * Response: Rich embed with:
 * - Title: "Card Updated Successfully"
 * - Color: Success green (#57F287)
 * - Description: Discord thread link (if synced)
 * - Fields: ID, Title, Column, Labels, Provider URL
 * - Footer: "Updated in provider and Discord" or warning message
 */
export default async function (interaction: ChatInputCommandInteraction): Promise<CommandResult> {
	// Validate guild context
	if (!interaction.guildId) {
		return 'This command can only be run in a server'
	}

	if (!interaction.guild) {
		return 'This command can only be run in a server'
	}

	// Defer reply (ephemeral by default; configurable via plugin options)
	await interaction.deferReply({ ephemeral: options.ephemeralCommands ?? true })

	// Check authorization
	const userRoleIds =
		interaction.member?.roles instanceof Array
			? interaction.member.roles
			: Array.from(interaction.member?.roles?.cache?.values() ?? []).map((r) => r.id)
	const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false

	if (!canUserCreateCards(interaction.guildId, userRoleIds, isAdmin)) {
		return "You don't have permission to edit roadmap cards. Ask an administrator to authorize your role in /roadmap setup."
	}

	// Check provider initialization
	if (!isProviderReady()) {
		return (
			'Roadmap provider is not configured. Set up your provider credentials (e.g., JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN) ' +
			'and restart the bot, or configure the provider in your plugin options.'
		)
	}

	// Get provider instance
	const provider = getProvider()
	if (!provider) {
		return 'Roadmap provider is not available. Please check the bot logs for initialization errors.'
	}

	// Parse command options
	const cardId = interaction.options.getString('card', true)
	const title = interaction.options.getString('title')
	const description = interaction.options.getString('description')
	const column = interaction.options.getString('column')
	const labelsStr = interaction.options.getString('labels')
	const labels = labelsStr
		? labelsStr
				.split(',')
				.map((l) => l.trim())
				.filter(Boolean)
		: undefined

	roadmapLogger.debug(
		`Editing roadmap card: "${cardId}" by @${interaction.user.username} in guild ${interaction.guildId}`
	)

	// Validate at least one field is provided
	if (!title && !description && !column && !labels) {
		return 'Please provide at least one field to update (title, description, column, or labels)'
	}

	// Fetch current card to ensure it exists
	let currentCard
	try {
		currentCard = await provider.getCard(cardId)
		if (!currentCard) {
			return 'Card not found. It may have been deleted from the provider.'
		}
	} catch (error) {
		roadmapLogger.error('Failed to fetch card:', error)
		const message = error instanceof Error ? error.message : String(error)
		return `Failed to fetch card: ${message}`
	}

	let providerColumns: readonly RoadmapColumn[] | undefined

	// Validate column if provided
	if (column) {
		try {
			providerColumns = await provider.getColumns()
			const validColumn = providerColumns?.find((col) => col.name === column)
			if (!validColumn) {
				const columnNames = providerColumns?.map((col) => col.name).join(', ') ?? ''
				return `Invalid column "${column}". Available columns: ${columnNames}`
			}
		} catch (error) {
			roadmapLogger.error('Failed to get provider columns:', error)
			return 'Failed to retrieve provider columns. Check your provider configuration.'
		}
	}

	// Build UpdateCardInput
	const input: UpdateCardInput = {
		...(title && { title }),
		...(description != null && { description }),
		...(column && { column }),
		...(labels && { labels })
	}

	// Update card via provider
	let result
	try {
		result = await provider.updateCard(cardId, input)

		if (!result.success) {
			throw new Error(result.message || 'Card update failed')
		}
	} catch (error) {
		// Normalize error message safely
		const message = error instanceof Error ? error.message : String(error)
		const errorMessage = message.toLowerCase()

		if (errorMessage.includes('authentication') || errorMessage.includes('credentials')) {
			roadmapLogger.error('Card update failed due to authentication:', error)
			return 'Provider authentication failed. Contact an administrator to check provider credentials.'
		}

		if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('required')) {
			roadmapLogger.error('Card update failed due to validation:', error)
			return `Invalid card data: ${message}`
		}

		if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('reach')) {
			roadmapLogger.error('Card update failed due to network:', error)
			return 'Unable to reach provider. Try again later.'
		}

		if (errorMessage.includes('not found')) {
			roadmapLogger.error('Card update failed - card not found:', error)
			return 'Card not found. It may have been deleted from the provider.'
		}

		// Generic error
		roadmapLogger.error('Card update failed:', error)
		return `Failed to update card: ${message}`
	}

	roadmapLogger.info(
		`Card updated successfully: ${result.card.id} by @${interaction.user.username} in guild ${interaction.guildId}`
	)

	const columnChanged =
		(column && column !== currentCard.column) || result.card.column !== currentCard.column

	// Update Discord thread if synced
	let discordSynced = false
	let threadId: string | undefined
	let syncedThread: ThreadChannel | null = null
	let threadWasMoved = false
	let movedThreadOldId: string | undefined

	try {
		threadId = getSyncedPostId(interaction.guildId, cardId)
	} catch (error) {
		roadmapLogger.warn('Failed to get synced thread ID:', error)
	}

	const originalThreadId = threadId

	if (threadId) {
		try {
			const channel = await client.channels.fetch(threadId)
			if (channel && channel.isThread()) {
				// Cast through unknown to satisfy TypeScript's private property checks between thread channel variants
				syncedThread = channel as unknown as ThreadChannel
			}
		} catch (error) {
			roadmapLogger.warn('Failed to fetch synced Discord thread after card update:', error)
		}
	}

	if (syncedThread && columnChanged) {
		const columnChangeResult = await handleColumnChange({
			guild: interaction.guild,
			guildId: interaction.guildId,
			currentCard,
			updatedCard: result.card,
			requestedColumn: column,
			thread: syncedThread
		})

		if (columnChangeResult.errorMessage) {
			return columnChangeResult.errorMessage
		}

		if (columnChangeResult.moved) {
			threadWasMoved = true
			syncedThread = columnChangeResult.thread ?? syncedThread
			threadId = columnChangeResult.newThreadId ?? syncedThread?.id ?? threadId
			movedThreadOldId = columnChangeResult.oldThreadId ?? originalThreadId
			discordSynced = true
		}
	} else if (columnChanged && !syncedThread) {
		roadmapLogger.debug(`Column changed for card ${cardId} but no synced thread found to move`)
	}

	if (syncedThread && !threadWasMoved) {
		try {
			if (result.card.title !== currentCard.title) {
				await syncedThread.edit({ name: formatThreadName(result.card, interaction.guildId!) })
			}

			const starterMessage = await syncedThread.fetchStarterMessage()
			if (starterMessage && starterMessage.author?.id === client.user?.id) {
				const { flags, components } = await formatCardContentV2(result.card, interaction.guildId!, interaction.guild!)
				// Explicitly remove content field when using Components v2
				await starterMessage.edit({ flags, components, content: null })
			}

			const forum = syncedThread.parent
			if (forum && forum.type === ChannelType.GuildForum) {
				try {
					const appliedTags = getAppliedTagsFromForum(forum, result.card.labels)
					await syncedThread.edit({ appliedTags })
				} catch (error) {
					const errorCode =
						error && typeof error === 'object' && 'code' in error ? (error as { code?: number | string }).code : undefined
					if (errorCode !== 403 && errorCode !== 10003 && errorCode !== 10008) {
						roadmapLogger.warn('Failed to update thread tags:', error)
					}
				}
			}

			discordSynced = true
		} catch (error) {
			roadmapLogger.warn('Failed to sync Discord thread after card update:', error)
		}
	}

	if (syncedThread && columnChanged) {
		try {
			if (!providerColumns) {
				providerColumns = await provider.getColumns()
			}

			const newColumn = providerColumns?.find((col) => col.name === result.card.column)
			if (newColumn?.archived) {
				try {
					await syncedThread.setArchived(true, 'Roadmap edit: card completed')
				} catch (error) {
					const errorCode =
						error && typeof error === 'object' && 'code' in error ? (error as { code?: number | string }).code : undefined
					if (errorCode !== 403 && errorCode !== 10003 && errorCode !== 10008) {
						roadmapLogger.warn('Failed to archive thread:', error)
					}
				}
			} else if (!newColumn?.archived && syncedThread.archived) {
				try {
					await syncedThread.setArchived(false, 'Roadmap edit: card moved to active column')
				} catch (error) {
					const errorCode =
						error && typeof error === 'object' && 'code' in error ? (error as { code?: number | string }).code : undefined
					if (errorCode !== 403 && errorCode !== 10003 && errorCode !== 10008) {
						roadmapLogger.warn('Failed to unarchive thread:', error)
					}
				}
			}
		} catch (error) {
			roadmapLogger.warn('Failed to adjust thread archive state after column change:', error)
		}
	}

	// Build success response with embed
	try {
		// Create embed
		const embed = new EmbedBuilder().setTitle('Card Updated Successfully').setColor(0x57f287) // Success green

		// Set description with Discord thread link if available
		if (threadWasMoved && movedThreadOldId && threadId) {
			embed.setDescription(`Thread moved from <#${movedThreadOldId}> to <#${threadId}>`)
		} else if (threadId) {
			embed.setDescription(`Discord thread: <#${threadId}>`)
		}

		// Add fields
		const fields = []
		fields.push({ name: 'ID', value: result.card.id, inline: true })

		// Truncate title if needed (max 1024 chars for embed field values)
		const titleValue =
			result.card.title.length > 1024 ? result.card.title.substring(0, 1021) + '...' : result.card.title
		fields.push({ name: 'Title', value: titleValue, inline: true })

		fields.push({ name: 'Column', value: result.card.column, inline: true })

		if (columnChanged) {
			fields.push({
				name: 'Column Change',
				value: `${currentCard.column} -> ${result.card.column}`,
				inline: true
			})
		}

		// Add labels field if present (truncate with +N more indicator)
		if (result.card.labels.length > 0) {
			const maxLabels = 20 // Reasonable limit before truncation
			let labelsValue: string
			if (result.card.labels.length > maxLabels) {
				const visibleLabels = result.card.labels.slice(0, maxLabels)
				const remaining = result.card.labels.length - maxLabels
				labelsValue = visibleLabels.join(', ') + ` +${remaining} more`
			} else {
				labelsValue = result.card.labels.join(', ')
			}
			// Final safety check for 1024 char limit
			if (labelsValue.length > 1024) {
				labelsValue = labelsValue.substring(0, 1021) + '...'
			}
			fields.push({ name: 'Labels', value: labelsValue, inline: true })
		}

		// Add issue type field if available
		const issueType = (result.card.metadata as JiraIssueMetadata)?.issue?.fields?.issuetype?.name
		if (issueType) {
			fields.push({ name: 'Issue Type', value: issueType, inline: true })
		}

		// Add provider URL field if available (full width)
		if (result.card.url) {
			fields.push({ name: 'Provider URL', value: result.card.url, inline: false })
		}

		embed.addFields(fields)

		// Set footer with sync status
		if (threadWasMoved) {
			embed.setFooter({ text: 'Moved to new forum and updated in provider' })
		} else if (discordSynced) {
			embed.setFooter({ text: 'Updated in provider and Discord' })
		} else {
			embed.setFooter({ text: '⚠️ Updated in provider - Discord sync may require manual sync' })
		}

		return { embeds: [embed] }
	} catch (error) {
		// Fallback to plain text response if embed building fails
		roadmapLogger.error('Failed to build embed response:', error)

		let response = '**Card Updated Successfully**\n\n'
		response += `**ID:** ${result.card.id}\n`
		response += `**Title:** ${result.card.title}\n`
		response += `**Column:** ${result.card.column}\n`
		if (columnChanged) {
			response += `**Column Change:** ${currentCard.column} -> ${result.card.column}\n`
		}
		if (result.card.labels.length > 0) {
			response += `**Labels:** ${result.card.labels.join(', ')}\n`
		}
		if (result.card.url) {
			response += `**URL:** ${result.card.url}\n`
		}
		if (threadWasMoved && movedThreadOldId && threadId) {
			response += `Thread moved from <#${movedThreadOldId}> to <#${threadId}>\n`
		} else if (threadId) {
			response += `Discord thread: <#${threadId}>\n`
		}

		if (threadWasMoved) {
			response += '\nThe card has been updated in the provider and moved to the correct Discord forum.'
		} else if (discordSynced) {
			response += '\nThe card has been updated in both the provider and Discord.'
		} else {
			response += '\nThe card has been updated in the provider. Discord thread sync may require manual sync.'
		}

		return response
	}
}
