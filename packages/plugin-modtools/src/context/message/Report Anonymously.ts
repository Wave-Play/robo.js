import { getSettings } from '../../core/settings.js'
import { Modals, TextInputs } from '../../core/constants.js'
import { logger, setState } from 'robo.js'
import { ChannelType, Colors, ComponentType, TextInputStyle } from 'discord.js'
import type { ContextConfig } from 'robo.js'
import type { MessageContextMenuCommandInteraction, Message } from 'discord.js'

export const config: ContextConfig = {
	description: 'Report a message anonymously',
	dmPermission: false
}

export default async (interaction: MessageContextMenuCommandInteraction, message: Message) => {
	// Validate modmail channel
	const { mailChannelId } = getSettings(interaction.guildId)
	if (!mailChannelId) {
		logger.debug(`No modmail channel set for guild ${interaction.guildId}`)
		return {
			embeds: [
				{
					title: 'Oops, something went wrong',
					description: `No modmail channel has set up for this server. Please contact a moderator.`,
					color: Colors.Red
				}
			],
			ephemeral: true
		}
	}

	const mailChannel = interaction.guild?.channels?.cache?.get(mailChannelId)
	if (!mailChannel || mailChannel.type !== ChannelType.GuildText) {
		logger.debug(`Invalid modmail channel for guild ${interaction.guildId}`)
		return {
			embeds: [
				{
					title: 'Oops, something went wrong',
					description: `Invalid modmail channel set up for this server. Please contact a moderator.`,
					color: Colors.Red
				}
			],
			ephemeral: true
		}
	}

	// Set message state to be used in modal
	setState('report-message', message, {
		namespace: interaction.guildId + '-' + interaction.user.id
	})

	// Open modal
	await interaction.showModal({
		title: 'Report message anonymously',
		custom_id: Modals.ReportMessage.id,
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.TextInput,
						label: 'Why are you reporting this message?',
						style: TextInputStyle.Paragraph,
						custom_id: TextInputs.ReportReason.id
					}
				]
			}
		]
	})
}
