import { AI } from '@robojs/ai'
import type { Message, MessageContextMenuCommandInteraction } from 'discord.js'

export default async (_interaction: MessageContextMenuCommandInteraction, message: Message) => {
	const response = await AI.chatSync([
		{
			content: message.content,
			role: 'user'
		}
	], {})
	
	return response.text ?? "I don't know what to say"
}
