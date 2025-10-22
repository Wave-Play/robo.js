import { logger } from 'robo.js'
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'

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
				content: '❌ Invalid date/time format. Please use formats like:\n• `2025-10-15 20:00`\n• `Tomorrow 8PM`\n• `Next Friday 7:30 PM`\n• `2025-12-25 14:30`',
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

		const embed = createEventEmbed(eventData)
		const buttons = createEventButtons()

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
	const input = dateTimeString.trim().toLowerCase()
	const now = new Date()

	const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/i)
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

	let targetDate = new Date(now)
	
	if (input.includes('tomorrow')) {
		targetDate.setDate(now.getDate() + 1)
	} else if (input.includes('today')) {
		
	} else if (input.includes('next')) {
		if (input.includes('week')) {
			targetDate.setDate(now.getDate() + 7)
		} else if (input.includes('monday')) {
			targetDate = getNextWeekday(now, 1)
		} else if (input.includes('tuesday')) {
			targetDate = getNextWeekday(now, 2)
		} else if (input.includes('wednesday')) {
			targetDate = getNextWeekday(now, 3)
		} else if (input.includes('thursday')) {
			targetDate = getNextWeekday(now, 4)
		} else if (input.includes('friday')) {
			targetDate = getNextWeekday(now, 5)
		} else if (input.includes('saturday')) {
			targetDate = getNextWeekday(now, 6)
		} else if (input.includes('sunday')) {
			targetDate = getNextWeekday(now, 0)
		}
	}

	const timeMatch = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
	if (timeMatch) {
		let hour = parseInt(timeMatch[1])
		const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0
		const ampm = timeMatch[3]

		if (ampm) {
			if (ampm === 'pm' && hour !== 12) hour += 12
			if (ampm === 'am' && hour === 12) hour = 0
		}

		targetDate.setHours(hour, minute, 0, 0)
	} else {
		targetDate.setHours(now.getHours(), now.getMinutes(), 0, 0)
	}

	return targetDate
}

function getNextWeekday(date, targetDay) {
	const currentDay = date.getDay()
	const daysUntil = (targetDay + 7 - currentDay) % 7
	const nextDate = new Date(date)
	nextDate.setDate(date.getDate() + (daysUntil === 0 ? 7 : daysUntil))
	return nextDate
}

function generateEventId() {
	return Math.random().toString(36).substr(2, 9)
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

function createEventButtons() {
	const rsvpYes = new ButtonBuilder()
		.setCustomId('event-rsvp-yes')
		.setLabel('✅ Going')
		.setStyle(ButtonStyle.Success)

	const rsvpMaybe = new ButtonBuilder()
		.setCustomId('event-rsvp-maybe')
		.setLabel('❓ Maybe')
		.setStyle(ButtonStyle.Secondary)

	const rsvpNo = new ButtonBuilder()
		.setCustomId('event-rsvp-no')
		.setLabel('❌ Can\'t Go')
		.setStyle(ButtonStyle.Danger)

	const viewAttendees = new ButtonBuilder()
		.setCustomId('event-view-attendees')
		.setLabel('👥 View Attendees')
		.setStyle(ButtonStyle.Primary)

	return new ActionRowBuilder().addComponents(rsvpYes, rsvpMaybe, rsvpNo, viewAttendees)
}