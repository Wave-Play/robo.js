import {
	type ButtonInteraction,
	type StringSelectMenuInteraction,
	PermissionFlagsBits,
	MessageFlags,
	ContainerBuilder,
	SectionBuilder,
	TextDisplayBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	ActionRowBuilder,
	Colors,
	SeparatorBuilder,
	SeparatorSpacingSize
} from 'discord.js'
import { type EventConfig } from 'robo.js'
import { Buttons } from '../../core/constants.js'
import { roadmapLogger } from '../../core/logger.js'
import { activeSyncs } from '../../commands/roadmap/sync.js'
import type { SyncError } from '../../types.js'

/**
 * Handles viewing sync errors from completed roadmap sync operations.
 *
 * This handler processes clicks on the "View Errors" button that appears when a sync
 * completes with errors. It shows an interactive ephemeral message with a browsable
 * list of errors, allowing users to view detailed error information for each failed card.
 *
 * Features:
 * - List view: Shows summary and truncated list of all errors with a string select menu
 * - Detail view: Shows full error details for a selected error with a back button
 * - Error sanitization: Removes stack traces and technical details, keeps user-friendly messages
 * - Pagination: Handles cases where errors exceed Discord's 25 option limit
 *
 * Edge cases handled:
 * - Sync not found (already cleaned up)
 * - Unauthorized user attempts
 * - Invalid or malformed custom IDs
 * - Empty error list
 */
export const config: EventConfig = {
	description: 'Shows sync errors in an interactive browsable format'
}

/**
 * Sanitizes error messages by removing stack traces and technical details.
 *
 * @param errorMessage - Raw error message that may contain stack traces
 * @returns Sanitized error message suitable for user display
 */
function sanitizeErrorMessage(errorMessage: string): string {
	// Remove stack traces (lines starting with "at " or file paths)
	const lines = errorMessage.split('\n')
	const filteredLines = lines.filter((line) => {
		const trimmed = line.trim()
		// Skip stack trace lines
		if (trimmed.startsWith('at ') || trimmed.includes('node_modules') || trimmed.includes('file://')) {
			return false
		}
		// Skip empty lines at the end
		return true
	})

	let sanitized = filteredLines.join('\n').trim()

	// Truncate to reasonable length (1000 chars)
	if (sanitized.length > 1000) {
		sanitized = sanitized.substring(0, 997) + '...'
	}

	return sanitized || 'An unknown error occurred'
}

/**
 * Builds the error list view UI.
 *
 * @param errors - Array of sync errors to display
 * @param syncId - Sync identifier for button custom IDs
 * @returns Components array for the list view
 */
function buildErrorListView(
	errors: readonly SyncError[],
	syncId: string
): { flags: typeof MessageFlags.IsComponentsV2; components: (ContainerBuilder | ActionRowBuilder<StringSelectMenuBuilder>)[] } {
	const MAX_SELECT_OPTIONS = 25
	const displayErrors = errors.slice(0, MAX_SELECT_OPTIONS)
	const hasMore = errors.length > MAX_SELECT_OPTIONS

	// Sections in Components v2 MUST have an accessory (button or thumbnail)
	// Use a placeholder button to satisfy this requirement
	const headerSection = new SectionBuilder().addTextDisplayComponents([
		new TextDisplayBuilder().setContent(
			`❌ **Sync Errors**\n${errors.length} error${errors.length === 1 ? '' : 's'} occurred during sync.\n\nSelect an error below to view details.`
		)
	]).setButtonAccessory(
		new ButtonBuilder()
			.setCustomId(`${Buttons.ViewSyncErrors.id}-placeholder-${syncId}`)
			.setLabel('\u200b') // Zero-width space: satisfies length constraint, renders as "empty"
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true)
	)

	const container = new ContainerBuilder()
		.setAccentColor(Colors.Red)
		.addSectionComponents(headerSection)

	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
	)

	// Build error list text (truncated preview)
	const errorPreviews = displayErrors
		.map((error, index) => {
			const preview = error.errorMessage.length > 50 ? error.errorMessage.substring(0, 47) + '...' : error.errorMessage
			return `${index + 1}. **${error.cardTitle}** (${error.cardId})\n   ${preview}`
		})
		.join('\n\n')

	if (hasMore) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${errorPreviews}\n\n_Showing first ${MAX_SELECT_OPTIONS} of ${errors.length} errors. Use the select menu to view details._`
			)
		)
	} else {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(errorPreviews))
	}

	// Build string select menu with proper validation
	// Discord limits: label 100 chars, description 100 chars, value 100 chars
	const selectOptions = displayErrors.map((error, index) => {
		const cardIdPrefix = `${error.cardId}: `
		const maxTitleLength = 100 - cardIdPrefix.length - 3 // Reserve space for prefix and "..."
		const truncatedTitle = error.cardTitle.length > maxTitleLength 
			? error.cardTitle.substring(0, maxTitleLength - 3) + '...' 
			: error.cardTitle
		
		return {
			label: `${cardIdPrefix}${truncatedTitle}`.substring(0, 100), // Ensure max 100 chars
			value: index.toString(), // Index is safe (0-24 max)
			description: error.errorMessage.substring(0, 100) // Max 100 chars
		}
	})

	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(`${Buttons.ViewSyncErrors.id}-select-${syncId}`)
		.setPlaceholder('Select an error to view details')
		.setOptions(selectOptions)

	const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents([selectMenu])

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container, actionRow]
	}
}

/**
 * Builds the error detail view UI.
 *
 * @param error - The sync error to display in detail
 * @param errorIndex - Index of the error in the original list
 * @param syncId - Sync identifier for button custom IDs
 * @returns Components array for the detail view
 */
function buildErrorDetailView(
	error: SyncError,
	errorIndex: number,
	syncId: string
): { flags: typeof MessageFlags.IsComponentsV2; components: ContainerBuilder[] } {
	const sanitizedMessage = sanitizeErrorMessage(error.errorMessage)

	const container = new ContainerBuilder()
		.setAccentColor(Colors.Red)
		.addSectionComponents(
			new SectionBuilder().addTextDisplayComponents([
				new TextDisplayBuilder().setContent(
					`❌ **Error Details**\n\n**Card:** ${error.cardTitle}\n**ID:** ${error.cardId}${error.cardUrl ? `\n**URL:** ${error.cardUrl}` : ''}${error.errorType ? `\n**Type:** ${error.errorType}` : ''}`
				)
			])
			.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(`${Buttons.ViewSyncErrors.id}-back-${syncId}`)
					.setLabel('← Back to List')
					.setStyle(ButtonStyle.Secondary)
			)
		)

	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
	)

	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`**Error Message:**\n${sanitizedMessage}`)
	)

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container]
	}
}

/**
 * Handles button clicks to view sync errors.
 */
async function handleButtonClick(interaction: ButtonInteraction) {
	if (
		!interaction.isButton() ||
		!interaction.customId.startsWith(Buttons.ViewSyncErrors.id + '-')
	) {
		return
	}

	try {
		// Extract syncId from custom ID: ${Buttons.ViewSyncErrors.id}-${syncId}
		const prefix = `${Buttons.ViewSyncErrors.id}-`
		if (!interaction.customId.startsWith(prefix)) {
			await interaction.deferReply({ ephemeral: true })
			await interaction.followUp({
				content: 'Invalid sync error request.',
				ephemeral: true
			})
			return
		}

		const syncId = interaction.customId.slice(prefix.length)

		if (!syncId) {
			await interaction.deferReply({ ephemeral: true })
			await interaction.followUp({
				content: 'Invalid sync error request.',
				ephemeral: true
			})
			return
		}

		await interaction.deferReply({ ephemeral: true })

		if (!interaction.guildId || !interaction.guild) {
			await interaction.followUp({
				content: 'This action can only be performed in a server.',
				ephemeral: true
			})
			return
		}

		roadmapLogger.debug(`Looking up sync ${syncId} for error list, activeSyncs has ${activeSyncs.size} entries`)
		const syncData = activeSyncs.get(syncId)
		if (!syncData) {
			roadmapLogger.warn(`Sync ${syncId} not found in activeSyncs. Available syncs: ${Array.from(activeSyncs.keys()).join(', ')}`)
			await interaction.followUp({
				content: 'This sync has already been cleaned up. Error details are no longer available.',
				ephemeral: true
			})
			return
		}

		const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
		const isStarter = interaction.user.id === syncData.startedBy

		if (!isAdmin && !isStarter) {
			roadmapLogger.debug(
				`User @${interaction.user.username} is not authorized to view errors for sync ${syncId} in guild ${interaction.guildId}`
			)
			await interaction.followUp({
				content: 'Only administrators or the user who started this sync can view its errors.',
				ephemeral: true
			})
			return
		}

		const errors = syncData.errors || []
		if (errors.length === 0) {
			await interaction.followUp({
				content: 'No errors found for this sync.',
				ephemeral: true
			})
			return
		}

		// Show error list view
		const errorListView = buildErrorListView(errors, syncId)
		roadmapLogger.debug(`Building error list view with ${errors.length} errors, ${errorListView.components.length} components`)
		await interaction.editReply(errorListView)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		const errorDetails = error instanceof Error && 'rawError' in error 
			? JSON.stringify(error.rawError, null, 2)
			: error instanceof Error && 'code' in error
				? `Code: ${(error as { code?: number }).code}`
				: String(error)
		
		roadmapLogger.error(`Failed to show sync errors via button: ${message}`, {
			errorDetails,
			error: error instanceof Error ? error.stack : undefined
		})

		try {
			await interaction.followUp({
				content: `Failed to load sync errors: ${message}. Check bot logs for details.`,
				ephemeral: true
			})
		} catch {
			// no-op if we cannot send a follow-up
		}
	}
}

/**
 * Handles string select menu interactions to show error details.
 */
async function handleStringSelect(interaction: StringSelectMenuInteraction) {
	if (
		!interaction.isStringSelectMenu() ||
		!interaction.customId.startsWith(Buttons.ViewSyncErrors.id + '-select-')
	) {
		return
	}

	try {
		// Extract syncId from custom ID: ${Buttons.ViewSyncErrors.id}-select-${syncId}
		const prefix = `${Buttons.ViewSyncErrors.id}-select-`
		if (!interaction.customId.startsWith(prefix)) {
			await interaction.deferUpdate()
			await interaction.followUp({
				content: 'Invalid error selection request.',
				ephemeral: true
			})
			return
		}

		const syncId = interaction.customId.slice(prefix.length)

		if (!syncId) {
			await interaction.deferUpdate()
			await interaction.followUp({
				content: 'Invalid error selection request.',
				ephemeral: true
			})
			return
		}

		await interaction.deferUpdate()

		if (!interaction.guildId || !interaction.guild) {
			await interaction.followUp({
				content: 'This action can only be performed in a server.',
				ephemeral: true
			})
			return
		}

		roadmapLogger.debug(`Looking up sync ${syncId} for error details, activeSyncs has ${activeSyncs.size} entries`)
		const syncData = activeSyncs.get(syncId)
		if (!syncData) {
			roadmapLogger.warn(`Sync ${syncId} not found in activeSyncs. Available syncs: ${Array.from(activeSyncs.keys()).join(', ')}`)
			await interaction.followUp({
				content: 'This sync has already been cleaned up. Error details are no longer available.',
				ephemeral: true
			})
			return
		}

		const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
		const isStarter = interaction.user.id === syncData.startedBy

		if (!isAdmin && !isStarter) {
			roadmapLogger.debug(
				`User @${interaction.user.username} is not authorized to view error details for sync ${syncId} in guild ${interaction.guildId}`
			)
			await interaction.followUp({
				content: 'Only administrators or the user who started this sync can view its errors.',
				ephemeral: true
			})
			return
		}

		const errors = syncData.errors || []
		if (errors.length === 0) {
			await interaction.followUp({
				content: 'No errors found for this sync.',
				ephemeral: true
			})
			return
		}

		const selectedIndex = parseInt(interaction.values[0], 10)
		if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= errors.length) {
			await interaction.followUp({
				content: 'Invalid error selection.',
				ephemeral: true
			})
			return
		}

		const error = errors[selectedIndex]

		// Show error detail view
		await interaction.editReply(buildErrorDetailView(error, selectedIndex, syncId))
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		roadmapLogger.error(`Failed to show error details via select: ${message}`)

		try {
			await interaction.followUp({
				content: `Failed to load error details: ${message}`,
				ephemeral: true
			})
		} catch {
			// no-op if we cannot send a follow-up
		}
	}
}

/**
 * Handles back button clicks to return to error list.
 */
async function handleBackButton(interaction: ButtonInteraction) {
	if (
		!interaction.isButton() ||
		!interaction.customId.startsWith(Buttons.ViewSyncErrors.id + '-back-')
	) {
		return
	}

	try {
		// Extract syncId from custom ID: ${Buttons.ViewSyncErrors.id}-back-${syncId}
		const prefix = `${Buttons.ViewSyncErrors.id}-back-`
		if (!interaction.customId.startsWith(prefix)) {
			await interaction.deferUpdate()
			await interaction.followUp({
				content: 'Invalid back button request.',
				ephemeral: true
			})
			return
		}

		const syncId = interaction.customId.slice(prefix.length)

		if (!syncId) {
			await interaction.deferUpdate()
			await interaction.followUp({
				content: 'Invalid back button request.',
				ephemeral: true
			})
			return
		}

		await interaction.deferUpdate()

		if (!interaction.guildId || !interaction.guild) {
			await interaction.followUp({
				content: 'This action can only be performed in a server.',
				ephemeral: true
			})
			return
		}

		roadmapLogger.debug(`Looking up sync ${syncId} for back button, activeSyncs has ${activeSyncs.size} entries`)
		const syncData = activeSyncs.get(syncId)
		if (!syncData) {
			roadmapLogger.warn(`Sync ${syncId} not found in activeSyncs. Available syncs: ${Array.from(activeSyncs.keys()).join(', ')}`)
			await interaction.followUp({
				content: 'This sync has already been cleaned up. Error details are no longer available.',
				ephemeral: true
			})
			return
		}

		const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
		const isStarter = interaction.user.id === syncData.startedBy

		if (!isAdmin && !isStarter) {
			roadmapLogger.debug(
				`User @${interaction.user.username} is not authorized to view errors for sync ${syncId} in guild ${interaction.guildId}`
			)
			await interaction.followUp({
				content: 'Only administrators or the user who started this sync can view its errors.',
				ephemeral: true
			})
			return
		}

		const errors = syncData.errors || []
		if (errors.length === 0) {
			await interaction.followUp({
				content: 'No errors found for this sync.',
				ephemeral: true
			})
			return
		}

		// Show error list view
		await interaction.editReply(buildErrorListView(errors, syncId))
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		roadmapLogger.error(`Failed to return to error list via back button: ${message}`)

		try {
			await interaction.followUp({
				content: `Failed to load error list: ${message}`,
				ephemeral: true
			})
		} catch {
			// no-op if we cannot send a follow-up
		}
	}
}

/**
 * Main handler that routes to appropriate sub-handlers based on interaction type.
 */
export default async (interaction: ButtonInteraction | StringSelectMenuInteraction) => {
	// Handle button clicks (initial view errors button)
	if (interaction.isButton() && interaction.customId.startsWith(Buttons.ViewSyncErrors.id + '-')) {
		if (interaction.customId.includes('-back-')) {
			await handleBackButton(interaction)
		} else {
			await handleButtonClick(interaction)
		}
		return
	}

	// Handle string select menu (error selection)
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith(Buttons.ViewSyncErrors.id + '-select-')) {
		await handleStringSelect(interaction)
		return
	}
}

