import { type ButtonInteraction, PermissionFlagsBits } from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { Buttons } from '../../core/constants.js'
import { removeColumnMapping, getSettings } from '../../core/settings.js'
import { createSetupMessage } from '../../commands/roadmap/setup.js'
import { getRoadmapCategory, getAllForumChannels } from '../../core/forum-manager.js'
import { getProvider } from '../_start.js'

/**
 * Button interaction handler for removing column mappings.
 *
 * This handler processes clicks on the "Remove" button next to column mappings in the
 * setup command, removing the mapping and refreshing the setup message. The custom ID
 * format is: `${Buttons.RemoveColumnMapping.id}:${status}`
 */

export const config: EventConfig = {
	description: 'Removes a column mapping'
}

export default async (interaction: ButtonInteraction) => {
	// Filter interaction - only process our specific button
	if (!interaction.isButton() || !interaction.customId.startsWith(Buttons.RemoveColumnMapping.id)) {
		return
	}

	// Validate guild context
	if (!interaction.guildId || !interaction.guild) {
		await interaction.reply({
			content: 'This action can only be performed in a server',
			ephemeral: true
		})
		return
	}

	// Validate administrator permission
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		logger.debug(`User @${interaction.user.username} does not have permission to remove column mappings`)
		await interaction.reply({
			content: "You don't have permission to use this. Only administrators can remove column mappings.",
			ephemeral: true
		})
		return
	}

	// Extract status from custom ID
	const prefix = `${Buttons.RemoveColumnMapping.id}:`
	if (!interaction.customId.startsWith(prefix)) {
		logger.warn(`Invalid remove column mapping button ID: ${interaction.customId}`)
		return
	}

	const status = interaction.customId.slice(prefix.length)
	if (!status) {
		logger.warn(`Missing status in remove column mapping button ID: ${interaction.customId}`)
		return
	}

	// Defer update to prevent timeout
	await interaction.deferUpdate()

	try {
		// Remove the mapping
		removeColumnMapping(interaction.guildId, status)

		logger.info(`Removed column mapping for status "${status}" in guild ${interaction.guildId}`)

		// Refresh setup message
		try {
			const category = await getRoadmapCategory(interaction.guild)
			const forums = await getAllForumChannels(interaction.guild)
			if (category && forums.size > 0) {
				const settings = getSettings(interaction.guildId)
				
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
				
				// Refresh to provider settings page since that's where remove buttons are shown
				const setupMessage = await createSetupMessage(
					interaction,
					category,
					forums,
					settings,
					knownJiraAssignees,
					knownStatuses,
					'provider-settings'
				)

				// Try to update the original message via webhook if available
				if (interaction.message?.id && interaction.webhook?.id && interaction.webhook?.token) {
					try {
						await interaction.client.rest.patch(
							`/webhooks/${interaction.webhook.id}/${interaction.webhook.token}/messages/${interaction.message.id}`,
							{ body: setupMessage }
						)
					} catch (error) {
						logger.warn('Failed to update original setup message:', error)
					}
				}
			}
		} catch (error) {
			logger.warn('Failed to refresh setup message after removing column mapping:', error)
		}
	} catch (error) {
		logger.error('Failed to remove column mapping:', error)
		await interaction.followUp({
			content: 'Failed to remove column mapping. Please try again.',
			ephemeral: true
		})
	}
}

