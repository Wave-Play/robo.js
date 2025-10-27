import { type RoleSelectMenuInteraction, PermissionFlagsBits } from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { Selects } from '../../core/constants.js'
import { setAuthorizedCreatorRoles, getSettings } from '../../core/settings.js'
import { createSetupMessage } from '../../commands/roadmap/setup.js'
import { getRoadmapCategory, getAllForumChannels } from '../../core/forum-manager.js'

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
 * // 5. Sends confirmation message
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

			// Update setup message with new role configuration
			const setupMessage = createSetupMessage(interaction, category, forums, settings)
			await interaction.editReply(setupMessage)
		}
	} catch (error) {
		logger.error('Failed to refresh setup message:', error)
		// Don't return here - still send confirmation even if refresh failed
	}

	// Build confirmation message based on role selection
	let confirmationMessage: string
	if (roleIds.length > 0) {
		const roleMentions = roleIds.map((id) => `<@&${id}>`).join(', ')
		confirmationMessage = `Updated authorized creator roles. The following roles can now create roadmap cards: ${roleMentions}`
	} else {
		confirmationMessage = 'Cleared authorized creator roles. Only administrators can create roadmap cards.'
	}

	// Send confirmation to user
	await interaction.followUp({
		content: confirmationMessage,
		ephemeral: true
	})

	// Log successful role update
	logger.info(
		`Authorized creator roles updated by @${interaction.user.username} in guild ${interaction.guildId}: ${roleIds.join(', ') || 'none'}`
	)
}
