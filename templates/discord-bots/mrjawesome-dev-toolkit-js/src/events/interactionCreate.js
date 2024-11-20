import { ButtonHandlers, ModalHandlers } from './_start/interactionHandler.js'

export default (interaction) => {
	if (interaction.isButton()) {
		ButtonHandlers.get(interaction.customId)?.(interaction)
	} else if (interaction.isModalSubmit()) {
		ModalHandlers.get(interaction.customId)?.(interaction)
	}
}
