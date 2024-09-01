import { AI } from '@/core/ai.js'
import { logger } from '@/core/logger.js'
import { ChannelType, CommandInteraction } from 'discord.js'
import type { ChatReply } from '@/core/ai.js'
import type { CommandConfig } from 'robo.js'

export const config: CommandConfig = {
	description: 'What would you like me to say?',
	options: [
		{
			description: 'What should I say?',
			name: 'message',
			required: true
		},
		{
			description: 'Say exactly?',
			name: 'exact',
			type: 'boolean'
		},
		{
			description: 'Where should I send the message to?',
			name: 'channel',
			type: 'channel'
		},
		{
			description: 'Who should I mention?',
			name: 'mention',
			type: 'mention'
		}
	]
}

export default async (interaction: CommandInteraction) => {
	// Get the message and channel
	const message = interaction.options.get('message')?.value as string
	const exact = interaction.options.get('exact')?.value as boolean
	const channel = interaction.options.get('channel')?.channel ?? interaction.channel
	const mention = interaction.options.get('mention')?.member

	// Validate the message and channel
	if (!message?.trim()) {
		return 'You need to provide a message to send!'
	}

	if (!channel) {
		return 'Invalid channel.'
	}

	if (![ChannelType.GuildAnnouncement, ChannelType.GuildText].includes(channel.type) || !('send' in channel)) {
		return 'The specified channel is not a text channel.'
	}

	// Send the exact message if that's what we need (& handle newlines)
	if (exact) {
		logger.debug('Sending exact message:', message.replace(/\\n\\n/g, '\n\n'))
		await channel.send(message.replace(/\\n\\n/g, '\n\n'))

		return {
			content: 'Message sent!',
			ephemeral: true
		}
	}

	// Reply using the AI engine
	let result: ChatReply | undefined = undefined
	try {
		result = await new Promise<ChatReply>((resolve) => {
			AI.chat(
				[
					{
						role: 'user',
						content: 'Reword the following in your style: ' + message
					}
				],
				{
					channel: interaction.channel ?? undefined,
					onReply: (reply) => {
						resolve(reply)
					}
				}
			)
		})
	} catch (error) {
		return {
			content: 'I could not send the message. Please try again later.',
			ephemeral: true
		}
	}

	// Send the message to the text channel
	if (mention) {
		result.text = mention.toString() + ' ' + result.text
	}
	channel.send({
		content: result.text,
		components: result.components,
		embeds: result.embeds,
		files: result.files
	})
	return {
		content: 'Message sent!',
		ephemeral: true
	}
}
