import { ButtonStyle, ChannelType, Colors } from 'discord.js'
import { client, logger } from '@roboplay/robo.js'
import type { ButtonInteraction, CommandInteraction } from 'discord.js'

interface Poll {
	channelId: string
	question: string
	choices: string[]
	final: boolean
	votes: number[]
	voters: Map<string, number>
}

export const polls = new Map<string, Poll>()

/**
 * Creates a poll in the channel the interaction was sent in.
 * If the channel is a stage channel, an error will be thrown.
 */
export const createPoll = async (interaction: CommandInteraction, question: string, choices: string[]) => {
	// Make sure this is a text channel
	if (!interaction.channel || interaction.channel?.type === ChannelType.GuildStageVoice) {
		throw new Error('Polls can only be created in text channels!')
	}

	return interaction.channel.send({
		embeds: [
			{
				title: question,
				description: 'React with the corresponding emoji to vote!',
				color: Colors.Aqua,
				fields: choices.map((choice) => ({
					name: choice,
					value: '0 votes'
				})),
				footer: {
					text: 'Poll created by ' + interaction.user.username
				}
			}
		],
		components: [
			{
				type: 1,
				components: choices.map((choice, index) => ({
					type: 2,
					label: choice,
					style: ButtonStyle.Primary,
					custom_id: choice + '_' + index
				}))
			}
		]
	})
}

export const stopAllPolls = async () => {
	logger.debug(`Trying to end ${polls.size} polls...`)
	for (const [pollId, poll] of polls) {
		try {
			logger.debug(`Ending poll with ID ${pollId}...`)
			const channel = await client.channels.fetch(poll.channelId)
			if (
				!channel ||
				[ChannelType.GuildCategory, ChannelType.GroupDM, ChannelType.GuildStageVoice].includes(channel.type)
			) {
				throw new Error('Polls can only be created in text channels!')
			}

			// @ts-expect-error - Look for better way to do this
			const message = await channel.messages.fetch(pollId)
			if (!message) {
				throw new Error('Message not found.')
			}

			await message.edit({
				components: [
					{
						type: 1,
						components: poll.choices.map((choice, index) => ({
							type: 2,
							label: choice,
							style: ButtonStyle.Primary,
							custom_id: choice + '_' + index,
							disabled: true
						}))
					}
				]
			})
		} catch (error) {
			logger.error(`Error ending poll with ID ${pollId}:`, error)
		}
	}
}

/**
 * Update the poll message with the latest votes reflected in the poll object.
 */
export const updatePoll = async (interaction: ButtonInteraction, poll: Poll) => {
	await interaction.message.edit({
		embeds: [
			{
				title: poll.question,
				description: 'React with the corresponding emoji to vote!',
				color: Colors.Aqua,
				fields: poll.choices.map((choice: string, index: number) => ({
					name: choice,
					value: poll.votes[index] + ' votes'
				})),
				footer: {
					text: 'Poll created by ' + interaction.message.author.username
				}
			}
		]
	})
}
