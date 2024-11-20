import { ModalSubmitInteraction } from 'discord.js'

export const customID = 'say'

export default async (interaction: ModalSubmitInteraction) => {
	const message = interaction.fields.getTextInputValue('message')
	await interaction.deferReply({ ephemeral: true })

	try {
		if (interaction.channel?.isSendable()) {
			await interaction.channel?.send(message)
		}
		await interaction.deleteReply()
	} catch (error) {
		await interaction.editReply('Failed to send message - Check I have permission to send messages in this channel!')
	}
}
