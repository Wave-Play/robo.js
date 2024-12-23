import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { createCommandConfig } from 'robo.js'

export const config = createCommandConfig({
	description: 'Poke the bot!'
})

export default (interaction) => {
	const button = new ButtonBuilder().setCustomId('poke').setStyle(ButtonStyle.Primary).setLabel('Poke me!')
	const row = new ActionRowBuilder().addComponents(button)

	interaction.reply({
		content: 'Poke me!',
		components: [row]
	})
}
