import {
	type StringSelectMenuInteraction,
	PermissionFlagsBits
} from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { Selects } from '../../core/constants.js'
import { setColumnMapping, getSettings } from '../../core/settings.js'
import { createSetupMessage } from '../../commands/roadmap/setup.js'
import { getRoadmapCategory, getAllForumChannels } from '../../core/forum-manager.js'
import { getProvider } from '../_start.js'

/**
 * Global cache for button flow pending column mappings.
 * Key: `${guildId}:${userId}`, Value: { status?: string, column?: string | null, messageId?: string, webhookId?: string, webhookToken?: string }
 */
declare global {
	// eslint-disable-next-line no-var
	var roadmapPendingColumnMappings: Map<string, { status?: string; column?: string | null; messageId?: string; webhookId?: string; webhookToken?: string }> | undefined
}

/**
 * Column mapping select menu interaction handler.
 *
 * This handler processes both provider status selections and column selections
 * from the column mapping select menus in the setup command. It coordinates between
 * the two selects to create mappings when both values are available.
 *
 * @remarks
 * Uses a temporary cache to store pending selections since the two selects are independent.
 * Only administrators can create column mappings.
 */

export const config: EventConfig = {
	description: 'Handles column mapping select menu interactions'
}

async function handleStatusSelect(interaction: StringSelectMenuInteraction) {
	// Check if this is from the button flow (customId ends with :button)
	const isFromButton = interaction.customId.endsWith(':button')
	
	if (isFromButton) {
		// Handle button flow
		await interaction.deferUpdate()

		// Validate guild context
		if (!interaction.guildId || !interaction.guild) {
			await interaction.followUp({
				content: 'This action can only be performed in a server',
				ephemeral: true
			})
			return
		}

		// Validate administrator permission
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
			logger.debug(`User @${interaction.user.username} does not have permission to modify column mappings`)
			await interaction.followUp({
				content: "You don't have permission to use this. Only administrators can create column mappings.",
				ephemeral: true
			})
			return
		}

		const status = interaction.values[0]
		if (!status) {
			return
		}

		// Check if mapping already exists
		const settings = getSettings(interaction.guildId)
		const existingMapping = settings.columnMapping?.[status]
		if (existingMapping !== undefined) {
			const mappingValue = existingMapping === null ? 'Track Only (no forum)' : existingMapping
			await interaction.followUp({
				content: `**${status}** is already mapped to ${mappingValue}. Remove the existing mapping first if you want to change it.`,
				ephemeral: true
			})
			return
		}

		// Use global cache for button flow
		const cacheKey = `${interaction.guildId}:${interaction.user.id}`
		if (!globalThis.roadmapPendingColumnMappings) {
			globalThis.roadmapPendingColumnMappings = new Map()
		}
		
		const cached = globalThis.roadmapPendingColumnMappings.get(cacheKey)
		if (cached) {
			cached.status = status
			
			// If column is already selected, create mapping immediately
			if (cached.column !== undefined) {
				await createMappingAndUpdate(interaction, status, cached.column, cached)
			}
		} else {
			globalThis.roadmapPendingColumnMappings.set(cacheKey, {
				status,
				messageId: interaction.message?.id,
				webhookId: interaction.webhook?.id,
				webhookToken: interaction.webhook?.token
			})
		}
	}
}

async function handleColumnSelect(interaction: StringSelectMenuInteraction) {
	// Check if this is from the button flow (customId ends with :button)
	const isFromButton = interaction.customId.endsWith(':button')
	
	if (isFromButton) {
		// Handle button flow
		await interaction.deferUpdate()

		// Validate guild context
		if (!interaction.guildId || !interaction.guild) {
			await interaction.followUp({
				content: 'This action can only be performed in a server',
				ephemeral: true
			})
			return
		}

		// Validate administrator permission
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
			logger.debug(`User @${interaction.user.username} does not have permission to modify column mappings`)
			await interaction.followUp({
				content: "You don't have permission to use this. Only administrators can create column mappings.",
				ephemeral: true
			})
			return
		}

		const columnValue = interaction.values[0]
		if (!columnValue) {
			return
		}

		// Convert "__null__" to null for track-only mappings
		const column = columnValue === '__null__' ? null : columnValue

		// Use global cache for button flow
		const cacheKey = `${interaction.guildId}:${interaction.user.id}`
		if (!globalThis.roadmapPendingColumnMappings) {
			globalThis.roadmapPendingColumnMappings = new Map()
		}
		
		const cached = globalThis.roadmapPendingColumnMappings.get(cacheKey)
		if (cached) {
			cached.column = column
			
			// If status is already selected, create mapping immediately
			if (cached.status) {
				await createMappingAndUpdate(interaction, cached.status, column, cached)
			}
		} else {
			globalThis.roadmapPendingColumnMappings.set(cacheKey, {
				column,
				messageId: interaction.message?.id,
				webhookId: interaction.webhook?.id,
				webhookToken: interaction.webhook?.token
			})
		}
	}
}

async function createMappingAndUpdate(
	interaction: StringSelectMenuInteraction,
	status: string,
	column: string | null,
	cached: { messageId?: string; webhookId?: string; webhookToken?: string }
) {
	try {
		setColumnMapping(interaction.guildId!, status, column)
		
		// Clean up cache
		const cacheKey = `${interaction.guildId}:${interaction.user.id}`
		globalThis.roadmapPendingColumnMappings?.delete(cacheKey)

		// Try to update the original setup message via webhook for ephemeral messages
		if (cached.messageId && cached.webhookId && cached.webhookToken) {
			try {
				const category = await getRoadmapCategory(interaction.guild!)
				const forums = await getAllForumChannels(interaction.guild!)
				if (category && forums.size > 0) {
					const settings = getSettings(interaction.guildId!)
					
					// Get known assignees and statuses for refresh
					let knownJiraAssignees: string[] = []
					let knownStatuses: string[] = []
					if (settings.lastSyncTimestamp) {
						try {
							const provider = getProvider()
							if (provider) {
								const cards = await provider.fetchCards()
								const assigneeSet = new Set<string>()
								const statusSet = new Set<string>()
								for (const card of cards) {
									// Collect assignees
									for (const assignee of card.assignees) {
										if (assignee.name && assignee.name !== 'Unassigned') {
											assigneeSet.add(assignee.name)
										}
									}
									// Collect statuses from metadata
									const originalStatus = (card.metadata?.originalStatus as string) || card.column
									if (originalStatus) {
										statusSet.add(originalStatus)
									}
								}
								knownJiraAssignees = Array.from(assigneeSet).sort()
								knownStatuses = Array.from(statusSet).sort()
							}
						} catch (error) {
							logger.warn('Failed to fetch cards for column mapping refresh:', error)
						}
					}
					
					// Refresh to provider settings page since that's where add buttons are shown
					const setupMessage = await createSetupMessage(
						interaction,
						category,
						forums,
						settings,
						knownJiraAssignees,
						knownStatuses,
						'provider-settings'
					)
					
					// Use webhook to edit ephemeral message
					await interaction.client.rest.patch(
						`/webhooks/${cached.webhookId}/${cached.webhookToken}/messages/${cached.messageId}`,
						{ body: setupMessage }
					)
				}
			} catch (error) {
				logger.warn('Failed to update original setup message:', error)
			}
		}
	} catch (error) {
		logger.error('Failed to create column mapping:', error)
		await interaction.followUp({
			content: 'Failed to create column mapping. Please try again.',
			ephemeral: true
		})
	}
}

export default async (interaction: StringSelectMenuInteraction) => {
	if (!interaction.isStringSelectMenu()) {
		return
	}

	// Route to appropriate handler based on select menu type
	if (interaction.customId.startsWith(Selects.ColumnMappingStatus.id)) {
		await handleStatusSelect(interaction)
	} else if (interaction.customId.startsWith(Selects.ColumnMappingColumn.id)) {
		await handleColumnSelect(interaction)
	}
}

