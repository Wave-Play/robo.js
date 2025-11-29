import { createCommandConfig, logger } from 'robo.js'
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js'

export const config = createCommandConfig({
	description: 'Create a new community event'
})

export default async (interaction) => {
	logger.info(`Event create command used by ${interaction.user.tag}`)

	if (!interaction.member.permissions.has('ManageGuild') && !interaction.member.permissions.has('Administrator')) {
		return interaction.reply({
			content: '❌ You need the "Manage Guild" permission to create events.',
			ephemeral: true
		})
	}

	const modal = createEventModal()
	await interaction.showModal(modal)
}


function createEventModal() {
	const modal = new ModalBuilder()
		.setCustomId('event-create-modal')
		.setTitle('Create New Event')

	const titleInput = new TextInputBuilder()
		.setCustomId('event-title')
		.setLabel('Event Title')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMaxLength(100)

	const descriptionInput = new TextInputBuilder()
		.setCustomId('event-description')
		.setLabel('Event Description')
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true)
		.setMaxLength(1000)

	const dateTimeInput = new TextInputBuilder()
		.setCustomId('event-datetime')
		.setLabel('Date & Time (format: YYYY-MM-DD HH:MM)')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)

	const locationInput = new TextInputBuilder()
		.setCustomId('event-location')
		.setLabel('Location (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setMaxLength(100)
		.setPlaceholder('Discord Voice Channel, Online, etc.')

	const maxAttendeesInput = new TextInputBuilder()
		.setCustomId('event-max-attendees')
		.setLabel('Max Attendees (optional)')
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setPlaceholder('Leave empty for unlimited')

	const rows = [
		new ActionRowBuilder().addComponents(titleInput),
		new ActionRowBuilder().addComponents(descriptionInput),
		new ActionRowBuilder().addComponents(dateTimeInput),
		new ActionRowBuilder().addComponents(locationInput),
		new ActionRowBuilder().addComponents(maxAttendeesInput)
	]

	modal.addComponents(...rows)
	return modal
}
