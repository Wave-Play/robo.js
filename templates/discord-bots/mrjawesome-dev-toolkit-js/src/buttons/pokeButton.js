export const customID = 'poke'

export default async (interaction) => {
	await interaction.reply({
		content: 'Ouch that hurts! :c',
		ephemeral: true
	})
}
