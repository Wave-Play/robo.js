import { createSetupMessage } from '../../commands/mod/setup.js'
import { Selects } from '../../core/constants.js'
import { updateSettings } from '../../core/settings.js'
import { hasPermission, logAction } from '../../core/utils.js'
import { logger } from 'robo.js'
import { ChannelType, Colors } from 'discord.js'
import type { EventConfig } from 'robo.js'
import type { Channel, ChannelSelectMenuInteraction } from 'discord.js'

export const config: EventConfig = {
	description: `Sets the audit logs channel when the setup select menu is used`
}

export default async (interaction: ChannelSelectMenuInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isChannelSelectMenu() || interaction.customId !== Selects.ChannelAudit.id) {
		return
	}
	await interaction.deferUpdate()

	// Validate permissions
	if (!hasPermission(interaction, 'ModerateMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to change audit logs channel`)
		return interaction.followUp({
			content: `You don't have permission to use this.`,
			ephemeral: true
		})
	}

	// Validate channel
	const channel = interaction.channels.first() as Channel | undefined
	if (!channel || channel.type !== ChannelType.GuildText) {
		return interaction.followUp({
			content: 'Please select a valid channel.',
			ephemeral: true
		})
	}

	// Add self to logs channel if needed
	const selfId = interaction.member?.user?.id as string
	if (
		!channel.permissionsFor(selfId)?.has('ReadMessageHistory') ||
		!channel.permissionsFor(selfId)?.has('SendMessages') ||
		!channel.permissionsFor(selfId)?.has('ViewChannel')
	) {
		logger.debug(`Adding self to channel #${channel.name} for guild ${interaction.guildId}`)
		await channel.permissionOverwrites.edit(selfId, {
			ReadMessageHistory: true,
			SendMessages: true,
			ViewChannel: true
		})
	}

	// Set logs channel
	const newSettings = updateSettings(interaction.guildId, {
		auditLogsChannelId: channel.id
	})

	// Update setup message
	logger.debug(`Set audit logs channel for guild ${interaction.guildId} to #${channel.name}`)
	const setupMessage = createSetupMessage(interaction, newSettings)
	await interaction.editReply({
		content: setupMessage.content,
		components: setupMessage.components
	})

	// Log action to modlogs channel
	logAction(interaction.guildId, {
		embeds: [
			{
				title: 'Channel set',
				description: `Audit logs channel has been set to ${channel}`,
				color: Colors.Blurple,
				timestamp: new Date().toISOString(),
				footer: {
					icon_url: interaction.user.displayAvatarURL(),
					text: 'by @' + interaction.user.username
				}
			}
		]
	})
}
