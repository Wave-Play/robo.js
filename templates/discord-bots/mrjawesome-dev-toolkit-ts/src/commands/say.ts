import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import { createCommandConfig } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

export const config = createCommandConfig({
	description: 'Say something!'
} as const)

export default async (interaction: ChatInputCommandInteraction) => {
	const modal = new ModalBuilder().setTitle('Say something!').setCustomId('say')

	const input = new TextInputBuilder()
		.setCustomId('message')
		.setPlaceholder('Type something...')
		.setLabel('Message')
		.setStyle(TextInputStyle.Paragraph)

	const question = new ActionRowBuilder<TextInputBuilder>().addComponents(input)

	modal.addComponents(question)

	await interaction.showModal(modal)
}
