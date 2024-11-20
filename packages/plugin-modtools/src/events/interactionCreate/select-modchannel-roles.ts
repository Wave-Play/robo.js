import { Selects } from '../../core/constants.js'
import { hasPermission, logAction } from '../../core/utils.js'
import { getState, logger } from 'robo.js'
import { Colors } from 'discord.js'
import type { EventConfig } from 'robo.js'
import type { RoleSelectMenuInteraction, TextChannel } from 'discord.js'

export const config: EventConfig = {
	description: `Adds roles to moderation channels when the roles select menu is used`
}

export default async (interaction: RoleSelectMenuInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isRoleSelectMenu() || interaction.customId !== Selects.ModChannelRoles.id) {
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

	// Get and validate channels created
	const channelsCreated = getState<TextChannel[]>('modchannels-created', {
		namespace: interaction.guildId + '-' + interaction.user.id
	})

	if (!channelsCreated) {
		logger.warn(`No moderation channels created for guild ${interaction.guildId}`)
		return interaction.followUp({
			content: `No channels created. Please try again.`,
			ephemeral: true
		})
	}

	// Add roles to moderation channels
	for (const role of interaction.roles.values()) {
		for (const channel of channelsCreated) {
			await channel.permissionOverwrites.edit(role.id, {
				ViewChannel: true
			})
		}
	}

	// Log action to modlogs channel
	logAction(interaction.guildId, {
		embeds: [
			{
				title: 'Roles added to moderation channels',
				description: `The following roles were added:\n${[...interaction.roles.values()].join('\n')}`,
				color: Colors.Blurple,
				timestamp: new Date().toISOString(),
				footer: {
					icon_url: interaction.user.displayAvatarURL(),
					text: 'by @' + interaction.user.username
				}
			}
		]
	})

	// Follow up
	logger.debug(`Successfully added roles to moderation channels for guild ${interaction.guildId}`)
	await interaction.followUp({
		content: `Roles added to moderation channels.`,
		ephemeral: true
	})
}
