import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'

export const config = {
	description: 'Say something!'
}

export default async (interaction) => {
	const modal = new ModalBuilder().setTitle('Say something!').setCustomId('say')

	const input = new TextInputBuilder()
		.setCustomId('message')
		.setPlaceholder('Type something...')
		.setLabel('Message')
		.setStyle(TextInputStyle.Paragraph)

	const question = new ActionRowBuilder().addComponents(input)

	modal.addComponents(question)

	await interaction.showModal(modal)
}
