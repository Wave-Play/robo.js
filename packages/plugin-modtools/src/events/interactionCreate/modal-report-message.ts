import { Modals, TextInputs } from '../../core/constants.js'
import { logAction } from '../../core/utils.js'
import { getSettings } from '../../core/settings.js'
import { getState, logger, setState } from 'robo.js'
import { ChannelType, Colors } from 'discord.js'
import type { EventConfig } from 'robo.js'
import type { Message, ModalSubmitInteraction } from 'discord.js'

export const config: EventConfig = {
	description: `Submits a report to the modmail channel when the report message modal is submitted`
}

export default async (interaction: ModalSubmitInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isModalSubmit() || interaction.customId !== Modals.ReportMessage.id) {
		return
	}

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

	// Get message state and reason
	const reason = interaction.fields.getTextInputValue(TextInputs.ReportReason.id)
	const message = getState<Message>('report-message', {
		namespace: interaction.guildId + '-' + interaction.user.id
	})

	// Validate message
	if (!message) {
		logger.debug(`No message found for guild ${interaction.guildId}`)
		return {
			embeds: [
				{
					title: 'Oops, something went wrong',
					description: `No message found. Please try again.`,
					color: Colors.Red
				}
			],
			ephemeral: true
		}
	}

	// Submit report to modmail channel
	await mailChannel.send({
		embeds: [
			{
				title: `Report from anonymous user`,
				color: Colors.Yellow,
				thumbnail: {
					url: message.author.displayAvatarURL()
				},
				fields: [
					{
						name: 'Reported member',
						value: message.author.toString()
					},
					{
						name: 'Reported message',
						value: message.content
					},
					{
						name: 'Reason',
						value: reason
					},
					{
						name: 'Message link',
						value: `https://discord.com/channels/${interaction.guildId}/${message.channelId}/${message.id}`
					}
				],
				timestamp: new Date().toISOString(),
				footer: {
					text: 'by anonymous user'
				}
			}
		]
	})

	// Log action to modlogs channel
	logger.debug(`Report submitted to modmail channel for guild ${interaction.guildId}`)
	logAction(interaction.guildId, {
		embeds: [
			{
				title: `Report from anonymous user`,
				color: Colors.Yellow,
				thumbnail: {
					url: message.author.displayAvatarURL()
				},
				fields: [
					{
						name: 'Reported member',
						value: message.author.toString()
					},
					{
						name: 'Reported message',
						value: message.content
					},
					{
						name: 'Reason',
						value: reason
					},
					{
						name: 'Message link',
						value: `https://discord.com/channels/${interaction.guildId}/${message.channelId}/${message.id}`
					}
				],
				timestamp: new Date().toISOString(),
				footer: {
					text: 'by anonymous user'
				}
			}
		]
	})

	// Clean up and follow up
	setState('report-message', undefined, {
		namespace: interaction.guildId + '-' + interaction.user.id
	})
	interaction.reply({
		content: 'Thank you for your report. A moderator will review it shortly.',
		ephemeral: true
	})
}
