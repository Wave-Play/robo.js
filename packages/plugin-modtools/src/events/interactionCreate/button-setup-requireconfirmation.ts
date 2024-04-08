import { Buttons } from '../../core/constants.js'
import { getSettings, updateSettings } from '../../core/settings.js'
import { hasPermission, logAction } from '../../core/utils.js'
import { createSetupMessage } from '../../commands/mod/setup.js'
import { logger } from 'robo.js'
import { Colors } from 'discord.js'
import type { EventConfig } from 'robo.js'
import type { ButtonInteraction } from 'discord.js'

export const config: EventConfig = {
	description: `Toggles confirmation mode when the setup button is clicked`
}

export default async (interaction: ButtonInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isButton() || interaction.customId !== Buttons.RequireConfirmation.id) {
		return
	}
	await interaction.deferUpdate()

	// Validate permissions
	if (!hasPermission(interaction, 'ModerateMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to toggle confirmation mode`)
		return interaction.followUp({
			content: `You don't have permission to use this.`,
			ephemeral: true
		})
	}

	// Toggle require confirmation
	logger.debug(`Toggling confirmation mode for guild ${interaction.guildId}`)
	const settings = getSettings(interaction.guildId)
	const newSettings = updateSettings(interaction.guildId, {
		requireConfirmation: !settings.requireConfirmation
	})

	// Update setup message
	const setupMessage = createSetupMessage(interaction, newSettings)
	await interaction.editReply({
		content: setupMessage.content,
		components: setupMessage.components
	})

	// Log action to modlogs channel
	const requireConfirmation = newSettings.requireConfirmation ? 'enabled' : 'disabled'
	logAction(interaction.guildId, {
		embeds: [
			{
				title: `Confirmation mode ${requireConfirmation}`,
				description: `Confirmation mode has been ${requireConfirmation}`,
				color: newSettings.requireConfirmation ? Colors.Blurple : Colors.Greyple,
				timestamp: new Date().toISOString(),
				footer: {
					icon_url: interaction.user.displayAvatarURL(),
					text: 'by @' + interaction.user.username
				}
			}
		]
	})
}
