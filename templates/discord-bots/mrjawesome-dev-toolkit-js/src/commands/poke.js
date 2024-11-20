import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

export const config = {
	description: 'Poke the bot!'
}

export default async (interaction) => {
	const button = new ButtonBuilder().setCustomId('poke').setStyle(ButtonStyle.Primary).setLabel('Poke me!')
	const row = new ActionRowBuilder().addComponents(button)

	await interaction.reply({
		content: 'Poke me!',
		components: [row]
	})
}
