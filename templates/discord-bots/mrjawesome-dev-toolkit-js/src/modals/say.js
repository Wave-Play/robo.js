export const customID = 'say'

export default async (interaction) => {
	const message = interaction.fields.getTextInputValue('message')
	await interaction.deferReply({ ephemeral: true })

	try {
		await interaction.channel.send(message)
		await interaction.deleteReply()
	} catch (error) {
		await interaction.editReply('Failed to send message - Check I have permission to send messages in this channel!')
	}
}
