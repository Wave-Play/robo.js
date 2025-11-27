import {
	type ButtonInteraction,
	PermissionFlagsBits,
	RoleSelectMenuBuilder,
	ActionRowBuilder,
	MessageFlags
} from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { Buttons, Selects } from '../../core/constants.js'
import { getAuthorizedCreatorRoles } from '../../core/settings.js'

/**
 * Global cache for role management webhook info.
 * Key: `${guildId}:${userId}`, Value: { messageId?: string, webhookId?: string, webhookToken?: string }
 */
declare global {
	// eslint-disable-next-line no-var
	var roadmapRoleManagement: Map<string, { messageId?: string; webhookId?: string; webhookToken?: string }> | undefined
}

/**
 * Button interaction handler for managing authorized creator roles.
 *
 * This handler processes clicks on the "Manage Roles" button and displays an ephemeral
 * message with a role select menu. When roles are selected, they update automatically.
 */

export const config: EventConfig = {
	description: 'Opens role select for managing authorized creator roles'
}

export default async (interaction: ButtonInteraction) => {
	// Filter interaction - only process our specific button
	if (!interaction.isButton() || interaction.customId !== Buttons.ManageAuthorizedRoles.id) {
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
		logger.debug(`User @${interaction.user.username} does not have permission to manage authorized roles`)
		await interaction.reply({
			content: "You don't have permission to use this. Only administrators can manage authorized roles.",
			ephemeral: true
		})
		return
	}

	// Get current authorized roles
	const authorizedRoles = getAuthorizedCreatorRoles(interaction.guildId)

	// Store webhook info for later message update (needed for updating the original setup message)
	const cacheKey = `${interaction.guildId}:${interaction.user.id}`
	if (!globalThis.roadmapRoleManagement) {
		globalThis.roadmapRoleManagement = new Map()
	}
	
	// Store webhook info temporarily (will be used when roles are updated)
	globalThis.roadmapRoleManagement.set(cacheKey, {
		messageId: interaction.message?.id,
		webhookId: interaction.webhook?.id,
		webhookToken: interaction.webhook?.token
	})

	// Build role select menu
	const roleSelect = new RoleSelectMenuBuilder()
		.setCustomId(Selects.AuthorizedCreatorRoles.id)
		.setPlaceholder('Select roles that can create roadmap cards')
		.setMinValues(0)
		.setMaxValues(10)

	if (authorizedRoles.length > 0) {
		roleSelect.setDefaultRoles(authorizedRoles.slice(0, 25))
	}

	// Show ephemeral message with role select
	await interaction.reply({
		content: '**Manage Authorized Creator Roles**\nSelect the roles that should be able to create roadmap cards. Administrators always have this permission.',
		components: [
			new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents([roleSelect])
		],
		flags: MessageFlags.Ephemeral
	})
}

