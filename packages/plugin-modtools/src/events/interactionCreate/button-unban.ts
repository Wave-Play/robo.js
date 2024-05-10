import { Buttons, ID_NAMESPACE } from '../../core/constants.js'
import { getSettings } from '../../core/settings.js'
import { hasPermission, logAction } from '../../core/utils.js'
import { Flashcore, logger } from 'robo.js'
import { ButtonStyle, Colors, ComponentType } from 'discord.js'
import type { EventConfig } from 'robo.js'
import type { ButtonInteraction } from 'discord.js'

export const config: EventConfig = {
	description: `Unbans a user when clicked`
}

export default async (interaction: ButtonInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isButton() || !interaction.customId.startsWith(Buttons.Unban.id)) {
		return
	}
	await interaction.deferUpdate()

	// Get settings
	const { logsChannelId, testMode } = getSettings(interaction.guildId)

	// Validate permissions
	if (!hasPermission(interaction, 'BanMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to unban users`)
		return interaction.followUp({
			content: `You don't have permission to use this.`,
			ephemeral: true
		})
	}

	// Get ban data
	const parts = interaction.customId.split('/')
	const userId = parts[parts.length - 1]
	const namespace = ID_NAMESPACE + interaction.guildId + userId
	const banData = await Flashcore.get('ban', { namespace })

	if (!banData) {
		return interaction.followUp({
			content: 'Ban not found',
			ephemeral: true
		})
	}

	// Get user data
	const user = await interaction.client.users.fetch(userId)
	const userAvatar = user.avatarURL()

	// Do the unban
	logger.debug(`Unbanning user @${user.username} from guild ${interaction.guildId}:`, banData)
	if (!testMode) {
		await interaction.guild?.members?.unban(userId)
		await Flashcore.delete('ban', { namespace })
	}

	// Log action to modlogs channel
	if (interaction.channelId !== logsChannelId) {
		const testPrefix = testMode ? '[TEST] ' : ''
		const avatar = userAvatar ? { url: userAvatar } : undefined
		logAction(interaction.guildId, {
			embeds: [
				{
					title: testPrefix + `Unban`,
					description: `User <@${userId}> has been unbanned`,
					thumbnail: avatar,
					color: Colors.Green,
					timestamp: new Date().toISOString(),
					footer: {
						icon_url: interaction.user.displayAvatarURL(),
						text: 'by @' + interaction.user.username
					}
				}
			]
		})
	}

	return interaction.followUp({
		embeds: [
			{
				color: Colors.DarkRed,
				title: `${user.username} was unbanned`,
				thumbnail: {
					url: user.displayAvatarURL()
				},
				fields: [
					{
						name: 'Member',
						value: user.toString()
					}
				]
			}
		],
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.Button,
						label: 'Unban',
						style: ButtonStyle.Danger,
						customId: Buttons.Unban.id + '/' + user.id
					}
				]
			}
		]
	})
}
