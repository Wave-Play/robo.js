import { AiEngine } from '../../core/engine.js'
import { logger } from '@roboplay/robo.js'
import { ChannelType, CommandInteraction } from 'discord.js'
import type { CommandConfig } from '@roboplay/robo.js'

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

	if (channel?.type !== ChannelType.GuildText || !('send' in channel)) {
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
	let result: string | undefined = undefined
	try {
		result = await new Promise<string>((resolve) => {
			AiEngine.chat(
				[
					{
						role: 'user',
						content: 'Reword the following in your style: ' + message
					}
				],
				{
					channel: interaction.channel ?? undefined,
					onReply: (reply: string) => {
						resolve(reply)
					}
				}
			)
		})
	} catch (error) {
		// empty
	}

	// Error privately if failed
	if (!result) {
		return {
			content: 'I could not send the message. Please try again later.',
			ephemeral: true
		}
	}

	// Send the message to the text channel
	channel.send((mention ? mention.toString() + ' ' : '') + result)
	return {
		content: 'Message sent!',
		ephemeral: true
	}
}
