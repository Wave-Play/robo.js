import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { createCommandConfig } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

export const config = createCommandConfig({
	description: 'haha button go brrr'
} as const)

export default async (interaction: ChatInputCommandInteraction) => {
	const button = new ButtonBuilder().setCustomId('clicker').setStyle(ButtonStyle.Primary).setLabel('Click me!')
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button)

	let clickCount = 0
	const message = await interaction.reply({
		content: 'Click the button!',
		components: [row]
	})
	const collector = message.createMessageComponentCollector({
		filter: (i) => i.customId === 'clicker'
	})

	collector.on('collect', async (i) => {
		clickCount++
		await i.update({
			content: `You clicked the button ${clickCount} times!`
		})
	})
}
