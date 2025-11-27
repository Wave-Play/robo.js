import {
	type ButtonInteraction,
	PermissionFlagsBits,
	StringSelectMenuBuilder,
	ActionRowBuilder,
	MessageFlags
} from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { Buttons, Selects } from '../../core/constants.js'
import { getProvider } from '../_start.js'
import { getSettings } from '../../core/settings.js'

/**
 * Global cache for button flow pending column mappings.
 * Key: `${guildId}:${userId}`, Value: { messageId?: string, webhookId?: string, webhookToken?: string }
 */
declare global {
	// eslint-disable-next-line no-var
	var roadmapPendingColumnMappings: Map<string, { messageId?: string; webhookId?: string; webhookToken?: string }> | undefined
}

/**
 * Button interaction handler for adding column mappings.
 *
 * This handler processes clicks on the "Add Column Mapping" button and displays an ephemeral
 * message with both a provider status select and column select. When both are selected,
 * the mapping is automatically created.
 */

export const config: EventConfig = {
	description: 'Opens selects for adding a new column mapping'
}

export default async (interaction: ButtonInteraction) => {
	// Filter interaction - only process our specific button
	if (!interaction.isButton() || interaction.customId !== Buttons.AddColumnMapping.id) {
		return
	}

	// Validate guild context is available
	if (!interaction.guildId || !interaction.guild) {
		await interaction.reply({
			content: 'This action can only be performed in a server',
			ephemeral: true
		})
		return
	}

	// Validate user has Administrator permission
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		logger.debug(`User @${interaction.user.username} does not have permission to add column mappings`)
		await interaction.reply({
			content: "You don't have permission to use this. Only administrators can add column mappings.",
			ephemeral: true
		})
		return
	}

	// Get known statuses and columns for the select menus
	const settings = getSettings(interaction.guildId)
	let knownStatuses: string[] = []
	let availableColumns: string[] = []
	
	if (settings.lastSyncTimestamp) {
		try {
			const provider = getProvider()
			if (provider) {
				const cards = await provider.fetchCards()
				const statusSet = new Set<string>()
				for (const card of cards) {
					const originalStatus = (card.metadata?.originalStatus as string) || card.column
					if (originalStatus) {
						statusSet.add(originalStatus)
					}
				}
				knownStatuses = Array.from(statusSet).sort()
				
				// Get available columns
				const columns = await provider.getColumns()
				availableColumns = columns.map((col) => col.name).sort()
			}
		} catch (error) {
			logger.warn('Failed to fetch cards/columns for column mapping:', error)
		}
	}

	if (knownStatuses.length === 0) {
		await interaction.reply({
			content: 'No provider statuses found. Run `/roadmap sync` first to discover statuses.',
			ephemeral: true
		})
		return
	}

	if (availableColumns.length === 0) {
		await interaction.reply({
			content: 'No columns available. Check your provider configuration.',
			ephemeral: true
		})
		return
	}

	// Store webhook info for later message update (needed for updating the original setup message)
	const cacheKey = `${interaction.guildId}:${interaction.user.id}`
	if (!globalThis.roadmapPendingColumnMappings) {
		globalThis.roadmapPendingColumnMappings = new Map()
	}
	
	// Store webhook info temporarily (will be used when mapping is created)
	globalThis.roadmapPendingColumnMappings.set(cacheKey, {
		messageId: interaction.message?.id,
		webhookId: interaction.webhook?.id,
		webhookToken: interaction.webhook?.token
	})

	// Build status select menu
	const statusSelect = new StringSelectMenuBuilder()
		.setCustomId(`${Selects.ColumnMappingStatus.id}:button`)
		.setPlaceholder('Select a provider status to map')
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(
			knownStatuses.slice(0, 25).map((status) => ({
				label: status.length > 100 ? status.substring(0, 97) + '...' : status,
				value: status,
				description: 'Provider status'
			}))
		)

	// Build column select menu (include "Track Only" option)
	const columnOptions = [
		...availableColumns.map((col) => ({
			label: col,
			value: col,
			description: 'Map to this column'
		})),
		{
			label: 'Track Only (no forum)',
			value: '__null__',
			description: 'Track status but do not create forum thread'
		}
	]

	const columnSelect = new StringSelectMenuBuilder()
		.setCustomId(`${Selects.ColumnMappingColumn.id}:button`)
		.setPlaceholder('Select a column (or Track Only)')
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(columnOptions.slice(0, 25))

	// Show ephemeral message with both selects
	await interaction.reply({
		content: '**Add New Column Mapping**\nSelect both a provider status and column below. The mapping will be created automatically when both are selected.',
		components: [
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents([statusSelect]),
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents([columnSelect])
		],
		flags: MessageFlags.Ephemeral
	})
}

