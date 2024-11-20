import { ButtonHandlers, ModalHandlers } from './_start/interactionHandler.js'
import { BaseInteraction } from 'discord.js'

export default (interaction: BaseInteraction) => {
	if (interaction.isButton()) {
		ButtonHandlers.get(interaction.customId)?.(interaction)
	} else if (interaction.isModalSubmit()) {
		ModalHandlers.get(interaction.customId)?.(interaction)
	}
}
