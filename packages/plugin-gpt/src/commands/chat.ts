import type { CommandConfig } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'
import type { ChatCompletionRequestMessage } from 'openai'
import { openai, pluginOptions } from '../core.js'

export const config: CommandConfig = {
	description: "Let's chat together!",
	options: [
		{
			name: 'message',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction) => {
	const message = interaction.options.get('message')?.value as string
	const chatMessages: ChatCompletionRequestMessage[] = [
		{
			role: 'user',
			content: message
		}
	]

	if (pluginOptions.systemMessage) {
		chatMessages.splice(0, 0, {
			role: 'system',
			content: pluginOptions.systemMessage
		})
	}

	let result
	try {
		const completion = await openai.createChatCompletion({
			model: 'gpt-3.5-turbo',
			messages: chatMessages,
			temperature: pluginOptions.temperature ?? 0.6
		})
		result = completion?.data?.choices?.[0]?.message?.content
	} catch (error) {
		result = `Sorry, my system is malfunctioning. Please try again later.`
	}

	const quote = pluginOptions.quoteMessage ? `> ${message}\n\n` : ''
	return quote + (result ?? "Sorry, I don't know how to reply to that.")
}
