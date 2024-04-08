import { createSetupMessage } from '../../commands/mod/setup.js'
import { Buttons } from '../../core/constants.js'
import { hasPermission, logAction } from '../../core/utils.js'
import { getSettings, updateSettings } from '../../core/settings.js'
import { logger } from 'robo.js'
import { Colors } from 'discord.js'
import type { EventConfig } from 'robo.js'
import type { ButtonInteraction } from 'discord.js'

export const config: EventConfig = {
	description: `Toggles lockdown mode when the setup button is clicked`
}

export default async (interaction: ButtonInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isButton() || interaction.customId !== Buttons.LockdownMode.id) {
		return
	}
	await interaction.deferUpdate()

	// Validate permissions
	if (!hasPermission(interaction, 'KickMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to toggle lockdown mode`)
		return interaction.followUp({
			content: `You don't have permission to use this.`,
			ephemeral: true
		})
	}

	// Toggle lcokdown mode
	logger.debug(`Toggling lockdown mode for guild ${interaction.guildId}`)
	const settings = getSettings(interaction.guildId)
	const newSettings = updateSettings(interaction.guildId, {
		lockdownMode: !settings.lockdownMode
	})

	// Update setup message
	const setupMessage = createSetupMessage(interaction, newSettings)
	await interaction.editReply({
		content: setupMessage.content,
		components: setupMessage.components
	})

	// Log action to modlogs channel
	const lockdownMode = newSettings.lockdownMode ? 'enabled' : 'disabled'
	logAction(interaction.guildId, {
		embeds: [
			{
				title: `Lockdown mode ${lockdownMode}`,
				description: `Lockdown mode has been ${lockdownMode}`,
				color: newSettings.lockdownMode ? Colors.DarkRed : Colors.Green,
				timestamp: new Date().toISOString(),
				footer: {
					icon_url: interaction.user.displayAvatarURL(),
					text: 'by @' + interaction.user.username
				}
			}
		]
	})
}
