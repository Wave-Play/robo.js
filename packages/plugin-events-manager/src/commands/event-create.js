import { createCommandConfig, logger } from 'robo.js'
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import { saveEvent } from '../core/storage.js'

export const config = createCommandConfig({
	description: 'Create a new community event',
	options: [
		{
			name: 'quick-event',
			description: 'Quickly create a simple event',
			type: 'String',
			required: false
		}
	]
})

export default async (interaction) => {
	logger.info(`Event create command used by ${interaction.user.tag}`)

	if (!interaction.member.permissions.has('ManageGuild') && !interaction.member.permissions.has('Administrator')) {
		return interaction.reply({
			content: '❌ You need the "Manage Guild" permission to create events.',
			ephemeral: true
		})
	}

	const quickEvent = interaction.options.getString('quick-event')

	if (quickEvent) {
		try {
			const eventData = parseQuickEvent(quickEvent, interaction.user.id, interaction.user.displayName, interaction.guild.id)
			
			const saved = await saveEvent(interaction.guild.id, eventData)
			if (!saved) {
				return interaction.reply({
					content: '❌ Failed to save event. Please try again.',
					ephemeral: true
				})
			}
			
			const embed = createEventEmbed(eventData, interaction.user)
			const buttons = createEventButtons(eventData.id)

			await interaction.reply({
				content: '✅ Event created successfully!',
				embeds: [embed],
				components: [buttons]
			})
		} catch (error) {
			logger.error('Error creating quick event:', error)
			return interaction.reply({
				content: '❌ Invalid quick event format. Example: `"Gaming Night - Tomorrow 8PM - Fun gaming session"`',
				ephemeral: true
			})
		}
	} else {
		const modal = createEventModal()
		await interaction.showModal(modal)
	}
}

function parseQuickEvent(quickEventString, creatorId, creatorName, guildId) {
	const parts = quickEventString.split(' - ')
	if (parts.length < 2) {
		throw new Error('Invalid format')
	}

	const title = parts[0].trim()
	const dateTime = parts[1].trim()
	const description = parts.slice(2).join(' - ').trim() || 'No description provided'

	let parsedDate = new Date()
	const now = new Date()
	
	if (dateTime.toLowerCase().includes('tomorrow')) {
		parsedDate.setDate(now.getDate() + 1)
		const timeMatch = dateTime.match(/(\d{1,2})(:\d{2})?\s*(am|pm)?/i)
		if (timeMatch) {
			let hour = parseInt(timeMatch[1])
			const minute = timeMatch[2] ? parseInt(timeMatch[2].substring(1)) : 0
			const ampm = timeMatch[3]
			
			if (ampm && ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12
			if (ampm && ampm.toLowerCase() === 'am' && hour === 12) hour = 0
			
			parsedDate.setHours(hour, minute, 0, 0)
		}
	}

	return {
		id: generateEventId(),
		title,
		description,
		dateTime: parsedDate,
		location: 'Discord Server',
		maxAttendees: null,
		currentAttendees: 0,
		creatorId,
		creatorName,
		guildId,
		attendees: {
			going: [],
			maybe: [],
			notGoing: []
		}
	}
}

function generateEventId() {
	return 'evt_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
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
		.setLabel('Date & Time (e.g., "2025-10-15 20:00" or "Tomorrow 8PM")')
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
