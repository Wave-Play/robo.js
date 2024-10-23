import type { ChatInputCommandInteraction } from 'discord.js'

export const customID = 'poke'

export default async (interaction: ChatInputCommandInteraction) => {
	await interaction.reply({
		content: 'Ouch that hurts! :c',
		ephemeral: true
	})
}
