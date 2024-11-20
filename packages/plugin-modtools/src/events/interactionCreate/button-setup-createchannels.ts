import { createSetupMessage } from '../../commands/mod/setup.js'
import { Buttons, Selects } from '../../core/constants.js'
import { hasPermission, logAction } from '../../core/utils.js'
import { getSettings, updateSettings } from '../../core/settings.js'
import { client, logger, setState } from 'robo.js'
import { ChannelType, PermissionFlagsBits, Colors, ComponentType } from 'discord.js'
import type { EventConfig } from 'robo.js'
import type { BaseInteraction, ButtonInteraction, Guild, OverwriteResolvable } from 'discord.js'

export const config: EventConfig = {
	description: `Creates moderator channels when the setup button is clicked`
}

export default async (interaction: ButtonInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isButton() || interaction.customId !== Buttons.CreateChannels.id) {
		return
	}
	await interaction.deferUpdate()

	// Validate permissions
	if (!hasPermission(interaction, 'ModerateMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to create moderation channels`)
		return interaction.followUp({
			content: `You don't have permission to use this.`,
			ephemeral: true
		})
	}

	// Validate guild
	if (!interaction.guild) {
		logger.warn(`Interaction ${interaction.id} is missing guild`)
		await interaction.followUp({
			content: 'This command can only be used in a server.',
			ephemeral: true
		})
		return
	}

	// Create moderator channels
	logger.debug(`Creating moderator channels for guild ${interaction.guildId}`)
	const channelsCreated = []
	let { logsChannelId, mailChannelId } = getSettings(interaction.guildId)
	if (!logsChannelId) {
		const logsChannel = await createChannel(interaction, 'moderator-logs', 'Moderation actions will be logged here.')
		logsChannelId = logsChannel.id
		channelsCreated.push(logsChannel)
	}
	if (!mailChannelId) {
		const mailChannel = await createChannel(interaction, 'moderator-mail', 'Reports and appeals will be sent here.')
		mailChannelId = mailChannel.id
		channelsCreated.push(mailChannel)
	}

	// Update settings
	const newSettings = updateSettings(interaction.guildId, {
		logsChannelId,
		mailChannelId
	})

	// Update setup message
	const setupMessage = createSetupMessage(interaction, newSettings)
	await interaction.editReply({
		content: setupMessage.content,
		components: setupMessage.components
	})
	setState('modchannels-created', channelsCreated, {
		namespace: interaction.guildId + '-' + interaction.user.id
	})

	// Send confirmation
	await interaction.followUp({
		content: `Missing moderator channels have been created!\n${channelsCreated.join(
			'\n'
		)}\n\nYou should update channel permissions to allow your moderators to view them, or you can select them below.`,
		ephemeral: true,
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.RoleSelect,
						placeholder: 'Select a role to allow access to moderator channels',
						custom_id: Selects.ModChannelRoles.id,
						min_values: 0,
						max_values: 25
					}
				]
			}
		]
	})
}

async function createChannel(interaction: BaseInteraction, channelName: string, channelTopic?: string) {
	const guild = interaction.guild as Guild
	const permissions: OverwriteResolvable[] = [
		{
			id: guild.roles.everyone.id,
			deny: [PermissionFlagsBits.ViewChannel]
		},
		{
			id: guild.ownerId,
			allow: [PermissionFlagsBits.ViewChannel]
		},
		{
			id: client.user?.id as string,
			allow: [PermissionFlagsBits.ViewChannel]
		}
	]
	const moderatorRole = guild.roles.cache.find((role) => role.name.toLowerCase().includes('moderator'))
	if (moderatorRole) {
		permissions.push({
			id: moderatorRole.id,
			allow: [PermissionFlagsBits.ViewChannel]
		})
	}
	if (interaction.member?.user?.id) {
		permissions.push({
			id: interaction.member.user.id,
			allow: [PermissionFlagsBits.ViewChannel]
		})
	}

	const createdChannel = await guild.channels.create({
		name: channelName,
		topic: channelTopic,
		permissionOverwrites: permissions,
		type: ChannelType.GuildText
	})

	// Log action to modlogs channel
	logger.debug(`Created moderator channel #${createdChannel.name} for guild ${interaction.guildId}`)
	logAction(interaction.guildId, {
		embeds: [
			{
				title: 'Moderator channel created',
				description: `${createdChannel} has been created`,
				color: Colors.Blurple,
				timestamp: new Date().toISOString(),
				footer: {
					icon_url: interaction.user.displayAvatarURL(),
					text: 'by @' + interaction.user.username
				}
			}
		]
	})

	return createdChannel
}
