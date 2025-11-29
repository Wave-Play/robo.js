import { type ButtonInteraction, PermissionFlagsBits } from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { Buttons } from '../../core/constants.js'
import { getSettings } from '../../core/settings.js'
import { createSetupMessage, type SetupPage } from '../../commands/roadmap/setup.js'
import { getRoadmapCategory, getAllForumChannels } from '../../core/forum-manager.js'
import { getProvider } from '../_start.js'

/**
 * Button interaction handler for setup page navigation.
 *
 * This handler processes clicks on navigation buttons (e.g., "Manage Provider",
 * "Back to Overview") and morphs the setup message between the overview and provider
 * settings pages.
 */

export const config: EventConfig = {
	description: 'Handles setup page navigation buttons'
}

export default async (interaction: ButtonInteraction) => {
	// Filter interaction - only process our navigation buttons
	if (!interaction.isButton()) {
		return
	}

	const isProviderSettings = interaction.customId === Buttons.SetupProviderSettings.id
	const isBackOverview = interaction.customId === Buttons.SetupBackOverview.id

	if (!isProviderSettings && !isBackOverview) {
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
		logger.debug(`User @${interaction.user.username} does not have permission to navigate setup pages`)
		await interaction.reply({
			content: "You don't have permission to use this. Only administrators can navigate setup pages.",
			ephemeral: true
		})
		return
	}

	// Defer update to prevent timeout
	await interaction.deferUpdate()

	try {
		// Determine target page
		const targetPage: SetupPage = isProviderSettings ? 'provider-settings' : 'overview'

		// Fetch required data
		const category = await getRoadmapCategory(interaction.guild)
		if (!category) {
			await interaction.followUp({
				content: 'Roadmap category not found. Run `/roadmap setup` first.',
				ephemeral: true
			})
			return
		}

		const forums = await getAllForumChannels(interaction.guild)
		if (forums.size === 0) {
			await interaction.followUp({
				content: 'No roadmap forums found. Run `/roadmap setup` first.',
				ephemeral: true
			})
			return
		}

		const settings = getSettings(interaction.guildId)

		// Get known assignees and statuses (if sync has been run)
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
				logger.warn('Failed to fetch cards for navigation:', error)
			}
		}

		// Build and update message with target page
		const setupMessage = await createSetupMessage(
			interaction,
			category,
			forums,
			settings,
			knownJiraAssignees,
			knownStatuses,
			targetPage
		)

		// Update the message
		await interaction.editReply(setupMessage)

		logger.debug(`Setup page navigation: ${interaction.user.id} navigated to ${targetPage} in guild ${interaction.guildId}`)
	} catch (error) {
		logger.error('Failed to navigate setup page:', error)
		await interaction.followUp({
			content: 'Failed to navigate setup page. Please try again.',
			ephemeral: true
		})
	}
}

