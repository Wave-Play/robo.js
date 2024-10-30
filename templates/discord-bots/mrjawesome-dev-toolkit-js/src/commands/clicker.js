import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

export const config = {
	description: 'haha button go brrr'
}

export default async (interaction) => {
	const button = new ButtonBuilder().setCustomId('clicker').setStyle(ButtonStyle.Primary).setLabel('Click me!')
	const row = new ActionRowBuilder().addComponents(button)

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
