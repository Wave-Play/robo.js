import { createCommandConfig, logger } from 'robo.js'
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import { saveEvent } from '../core/storage.js'

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

function createEventEmbed(eventData, creator) {
	const embed = new EmbedBuilder()
		.setTitle(`📅 ${eventData.title}`)
		.setDescription(eventData.description)
		.setColor(0x5865F2)
		.addFields(
			{ 
				name: '⏰ Date & Time', 
				value: `<t:${Math.floor(eventData.dateTime.getTime() / 1000)}:F>`, 
				inline: true 
			},
			{ 
				name: '📍 Location', 
				value: eventData.location || 'Not specified', 
				inline: true 
			},
			{ 
				name: '👥 Attendees', 
				value: `0${eventData.maxAttendees ? `/${eventData.maxAttendees}` : ''}`, 
				inline: true 
			}
		)
		.setFooter({ 
			text: `Created by ${creator.displayName}`, 
			iconURL: creator.displayAvatarURL() 
		})
		.setTimestamp()

	return embed
}

function createEventButtons(eventId) {
	const rsvpYes = new ButtonBuilder()
		.setCustomId(`event-rsvp-yes:${eventId}`)
		.setLabel('✅ Going')
		.setStyle(ButtonStyle.Success)

	const rsvpMaybe = new ButtonBuilder()
		.setCustomId(`event-rsvp-maybe:${eventId}`)
		.setLabel('❓ Maybe')
		.setStyle(ButtonStyle.Secondary)

	const rsvpNo = new ButtonBuilder()
		.setCustomId(`event-rsvp-no:${eventId}`)
		.setLabel('❌ Can\'t Go')
		.setStyle(ButtonStyle.Danger)

	const viewAttendees = new ButtonBuilder()
		.setCustomId(`event-view-attendees:${eventId}`)
		.setLabel('👥 View Attendees')
		.setStyle(ButtonStyle.Primary)

	return new ActionRowBuilder().addComponents(rsvpYes, rsvpMaybe, rsvpNo, viewAttendees)
}
