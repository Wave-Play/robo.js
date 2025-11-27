import {
	type StringSelectMenuInteraction,
	type UserSelectMenuInteraction,
	PermissionFlagsBits
} from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { Selects } from '../../core/constants.js'
import { setAssigneeMapping, getSettings } from '../../core/settings.js'
import { createSetupMessage } from '../../commands/roadmap/setup.js'
import { getRoadmapCategory, getAllForumChannels } from '../../core/forum-manager.js'
import { getProvider } from '../_start.js'

/**
 * Temporary cache for pending assignee mappings (original flow).
 * Key: `${guildId}:${userId}`, Value: { jiraName?: string, discordUserId?: string }
 */
const pendingMappings = new Map<string, { jiraName?: string; discordUserId?: string }>()

/**
 * Global cache for button flow pending mappings.
 * Key: `${guildId}:${userId}`, Value: { jiraName?: string, discordUserId?: string, messageId?: string, webhookId?: string, webhookToken?: string }
 */
declare global {
	// eslint-disable-next-line no-var
	var roadmapPendingMappings: Map<string, { jiraName?: string; discordUserId?: string; messageId?: string; webhookId?: string; webhookToken?: string }> | undefined
}

/**
 * Assignee mapping select menu interaction handler.
 *
 * This handler processes both Jira assignee name selections and Discord user selections
 * from the assignee mapping select menus in the setup command. It coordinates between
 * the two selects to create mappings when both values are available.
 *
 * @remarks
 * Uses a temporary cache to store pending selections since the two selects are independent.
 * Only administrators can create assignee mappings.
 */

export const config: EventConfig = {
	description: 'Handles assignee mapping select menu interactions'
}

async function handleJiraNameSelect(interaction: StringSelectMenuInteraction) {
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
			logger.debug(`User @${interaction.user.username} does not have permission to modify assignee mappings`)
			await interaction.followUp({
				content: "You don't have permission to use this. Only administrators can create assignee mappings.",
				ephemeral: true
			})
			return
		}

		const jiraName = interaction.values[0]
		if (!jiraName) {
			return
		}

		// Check if mapping already exists
		const settings = getSettings(interaction.guildId)
		const existingMapping = settings.assigneeMapping?.[jiraName]
		if (existingMapping) {
			await interaction.followUp({
				content: `**${jiraName}** is already mapped to <@${existingMapping}>. Remove the existing mapping first if you want to change it.`,
				ephemeral: true
			})
			return
		}

		// Use global cache for button flow
		const cacheKey = `${interaction.guildId}:${interaction.user.id}`
		if (!globalThis.roadmapPendingMappings) {
			globalThis.roadmapPendingMappings = new Map()
		}
		
		const cached = globalThis.roadmapPendingMappings.get(cacheKey)
		if (cached) {
			cached.jiraName = jiraName
		} else {
			globalThis.roadmapPendingMappings.set(cacheKey, {
				jiraName,
				messageId: interaction.message?.id,
				webhookId: interaction.webhook?.id,
				webhookToken: interaction.webhook?.token
			})
		}

		// Check if we already have a Discord user selected (user might have selected Discord user first)
		// If so, create the mapping immediately
		if (cached?.discordUserId) {
			await createMappingAndUpdate(interaction, jiraName, cached.discordUserId, cached)
		}
		return
	}

	// Original flow - acknowledge interaction immediately
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
		logger.debug(`User @${interaction.user.username} does not have permission to modify assignee mappings`)
		await interaction.followUp({
			content: "You don't have permission to use this. Only administrators can create assignee mappings.",
			ephemeral: true
		})
		return
	}

	const jiraName = interaction.values[0]
	if (!jiraName) {
		return
	}

	const cacheKey = `${interaction.guildId}:${interaction.user.id}`
	const pending = pendingMappings.get(cacheKey) ?? {}

	// Store Jira name in cache
	pendingMappings.set(cacheKey, { ...pending, jiraName })

	// If we already have a Discord user ID, create the mapping immediately
	if (pending.discordUserId) {
		try {
			setAssigneeMapping(interaction.guildId, jiraName, pending.discordUserId)
			pendingMappings.delete(cacheKey)

			// Refresh setup message
			await refreshSetupMessage(interaction)
		} catch (error) {
			logger.error('Failed to create assignee mapping:', error)
			await interaction.followUp({
				content: 'Failed to create assignee mapping. Please try again.',
				ephemeral: true
			})
		}
	}
}

async function handleDiscordUserSelect(interaction: UserSelectMenuInteraction) {
	// Check if this is from the button flow (customId ends with :button)
	const isFromButton = interaction.customId.endsWith(':button')
	
	if (isFromButton) {
		// Handle button flow
		await interaction.deferUpdate()

		if (!globalThis.roadmapPendingMappings) {
			globalThis.roadmapPendingMappings = new Map()
		}

		const cacheKey = `${interaction.guildId}:${interaction.user.id}`
		const cached = globalThis.roadmapPendingMappings.get(cacheKey)
		const discordUserId = interaction.users.first()?.id
		if (!discordUserId) {
			return
		}

		// Store Discord user ID in cache (in case Jira name hasn't been selected yet)
		if (cached) {
			cached.discordUserId = discordUserId
		} else {
			// If cache doesn't exist, create it with webhook info from this interaction
			globalThis.roadmapPendingMappings.set(cacheKey, {
				discordUserId,
				messageId: interaction.message?.id,
				webhookId: interaction.webhook?.id,
				webhookToken: interaction.webhook?.token
			})
		}

		// If Jira name hasn't been selected yet, wait for it
		if (!cached?.jiraName) {
			return
		}

		const { jiraName } = cached

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
			logger.debug(`User @${interaction.user.username} does not have permission to modify assignee mappings`)
			await interaction.followUp({
				content: "You don't have permission to use this. Only administrators can create assignee mappings.",
				ephemeral: true
			})
			return
		}

		// Create the mapping
		await createMappingAndUpdate(interaction, jiraName, discordUserId, cached)
		return
	}

	// Original flow - acknowledge interaction immediately
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
		logger.debug(`User @${interaction.user.username} does not have permission to modify assignee mappings`)
		await interaction.followUp({
			content: "You don't have permission to use this. Only administrators can create assignee mappings.",
			ephemeral: true
		})
		return
	}

	const discordUserId = interaction.users.first()?.id
	if (!discordUserId) {
		return
	}

	const cacheKey = `${interaction.guildId}:${interaction.user.id}`
	const pending = pendingMappings.get(cacheKey) ?? {}

	// Store Discord user ID in cache
	pendingMappings.set(cacheKey, { ...pending, discordUserId })

	// If we already have a Jira name, create the mapping immediately
	if (pending.jiraName) {
		try {
			setAssigneeMapping(interaction.guildId, pending.jiraName, discordUserId)
			pendingMappings.delete(cacheKey)

			// Refresh setup message
			await refreshSetupMessage(interaction)
		} catch (error) {
			logger.error('Failed to create assignee mapping:', error)
			await interaction.followUp({
				content: 'Failed to create assignee mapping. Please try again.',
				ephemeral: true
			})
		}
	}
}

async function createMappingAndUpdate(
	interaction: StringSelectMenuInteraction | UserSelectMenuInteraction,
	jiraName: string,
	discordUserId: string,
	cached: { messageId?: string; webhookId?: string; webhookToken?: string }
) {
	try {
		setAssigneeMapping(interaction.guildId!, jiraName, discordUserId)
		
		// Clean up cache
		const cacheKey = `${interaction.guildId}:${interaction.user.id}`
		globalThis.roadmapPendingMappings?.delete(cacheKey)

		// Try to update the original setup message via webhook for ephemeral messages
		if (cached.messageId && cached.webhookId && cached.webhookToken) {
			try {
				const category = await getRoadmapCategory(interaction.guild!)
				const forums = await getAllForumChannels(interaction.guild!)
				if (category && forums.size > 0) {
					const settings = getSettings(interaction.guildId!)
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
					const setupMessage = await createSetupMessage(interaction, category, forums, settings, knownJiraAssignees)
					
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
		logger.error('Failed to create assignee mapping:', error)
		await interaction.followUp({
			content: 'Failed to create assignee mapping. Please try again.',
			ephemeral: true
		})
	}
}

async function refreshSetupMessage(interaction: StringSelectMenuInteraction | UserSelectMenuInteraction) {
	try {
		// Get category and forums for message refresh
		const category = await getRoadmapCategory(interaction.guild!)
		const forums = await getAllForumChannels(interaction.guild!)

		// Only refresh if category and forums are available
		if (!category || forums.size === 0) {
			logger.warn('Roadmap category or forums not found, skipping setup message refresh')
			return
		}

		// Get updated settings
		const settings = getSettings(interaction.guildId!)

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
		const setupMessage = await createSetupMessage(interaction, category, forums, settings, knownJiraAssignees)
		await interaction.editReply(setupMessage)
	} catch (error) {
		logger.error('Failed to refresh setup message:', error)
		// Don't throw - this is non-critical
	}
}

export default async (
	interaction: StringSelectMenuInteraction | UserSelectMenuInteraction
) => {
	// Handle Jira assignee name select (both original flow and button flow)
	if (interaction.isStringSelectMenu() && 
		(interaction.customId === Selects.AssigneeJiraName.id || interaction.customId.startsWith(Selects.AssigneeJiraName.id))) {
		await handleJiraNameSelect(interaction)
		return
	}

	// Handle Discord user select (both original flow and button flow)
	if (interaction.isUserSelectMenu() && 
		(interaction.customId === Selects.AssigneeDiscordUser.id || interaction.customId.startsWith(Selects.AssigneeDiscordUser.id))) {
		await handleDiscordUserSelect(interaction)
		return
	}
}

