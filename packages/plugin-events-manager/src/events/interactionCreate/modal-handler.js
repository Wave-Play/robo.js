import { logger } from 'robo.js'
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { saveEvent } from '../../core/storage.js'
import { generateEventId } from '../../core/utils.js'

export default async (interaction) => {
	if (!interaction.isModalSubmit()) return

	if (interaction.customId === 'event-create-modal') {
		await handleEventCreationModal(interaction)
	}
}

async function handleEventCreationModal(interaction) {
	try {
		const title = interaction.fields.getTextInputValue('event-title')
		const description = interaction.fields.getTextInputValue('event-description')
		const dateTimeInput = interaction.fields.getTextInputValue('event-datetime')
		const location = interaction.fields.getTextInputValue('event-location') || 'Not specified'
		const maxAttendeesInput = interaction.fields.getTextInputValue('event-max-attendees')

		const parsedDateTime = parseDateTime(dateTimeInput)
		if (!parsedDateTime) {
			return interaction.reply({
				content: '❌ Invalid date/time format. Please use ISO format: `YYYY-MM-DD HH:MM`\nExample: `2025-12-25 14:30`',
				ephemeral: true
			})
		}

		let maxAttendees = null
		if (maxAttendeesInput) {
			const parsed = parseInt(maxAttendeesInput)
			if (isNaN(parsed) || parsed < 1) {
				return interaction.reply({
					content: '❌ Max attendees must be a positive number or left empty for unlimited.',
					ephemeral: true
				})
			}
			maxAttendees = parsed
		}
		const eventData = {
			id: generateEventId(),
			title: title.trim(),
			description: description.trim(),
			dateTime: parsedDateTime,
			location: location.trim(),
			maxAttendees,
			currentAttendees: 0,
			creatorId: interaction.user.id,
			creatorName: interaction.user.displayName,
			guildId: interaction.guild.id,
			attendees: {
				going: [],
				maybe: [],
				notGoing: []
			}
		}

		if (eventData.dateTime <= new Date()) {
			return interaction.reply({
				content: '❌ Event date/time must be in the future.',
				ephemeral: true
			})
		}

		const saved = await saveEvent(interaction.guild.id, eventData)
		if (!saved) {
			return interaction.reply({
				content: '❌ Failed to save event. Please try again.',
				ephemeral: true
			})
		}
		
		const embed = createEventEmbed(eventData)
		const buttons = createEventButtons(eventData.id)

		logger.info(`Event created: ${eventData.title} by ${interaction.user.tag}`)

		await interaction.reply({
			content: '✅ Event created successfully!',
			embeds: [embed],
			components: [buttons]
		})

	} catch (error) {
		logger.error('Error handling event creation modal:', error)
		await interaction.reply({
			content: '❌ An error occurred while creating the event. Please try again.',
			ephemeral: true
		})
	}
}

function parseDateTime(dateTimeString) {
	const input = dateTimeString.trim()

	// Only accept ISO format: YYYY-MM-DD HH:MM
	const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/)
	if (isoMatch) {
		const [, year, month, day, hour, minute] = isoMatch
		const date = new Date(
			parseInt(year),
			parseInt(month) - 1,
			parseInt(day),
			parseInt(hour),
			parseInt(minute)
		)
		return date.getTime() > 0 ? date : null
	}

	return null
}


function createEventEmbed(eventData) {
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
				value: eventData.location,
				inline: true
			},
			{
				name: '👥 Attendees',
				value: `${eventData.currentAttendees}${eventData.maxAttendees ? `/${eventData.maxAttendees}` : ''}`,
				inline: true
			}
		)
		.setFooter({
			text: `Created by ${eventData.creatorName}`,
		})
	.setTimestamp()

	const timeDiff = eventData.dateTime.getTime() - Date.now()
	const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60))
	
	if (hoursDiff <= 24 && hoursDiff > 0) {
		embed.addFields({
			name: '⚡ Starting Soon',
			value: `<t:${Math.floor(eventData.dateTime.getTime() / 1000)}:R>`,
			inline: false
		})
	}

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
