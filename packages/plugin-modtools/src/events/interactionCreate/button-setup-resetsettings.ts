import { Buttons } from '../../core/constants.js'
import { updateSettings } from '../../core/settings.js'
import { createSetupMessage } from '../../commands/mod/setup.js'
import { hasPermission, logAction } from '../../core/utils.js'
import { logger } from 'robo.js'
import { Colors } from 'discord.js'
import type { EventConfig } from 'robo.js'
import type { ButtonInteraction } from 'discord.js'

export const config: EventConfig = {
	description: `Resets settings when the setup button is clicked`
}

export default async (interaction: ButtonInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isButton() || interaction.customId !== Buttons.ResetSettings.id) {
		return
	}
	await interaction.deferUpdate()

	// Validate permissions
	if (!hasPermission(interaction, 'ModerateMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to reset settings`)
		return interaction.followUp({
			content: `You don't have permission to use this.`,
			ephemeral: true
		})
	}

	// Reset settings
	logger.debug(`Resetting settings for guild ${interaction.guildId}`)
	const newSettings = updateSettings(interaction.guildId, {
		auditLogsChannelId: undefined,
		logsChannelId: undefined,
		mailChannelId: undefined,
		requireConfirmation: false,
		testMode: false
	})

	// Update setup message
	const setupMessage = createSetupMessage(interaction, newSettings)
	await interaction.editReply({
		content: setupMessage.content,
		components: setupMessage.components
	})
	await interaction.followUp({
		content: 'Moderation settings have been reset.',
		ephemeral: true
	})

	// Log action to modlogs channel
	logAction(interaction.guildId, {
		embeds: [
			{
				title: 'Settings reset',
				description: `Settings have been reset`,
				color: Colors.Red,
				timestamp: new Date().toISOString(),
				footer: {
					icon_url: interaction.user.displayAvatarURL(),
					text: 'by @' + interaction.user.username
				}
			}
		]
	})
}
