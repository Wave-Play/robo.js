import { type ButtonInteraction, PermissionFlagsBits } from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { removeAssigneeMapping, getSettings } from '../../core/settings.js'
import { Buttons } from '../../core/constants.js'
import { createSetupMessage } from '../../commands/roadmap/setup.js'
import { getRoadmapCategory, getAllForumChannels } from '../../core/forum-manager.js'
import { getProvider } from '../_start.js'

/**
 * Button interaction handler for removing assignee mappings.
 *
 * This handler processes clicks on the remove button displayed next to each
 * assignee mapping in the setup command. It validates permissions, removes
 * the mapping, and refreshes the setup message.
 *
 * @remarks
 * Uses `deferUpdate()` to update the existing setup message rather than
 * creating a new reply. The custom ID format is: `${Buttons.RemoveAssigneeMapping.id}:${jiraName}`
 *
 * @example
 * // User clicks "Remove" button next to a mapping
 * // Handler:
 * // 1. Validates user has Administrator permission
 * // 2. Extracts Jira name from custom ID
 * // 3. Removes the mapping from settings
 * // 4. Refreshes setup message
 * // 5. Sends confirmation message
 */

export const config: EventConfig = {
	description: 'Removes an assignee mapping between a Jira user and Discord member'
}

export default async (interaction: ButtonInteraction) => {
	// Filter interaction - only process our specific button
	if (!interaction.isButton() || !interaction.customId.startsWith(Buttons.RemoveAssigneeMapping.id)) {
		return
	}

	// Acknowledge interaction immediately to prevent timeout
	await interaction.deferUpdate()

	// Validate guild context is available
	if (!interaction.guildId) {
		await interaction.followUp({
			content: 'This action can only be performed in a server',
			ephemeral: true
		})
		return
	}

	if (!interaction.guild) {
		await interaction.followUp({
			content: 'This action can only be performed in a server',
			ephemeral: true
		})
		return
	}

	// Validate user has Administrator permission
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		logger.debug(`User @${interaction.user.username} does not have permission to remove assignee mappings`)
		await interaction.followUp({
			content: "You don't have permission to use this. Only administrators can remove assignee mappings.",
			ephemeral: true
		})
		return
	}

	// Extract Jira name from custom ID (format: `${id}:${jiraName}`)
	// The custom ID is: @robojs/roadmap:button-remove-assignee-mapping:Pkmmte Xeleon
	// We need to extract everything after the button ID prefix
	const prefix = `${Buttons.RemoveAssigneeMapping.id}:`
	if (!interaction.customId.startsWith(prefix)) {
		logger.warn(`Custom ID doesn't match expected format: ${interaction.customId}`)
		await interaction.followUp({
			content: 'Failed to identify which mapping to remove. Please try again.',
			ephemeral: true
		})
		return
	}
	
	const jiraName = interaction.customId.slice(prefix.length)
	if (!jiraName) {
		logger.warn(`Failed to extract Jira name from custom ID: ${interaction.customId}`)
		await interaction.followUp({
			content: 'Failed to identify which mapping to remove. Please try again.',
			ephemeral: true
		})
		return
	}

	// Remove the mapping
	try {
		removeAssigneeMapping(interaction.guildId, jiraName)
		logger.debug(`Removed assignee mapping for "${jiraName}" in guild ${interaction.guildId}`)
	} catch (error) {
		logger.error('Failed to remove assignee mapping:', error)
		await interaction.followUp({
			content: 'Failed to remove assignee mapping. Please try again.',
			ephemeral: true
		})
		return
	}

	// Get category and forums for message refresh
	const category = await getRoadmapCategory(interaction.guild)
	if (!category) {
		logger.warn('Roadmap category not found, skipping setup message refresh')
		await interaction.followUp({
			content: `✅ Removed mapping for **${jiraName}**`,
			ephemeral: true
		})
		return
	}

	const forums = await getAllForumChannels(interaction.guild)
	if (forums.size === 0) {
		logger.warn('No forum channels found, skipping setup message refresh')
		await interaction.followUp({
			content: `✅ Removed mapping for **${jiraName}**`,
			ephemeral: true
		})
		return
	}

	// Get updated settings
	const settings = getSettings(interaction.guildId)

	// Fetch known Jira assignees for the select menu
	let knownJiraAssignees: string[] = []
	if (settings.lastSyncTimestamp) {
		try {
			const provider = getProvider()
			if (provider) {
				const cards = await provider.fetchCards()
				const assigneeSet = new Set<string>()
				for (const card of cards) {
					for (const assignee of card.assignees) {
						if (assignee.name && assignee.name !== 'Unassigned') {
							assigneeSet.add(assignee.name)
						}
					}
				}
				knownJiraAssignees = Array.from(assigneeSet).sort()
			}
		} catch (error) {
			logger.warn('Failed to fetch cards for assignee mapping refresh:', error)
		}
	}

	// Update setup message with new mapping configuration
	const setupMessage = await createSetupMessage(
		interaction,
		category,
		forums,
		settings,
		knownJiraAssignees
	)
	await interaction.editReply(setupMessage)

	// Send confirmation
	await interaction.followUp({
		content: `✅ Removed mapping for **${jiraName}**`,
		ephemeral: true
	})

	// Log successful removal
	logger.info(`Assignee mapping removed for "${jiraName}" by @${interaction.user.username} in guild ${interaction.guildId}`)
}

