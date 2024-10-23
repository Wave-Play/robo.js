import { createCommandConfig } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

export const config = createCommandConfig({
	description: 'Pong!'
} as const)

export default (interaction: ChatInputCommandInteraction) => {
	interaction.reply('Pong!')
}
