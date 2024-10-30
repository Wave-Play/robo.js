import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { createCommandConfig } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

export const config = createCommandConfig({
	description: 'Poke the bot!'
} as const)

export default async (interaction: ChatInputCommandInteraction) => {
	const button = new ButtonBuilder().setCustomId('poke').setStyle(ButtonStyle.Primary).setLabel('Poke me!')
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button)

	await interaction.reply({
		content: 'Poke me!',
		components: [row]
	})
}
