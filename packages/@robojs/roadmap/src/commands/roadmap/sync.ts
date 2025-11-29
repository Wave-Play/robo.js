/**
 * Manual roadmap sync command
 *
 * This command allows administrators to manually trigger a sync between the roadmap
 * provider (e.g., Jira) and the Discord forum channel. It validates all prerequisites,
 * executes the sync, and provides comprehensive feedback about the results.
 *
 * Prerequisites:
 * - Roadmap provider must be initialized (check via isProviderReady)
 * - Forum channel must be set up (via /roadmap setup)
 * - User must have Administrator permissions
 *
 * Features:
 * - Dry-run mode for testing without applying changes
 * - Comprehensive statistics on created/updated/archived cards
 * - Error categorization for user-friendly feedback
 * - Ephemeral replies to keep sync messages private
 *
 * @module
 */

import type { ChatInputCommandInteraction, Guild, ForumChannel, GuildMember } from 'discord.js'
import {
	PermissionFlagsBits,
	MessageFlags,
	ComponentType,
	SectionBuilder,
	TextDisplayBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	ContainerBuilder,
	SeparatorBuilder,
	Colors,
	SeparatorSpacingSize
} from 'discord.js'
import { createCommandConfig } from 'robo.js'
import type { CommandResult } from 'robo.js'
import { getProvider, isProviderReady } from '../../events/_start.js'
import { syncRoadmap, type SyncProgressUpdate, SyncCanceledError } from '../../core/sync-engine.js'
import { getAllForumChannels } from '../../core/forum-manager.js'
import { roadmapLogger } from '../../core/logger.js'
import { Buttons } from '../../core/constants.js'
import type { SyncData } from '../../types.js'

/**
 * Tracks active roadmap sync operations by Discord interaction ID.
 *
 * Entries contain the abort controller and metadata about who initiated the sync.
 * They are removed when the sync completes, fails, or is canceled.
 */
export const activeSyncs = new Map<string, SyncData>()

/**
 * Command configuration
 *
 * Restricts the command to administrators only and prevents usage in DMs.
 * Provides a dry-run option for testing sync behavior without applying changes.
 */
export const config = createCommandConfig({
	description: 'Manually syncs the roadmap forum with the latest cards from your provider',
	defaultMemberPermissions: PermissionFlagsBits.Administrator,
	dmPermission: false,
	options: [
		{
			name: 'dry-run',
			description: 'Preview changes without applying them',
			type: 'boolean',
			required: false
		}
	]
} as const)

/**
 * Manual roadmap sync command handler
 *
 * Validates prerequisites, executes the sync, and provides detailed feedback about
 * the sync results including statistics on created, updated, and archived cards.
 *
 * Flow:
 * 1. Validate guild context
 * 2. Defer reply (ephemeral)
 * 3. Check provider initialization
 * 4. Validate forum setup
 * 5. Execute sync
 * 6. Format and send results
 *
 * Error handling:
 * - Missing configuration: Provides actionable setup guidance
 * - Missing forum: Directs user to run /roadmap setup
 * - Missing permissions: Lists required permissions
 * - Authentication errors: Suggests credential verification
 * - Generic errors: Logs details and provides user-friendly message
 *
 * @param interaction - Discord command interaction
 * @returns Result message or void
 *
 * @example
 * User runs: /roadmap sync
 * Response: "Sync Complete
 * Total Cards: 15
 * Created: 3
 * Updated: 5
 * Archived: 2
 * Synced At: 1/1/2024, 12:00:00 PM
 * View the roadmap in #roadmap"
 *
 * @example
 * User runs: /roadmap sync dry-run:true
 * Response: "Dry Run Complete (no changes applied)
 * Total Cards: 15
 * Created: 3
 * Updated: 5
 * Archived: 2
 * ..."
 */
export default async function (interaction: ChatInputCommandInteraction): Promise<CommandResult> {
	// Validate guild context is available
	if (!interaction.guildId) {
		return 'This command can only be run in a server'
	}

	if (!interaction.guild) {
		return 'This command can only be run in a server'
	}

	// Defer reply so we have more time to sync
	await interaction.deferReply()

	// Check provider initialization status
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

	// Validate forum setup exists
	const guild = interaction.guild
	const forums = await getAllForumChannels(guild)
	if (forums.size === 0) {
		return 'Roadmap forums are not set up. Run `/roadmap setup` first to create the forum channels.'
	}

	// Get dry-run option from command
	const dryRun = interaction.options.getBoolean('dry-run') ?? false

	const syncId = interaction.id
	const controller = new AbortController()
	const signal = controller.signal

	activeSyncs.set(syncId, {
		controller,
		startedBy: interaction.user.id,
		guildId: interaction.guildId,
		dryRun,
		startedAt: Date.now()
	})

	// Schedule auto-cleanup in case this sync is abandoned (15 minutes)
	const CLEANUP_TIMEOUT_MS = 15 * 60 * 1000
	const timeoutId = setTimeout(() => {
		if (activeSyncs.has(syncId)) {
			roadmapLogger.warn(
				'Auto-cleaning abandoned sync %s after 15 minutes - this indicates an abnormal termination',
				syncId
			)
			activeSyncs.delete(syncId)
		}
	}, CLEANUP_TIMEOUT_MS)
	// Persist timeout id on the entry for later clearing
	activeSyncs.set(syncId, {
		...activeSyncs.get(syncId)!,
		cleanupTimeoutId: timeoutId
	})

	type FooterMetadata = {
		syncId: string
		startedByUsername: string
		dryRun: boolean
	}

	const startedByUsername = interaction.user.username
	const footerInfo: FooterMetadata = { syncId, startedByUsername, dryRun }

	// Log sync start
	roadmapLogger.info(
		`Starting roadmap sync (dry-run: ${dryRun}, syncId: ${syncId}) for guild ${interaction.guildId} by user ${interaction.user.tag}`
	)

	// Progress tracking for throttled updates
	let lastUpdateTime = 0
	let lastUpdateIndex = -1
	const UPDATE_INTERVAL_MS = 3000 // Slightly wider margin to avoid Discord edit rate limits
	const UPDATE_BATCH_SIZE = 5 // Update every 5 cards
	let providerName = 'provider'
	let lastProgressUpdate: SyncProgressUpdate | null = null

	const buildFooterText = (
		update: SyncProgressUpdate | null,
		isComplete: boolean,
		info: FooterMetadata
	): string => {
		const parts = [`Started by @${info.startedByUsername}`]

		const isDryRun = update?.dryRun ?? info.dryRun
		if (isDryRun) {
			parts.push('🔍 Dry Run')
		}

		return parts.join(' | ')
	}

	const buildMissingPermissionsDescription = (guild: Guild | null, forums: Map<string, ForumChannel>): string => {
		const genericMessage =
			'The bot is missing required Discord permissions. On your roadmap category, grant the bot ' +
			'"View Channels", "Manage Channels", "Create Public Threads", "Send Messages in Threads", and "Manage Threads" ' +
			'so these permissions cascade to all roadmap forum channels.'

		try {
			if (!guild) {
				return genericMessage
			}

			const me: GuildMember | null = guild.members.me
			if (!me) {
				return genericMessage
			}

			// Use any forum channel as a representative to inspect permissions, preferring its parent category
			const firstForum = Array.from(forums.values())[0]
			const targetChannel = (firstForum?.parent ?? firstForum) ?? null
			if (!targetChannel) {
				return genericMessage
			}

			const perms = targetChannel.permissionsFor(me)
			if (!perms) {
				return genericMessage
			}

			const requiredPermissions: Array<[bigint, string]> = [
				[PermissionFlagsBits.ViewChannel, 'View Channels'],
				[PermissionFlagsBits.ManageChannels, 'Manage Channels'],
				[PermissionFlagsBits.CreatePublicThreads, 'Create Public Threads'],
				[PermissionFlagsBits.SendMessagesInThreads, 'Send Messages in Threads'],
				[PermissionFlagsBits.ManageThreads, 'Manage Threads']
			]

			const missing = requiredPermissions
				.filter(([flag]) => !perms.has(flag))
				.map(([, label]) => label)

			if (missing.length === 0) {
				// Permissions look correct on this channel; fall back to generic guidance.
				return genericMessage
			}

			const locationName = targetChannel.parent
				? `the "${targetChannel.parent.name}" roadmap category`
				: `the "${targetChannel.name}" roadmap forum channel`

			return (
				'The bot is missing required Discord permissions for roadmap sync.\n' +
				`Missing on ${locationName}: ${missing.join(', ')}.\n` +
				'Grant these permissions to the bot role on the roadmap category so they cascade to all roadmap forum channels.'
			)
		} catch (error) {
			roadmapLogger.warn('Failed to compute detailed missing permissions message:', error)
			return genericMessage
		}
	}

	/**
	 * Builds Components v2 UI showing sync progress.
	 * @param update - Progress update data
	 * @param isComplete - Whether the sync is complete
	 * @returns Components array for v2 message
	 */
	const buildProgressComponents = (
		update: SyncProgressUpdate | null,
		isComplete: boolean,
		info: FooterMetadata
	) => {
		// Pre-compute forum summary text for completion state
		const forumChannels = Array.from(forums.values())
		const forumSummary =
			forumChannels.length > 0
				? `📂 View roadmap: ${forumChannels
						.slice(0, 3)
						.map((forum) => forum.toString())
						.join(', ')}`
				: ''

		// Determine container color based on state
		let accentColor: number = Colors.Yellow // Yellow (starting/in-progress)
		if (isComplete && update) {
			accentColor = update.stats.errors > 0 ? Colors.Red : Colors.Green // Red if errors, Green otherwise
		}

		// Build main status text
		let statusText = ''
		
		if (isComplete && update) {
			const isDryRun = update.dryRun ?? info.dryRun
			const cardCountText = `${update.totalCards} card${update.totalCards === 1 ? '' : 's'}`
			if (isDryRun) {
				statusText = `✅ **Dry Run Complete (no changes applied)**\nPreviewed ${cardCountText} from ${providerName}`
			} else {
				statusText = `✅ **Sync Complete**\nSynced ${cardCountText} from ${providerName}`
			}
		} else if (update) {
			const progress = update.currentIndex + 1
			const percent = Math.round((progress / update.totalCards) * 100)
			const cardTitle =
				update.currentCard.title.length > 80
					? update.currentCard.title.substring(0, 77) + '...'
					: update.currentCard.title
			statusText = `⏳ **Syncing Roadmap**\nProcessing **${progress}/${update.totalCards}** cards (${percent}%)\n${cardTitle}`
		} else {
			statusText = `⏳ **Starting Sync...**\nFetching cards from provider...`
		}

		// Build stats text
		const statsText = update
			? `✨ Created: **${update.stats.created}** • 📝 Updated: **${update.stats.updated}** • ` +
				`📦 Archived: **${update.stats.archived}** • ❌ Errors: **${update.stats.errors}**`
			: ''

		// Build footer text
		const footerText = buildFooterText(update, isComplete, info)

		// Build component structure with container
		// Main status section with optional cancel button
		const statusSection = new SectionBuilder().addTextDisplayComponents([
			new TextDisplayBuilder().setContent(statusText)
		])

		// For completion state, show completion button (enabled if errors exist); otherwise show cancel option
		if (isComplete) {
			const hasErrors = update && update.stats.errors > 0
			const buttonLabel = hasErrors
				? `${dryRun ? 'Dry Run' : 'Sync Complete'} (${update.stats.errors} error${update.stats.errors === 1 ? '' : 's'})`
				: dryRun
					? 'Dry Run (preview only)'
					: 'Sync Complete'

			statusSection.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(
						hasErrors
							? `${Buttons.ViewSyncErrors.id}-${info.syncId}`
							: 'roadmap:sync:completed' // never actually used
					)
					.setLabel(buttonLabel)
					.setStyle(hasErrors ? ButtonStyle.Danger : ButtonStyle.Secondary)
					.setDisabled(!hasErrors)
			)
		} else {
			statusSection.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(`${Buttons.CancelSync.id}-${info.syncId}`)
					.setLabel('Cancel Sync')
					.setStyle(ButtonStyle.Danger)
			)
		}

		const container = new ContainerBuilder().setAccentColor(accentColor).addSectionComponents(statusSection)

		container.addSeparatorComponents(
			new SeparatorBuilder()
			.setSpacing(SeparatorSpacingSize.Large)
			.setDivider(true)
		)

		// Stats text (if available)
		if (statsText) {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statsText))
		}

		// For completion state, surface key roadmap forums for quick navigation
		if (isComplete && forumSummary) {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(forumSummary))
		}

		// Separator and footer
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText))

		// Wrap in container with accent color
		return [container]
	}

	// Helper: clear auto-cleanup timeout for a sync (if present)
	const clearSyncTimeout = (id: string) => {
		const data = activeSyncs.get(id)
		if (data?.cleanupTimeoutId) {
			clearTimeout(data.cleanupTimeoutId)
			roadmapLogger.debug(`Cleared auto-cleanup timeout for sync ${id}`)
		}
	}

	// Send initial progress UI
	try {
		await interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: buildProgressComponents(null, false, footerInfo)
		})
	} catch (error) {
		roadmapLogger.warn('Failed to send initial progress UI:', error)
	}

	// Execute sync operation
	try {
		const providerInfo = await provider.getProviderInfo()
		providerName = providerInfo.name

		// Define progress callback with throttling
		const onProgress = async (update: SyncProgressUpdate) => {
			lastProgressUpdate = update

			const now = Date.now()
			const timeSinceLastUpdate = now - lastUpdateTime
			const cardsSinceLastUpdate = update.currentIndex - lastUpdateIndex

			// Only treat the first card as a special case if we haven't updated yet
			const isInitial = lastUpdateIndex < 0 && update.currentIndex === 0
			const isLastCard = update.currentIndex === update.totalCards - 1
			const intervalElapsed = timeSinceLastUpdate >= UPDATE_INTERVAL_MS
			const batchSizeReached = cardsSinceLastUpdate >= UPDATE_BATCH_SIZE

			const shouldUpdate = isInitial || isLastCard || intervalElapsed || batchSizeReached

			if (!shouldUpdate) {
				return
			}

			lastUpdateTime = now
			lastUpdateIndex = update.currentIndex

			try {
				await interaction.editReply({
					flags: MessageFlags.IsComponentsV2,
					components: buildProgressComponents(update, false, footerInfo)
				})
			} catch (error) {
				roadmapLogger.warn(
					`Failed to update progress UI for card ${update.currentIndex + 1}/${update.totalCards}: ${error instanceof Error ? error.message : String(error)}`
				)
			}
		}

		const result = await syncRoadmap({ guild, provider, dryRun, onProgress, signal, syncId })

		const finalUpdate: SyncProgressUpdate = {
			currentIndex: result.stats.total - 1,
			totalCards: result.stats.total,
			currentCard: result.cards[result.cards.length - 1] || {
				id: 'noop',
				title: 'No cards processed',
				description: 'No cards were processed during this sync.',
				labels: [],
				column: 'n/a',
				assignees: [],
				url: '',
				updatedAt: new Date()
			},
			stats: result.stats,
			dryRun,
			errors: result.errors
		}

		// Store errors in activeSyncs before cleanup (for button handler access)
		if (result.errors.length > 0) {
			const syncData = activeSyncs.get(syncId)
			if (syncData) {
				activeSyncs.set(syncId, {
					...syncData,
					errors: result.errors
				})
			}
		}

		// Build completion components
		const completionComponents = buildProgressComponents(finalUpdate, true, footerInfo)

		// Add forum links to the container
		// Insert forum links if needed in the future:
		// const forumLinks = Array.from(forums.values())
		// 	.map((f) => f.toString())
		// 	.join(', ')
		// (Reserved for future UI enhancement.)

		try {
			await interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: completionComponents
			})
		} catch (error) {
			roadmapLogger.error('Failed to send final completion UI:', error)
			return {
				embeds: [
					new EmbedBuilder()
						.setColor(0x57f287)
						.setTitle('Sync Complete')
						.setDescription(
							`Sync complete: ${result.stats.created} created, ${result.stats.updated} updated, ` +
								`${result.stats.archived} archived, ${result.stats.errors} errors`
						)
				]
			}
		}

		clearSyncTimeout(syncId)
		
		// Only delete sync entry if there are no errors
		// If errors exist, keep the entry so users can view them (cleanup timer will clean it up after 15 minutes)
		if (result.errors.length === 0) {
			activeSyncs.delete(syncId)
			roadmapLogger.debug(`Cleaned up sync ${syncId} from active syncs`)
		} else {
			// Schedule cleanup timer for error viewing (15 minutes)
			const ERROR_VIEWING_TIMEOUT_MS = 15 * 60 * 1000
			const errorTimeoutId = setTimeout(() => {
				if (activeSyncs.has(syncId)) {
					roadmapLogger.debug(
						`Auto-cleaning sync ${syncId} error data after 15 minutes`
					)
					activeSyncs.delete(syncId)
				}
			}, ERROR_VIEWING_TIMEOUT_MS)
			
			// Update sync data with cleanup timeout
			const syncData = activeSyncs.get(syncId)
			if (syncData) {
				activeSyncs.set(syncId, {
					...syncData,
					cleanupTimeoutId: errorTimeoutId
				})
			}
			
			roadmapLogger.debug(`Keeping sync ${syncId} in active syncs for error viewing (${result.errors.length} errors, cleanup in 15 minutes)`)
		}

		roadmapLogger.info(
			`Sync ${syncId} completed by @${interaction.user.username} in guild ${interaction.guildId}: ` +
				`${result.stats.created} created, ${result.stats.updated} updated, ` +
				`${result.stats.archived} archived, ${result.stats.errors} errors`
		)

		return
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		// Prefer stable identifier: custom error type
		if (error instanceof SyncCanceledError) {
			const latestProgress = lastProgressUpdate as SyncProgressUpdate | null
			const processedCards = (latestProgress?.currentIndex ?? -1) + 1
			const totalCards = latestProgress?.totalCards ?? processedCards
			const stats: SyncProgressUpdate['stats'] =
				latestProgress?.stats ?? {
					total: totalCards,
					created: 0,
					updated: 0,
					archived: 0,
					errors: 0
				}

			const processedLabel =
				totalCards > 0 ? `${processedCards}/${totalCards}` : `${processedCards}`

			const errors = latestProgress?.errors || []
			const hasErrors = stats.errors > 0

			// Store errors in activeSyncs before cleanup (for button handler access)
			if (hasErrors && errors.length > 0) {
				const syncData = activeSyncs.get(syncId)
				if (syncData) {
					activeSyncs.set(syncId, {
						...syncData,
						errors
					})
				}
			}

			clearSyncTimeout(syncId)
			if (!hasErrors) {
				activeSyncs.delete(syncId)
			}
			roadmapLogger.debug(`Cleaned up sync ${syncId} from active syncs after cancellation`)

			roadmapLogger.info(
				`Sync ${syncId} canceled by @${interaction.user.username} in guild ${interaction.guildId} after processing ${processedLabel} cards`
			)

			const noProgress = latestProgress === null
			const buttonLabel = hasErrors
				? `${dryRun ? 'Dry Run' : 'Sync Complete'} (${stats.errors} error${stats.errors === 1 ? '' : 's'})`
				: dryRun
					? 'Dry Run (preview only)'
					: 'Sync Complete'

			const cancellationContainer = new ContainerBuilder()
				.setAccentColor(Colors.Yellow)
				.addSectionComponents(
					new SectionBuilder().addTextDisplayComponents([
						new TextDisplayBuilder().setContent(
							noProgress
								? `⚠️ **Sync Canceled**\n**Partial sync:** Canceled before processing any cards\n\nThe sync was stopped immediately after starting.`
								: `⚠️ **Sync Canceled**\n**Partial sync:** ${processedLabel} cards processed\n\nThe sync was stopped early. Partial results are shown below.`
						)
					])
					.setButtonAccessory(
						new ButtonBuilder()
							.setCustomId(
								hasErrors
									? `${Buttons.ViewSyncErrors.id}-${syncId}`
									: 'roadmap:sync:completed' // never actually used
							)
							.setLabel(buttonLabel)
							.setStyle(hasErrors ? ButtonStyle.Danger : ButtonStyle.Secondary)
							.setDisabled(!hasErrors)
					)
				)

			cancellationContainer.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
			)

			cancellationContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`✨ Created: **${stats.created}** • 📝 Updated: **${stats.updated}** • ` +
						`📦 Archived: **${stats.archived}** • ❌ Errors: **${stats.errors}**`
				)
			)

			cancellationContainer.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(buildFooterText(latestProgress, true, footerInfo))
			)

			try {
				await interaction.editReply({
					flags: MessageFlags.IsComponentsV2,
					components: [cancellationContainer]
				})
			} catch (editError) {
				roadmapLogger.warn('Failed to send cancellation UI:', editError)
				return `Sync canceled after processing ${processedLabel} cards.`
			}

			return
		}

		const errorMessage = message.toLowerCase()

		let errorDescription = ''

		if (errorMessage.includes('no roadmap') && errorMessage.includes('configured')) {
			errorDescription = 'Roadmap forum is not set up. Run `/roadmap setup` first to create the forum channel.'
		} else if (errorMessage.includes('missing permissions')) {
			errorDescription = buildMissingPermissionsDescription(guild, forums)
		} else if (errorMessage.includes('authentication') || errorMessage.includes('credentials')) {
			errorDescription =
				'Provider authentication failed. Check your provider credentials ' +
				'(e.g., JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN) and try again.'
		} else {
			errorDescription = `${message}\n\nCheck the bot logs for more details.`
		}

		roadmapLogger.error('Sync failed:', error)
		clearSyncTimeout(syncId)
		activeSyncs.delete(syncId)
		roadmapLogger.debug(`Cleaned up sync ${syncId} from active syncs after error`)

		// Build error UI with Components v2
		const errorComponents = [
			{
				type: ComponentType.Container,
				accent_color: 0xed4245, // Red
				components: [
					new SectionBuilder().addTextDisplayComponents([
						new TextDisplayBuilder().setContent(`❌ **Sync Failed**\n${errorDescription}`)
					])
				]
			}
		]

		try {
			await interaction.editReply({
				flags: MessageFlags.IsComponentsV2,
				components: errorComponents
			})
		} catch (editError) {
			roadmapLogger.error('Failed to send error UI:', editError)
			return `Sync failed: ${message}. Check the bot logs for more details.`
		}

		return
	}
}
