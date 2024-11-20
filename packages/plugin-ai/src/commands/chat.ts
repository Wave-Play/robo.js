import { AI } from '@/core/ai.js'
import { ChatMessage } from '@/engines/base.js'
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'
import type { CommandConfig } from 'robo.js'

export const config: CommandConfig = {
	description: "Let's chat together!",
	options: [
		{
			name: 'message',
			required: true
		}
	]
}

export default async (interaction: ChatInputCommandInteraction) => {
	const message = interaction.options.get('message')?.value as string
	const chatMessage: ChatMessage = {
		role: 'user',
		content: message
	}

	const reply = await AI.chatSync([chatMessage], {
		channel: interaction.channel,
		member: interaction.member as GuildMember,
		showTyping: false
	})

	return {
		components: reply.components,
		content: reply.text,
		embeds: reply.embeds,
		files: reply.files
	}
}
