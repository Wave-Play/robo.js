import { Modals, TextInputs } from '../../core/constants.js'
import { getState, logger, setState } from 'robo.js'
import type { EventConfig } from 'robo.js'
import type { ModalSubmitInteraction } from 'discord.js'

export const config: EventConfig = {
	description: `Submits a report to the modmail channel when the report message modal is submitted`
}

export default async (interaction: ModalSubmitInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isModalSubmit() || interaction.customId !== Modals.Confirm.id) {
		return
	}

	// Get confirmation
	const confirmation = interaction.fields.getTextInputValue(TextInputs.Confirm.id)
	if (confirmation?.toLowerCase() !== 'yes') {
		interaction.reply({
			content: 'Action failed. Type `yes` next time to confirm.',
			ephemeral: true
		})
		return
	}

	// Get and validate confirmation callback
	const { callback } =
		getState<{ callback: (interaction: ModalSubmitInteraction) => void }>('modal-confirm', {
			namespace: interaction.guildId + interaction.user.id
		}) ?? {}

	if (!callback) {
		console.log(`No callback found for guild ${interaction.guildId}`)
		interaction.reply({
			content: 'Oops, something went wrong',
			ephemeral: true
		})
		return
	}

	// Run callback then clear state
	logger.debug(`Running callback for guild ${interaction.guildId}`)
	callback(interaction)
	setState('modal-confirm', null, {
		namespace: interaction.guildId + interaction.user.id
	})
}
