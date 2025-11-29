import { type RoleSelectMenuInteraction, PermissionFlagsBits } from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { Selects } from '../../core/constants.js'
import { setAuthorizedCreatorRoles, getSettings } from '../../core/settings.js'
import { createSetupMessage } from '../../commands/roadmap/setup.js'
import { getRoadmapCategory, getAllForumChannels } from '../../core/forum-manager.js'
import { getProvider } from '../_start.js'

/**
 * Global cache for role management webhook info.
 * Key: `${guildId}:${userId}`, Value: { messageId?: string, webhookId?: string, webhookToken?: string }
 */
declare global {
	// eslint-disable-next-line no-var
	var roadmapRoleManagement: Map<string, { messageId?: string; webhookId?: string; webhookToken?: string }> | undefined
}

/**
 * Role select menu interaction handler for updating authorized creator roles.
 *
 * This handler processes role selections from the role select menu displayed in the setup command.
 * It validates permissions, updates the authorized creator roles setting, and refreshes the
 * setup message to reflect the new configuration.
 *
 * @remarks
 * Uses `deferUpdate()` instead of `deferReply()` because we're updating the existing
 * setup message rather than creating a new reply. Only administrators can modify the
 * authorized creator roles.
 *
 * @example
 * // Admin selects roles in setup message
 * // Handler:
 * // 1. Validates user has Administrator permission
 * // 2. Extracts selected role IDs
 * // 3. Updates authorizedCreatorRoles in settings
 * // 4. Refreshes setup message with new role list
 */

export const config: EventConfig = {
	description: 'Updates authorized creator roles when the role select menu is used'
}

export default async (interaction: RoleSelectMenuInteraction) => {
	// Filter interaction - only process our specific select menu
	if (!interaction.isRoleSelectMenu() || interaction.customId !== Selects.AuthorizedCreatorRoles.id) {
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
		logger.debug(`User @${interaction.user.username} does not have permission to modify authorized roles`)
		await interaction.followUp({
			content: "You don't have permission to use this. Only administrators can change authorized roles.",
			ephemeral: true
		})

		return
	}

	// Extract selected role IDs from interaction
	const roleIds = interaction.roles.map((role) => role.id)

	// Log role update attempt
	logger.debug(`Updating authorized creator roles for guild ${interaction.guildId}: ${roleIds.join(', ')}`)

	// Update settings with new authorized roles
	try {
		setAuthorizedCreatorRoles(interaction.guildId, roleIds)
	} catch (error) {
		logger.error('Failed to update authorized creator roles:', error)
		await interaction.followUp({
			content: 'Failed to update authorized creator roles. Please try again.',
			ephemeral: true
		})

		return
	}

	// Refresh setup message with updated role list
	try {
		// Get category and forums for message refresh
		const category = await getRoadmapCategory(interaction.guild)
		const forums = await getAllForumChannels(interaction.guild)

		// Only refresh if category and forums are available
		if (!category || forums.size === 0) {
			logger.warn('Roadmap category or forums not found, skipping setup message refresh')
		} else {
			// Get updated settings for display
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

			// Update setup message with new role configuration
			const setupMessage = await createSetupMessage(
				interaction,
				category,
				forums,
				settings,
				knownJiraAssignees
			)

			// Check if we have webhook info from the button click (ephemeral message flow)
			const cacheKey = `${interaction.guildId}:${interaction.user.id}`
			const cachedData = globalThis.roadmapRoleManagement?.get(cacheKey)

			if (cachedData?.messageId && cachedData.webhookId && cachedData.webhookToken) {
				// Use webhook to update the original setup message
				try {
					await interaction.client.rest.patch(
						`/webhooks/${cachedData.webhookId}/${cachedData.webhookToken}/messages/${cachedData.messageId}`,
						{ body: setupMessage }
					)
					// Clear cache after successful update
					globalThis.roadmapRoleManagement?.delete(cacheKey)
				} catch (error) {
					logger.warn('Failed to update original setup message via webhook:', error)
					// Fallback to editReply if webhook update fails
					try {
						await interaction.editReply(setupMessage)
					} catch (editError) {
						logger.error('Failed to edit reply as fallback:', editError)
					}
				}
			} else {
				// Original flow - edit the interaction reply directly
				await interaction.editReply(setupMessage)
			}
		}
	} catch (error) {
		logger.error('Failed to refresh setup message:', error)
		// Don't return here - still log success even if refresh failed
	}

	// No confirmation message - the setup message update is sufficient feedback

	// Log successful role update
	logger.info(
		`Authorized creator roles updated by @${interaction.user.username} in guild ${interaction.guildId}: ${roleIds.join(', ') || 'none'}`
	)
}
