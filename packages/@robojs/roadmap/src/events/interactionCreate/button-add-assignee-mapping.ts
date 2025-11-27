import {
	type ButtonInteraction,
	PermissionFlagsBits,
	StringSelectMenuBuilder,
	UserSelectMenuBuilder,
	ActionRowBuilder,
	MessageFlags
} from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { Buttons, Selects } from '../../core/constants.js'
import { getProvider } from '../_start.js'
import { getSettings } from '../../core/settings.js'

/**
 * Global cache for button flow pending mappings.
 * Key: `${guildId}:${userId}`, Value: { jiraName?: string, discordUserId?: string, messageId?: string, webhookId?: string, webhookToken?: string }
 */
declare global {
	// eslint-disable-next-line no-var
	var roadmapPendingMappings: Map<string, { jiraName?: string; discordUserId?: string; messageId?: string; webhookId?: string; webhookToken?: string }> | undefined
}

/**
 * Button interaction handler for adding assignee mappings.
 *
 * This handler processes clicks on the "Add Mapping" button and displays an ephemeral
 * message with both a Jira assignee select and Discord user select. When both are
 * selected, the mapping is automatically created.
 */

export const config: EventConfig = {
	description: 'Opens selects for adding a new assignee mapping'
}

export default async (interaction: ButtonInteraction) => {
	// Filter interaction - only process our specific button
	if (!interaction.isButton() || interaction.customId !== Buttons.AddAssigneeMapping.id) {
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
		logger.debug(`User @${interaction.user.username} does not have permission to add assignee mappings`)
		await interaction.reply({
			content: "You don't have permission to use this. Only administrators can add assignee mappings.",
			ephemeral: true
		})
		return
	}

	// Get known Jira assignees for the select menu
	const settings = getSettings(interaction.guildId)
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
			logger.warn('Failed to fetch cards for assignee mapping:', error)
		}
	}

	if (knownJiraAssignees.length === 0) {
		await interaction.reply({
			content: 'No Jira assignees found. Run `/roadmap sync` first to discover assignees.',
			ephemeral: true
		})
		return
	}

	// Store webhook info for later message update (needed for updating the original setup message)
	const cacheKey = `${interaction.guildId}:${interaction.user.id}`
	if (!globalThis.roadmapPendingMappings) {
		globalThis.roadmapPendingMappings = new Map()
	}
	
	// Store webhook info temporarily (will be used when mapping is created)
	globalThis.roadmapPendingMappings.set(cacheKey, {
		messageId: interaction.message?.id,
		webhookId: interaction.webhook?.id,
		webhookToken: interaction.webhook?.token
	})

	// Build Jira assignee select menu
	const jiraSelect = new StringSelectMenuBuilder()
		.setCustomId(`${Selects.AssigneeJiraName.id}:button`)
		.setPlaceholder('Select a Jira assignee to map')
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(
			knownJiraAssignees.slice(0, 25).map((name) => ({
				label: name.length > 100 ? name.substring(0, 97) + '...' : name,
				value: name,
				description: 'Jira assignee'
			}))
		)

	// Build Discord user select menu
	const discordSelect = new UserSelectMenuBuilder()
		.setCustomId(`${Selects.AssigneeDiscordUser.id}:button`)
		.setPlaceholder('Select a Discord user to map to')
		.setMinValues(1)
		.setMaxValues(1)

	// Show ephemeral message with both selects
	await interaction.reply({
		content: '**Add New Mapping**\nSelect both a Jira assignee and Discord user below. The mapping will be created automatically when both are selected.',
		components: [
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents([jiraSelect]),
			new ActionRowBuilder<UserSelectMenuBuilder>().addComponents([discordSelect])
		],
		flags: MessageFlags.Ephemeral
	})
}

