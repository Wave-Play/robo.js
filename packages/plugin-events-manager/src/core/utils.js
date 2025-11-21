import { randomBytes } from 'crypto'
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js'

/**
 * Generate a unique event ID with strong collision resistance
 * Format: evt_{random_hex}_{timestamp}
 * @returns {string} Unique event ID
 */
export function generateEventId() {
	return 'evt_' + randomBytes(8).toString('hex') + Date.now().toString(36)
}

/**
 * Generate a unique reminder ID with strong collision resistance
 * Format: rem_{random_hex}_{timestamp}
 * @returns {string} Unique reminder ID
 */
export function generateReminderId() {
	return 'rem_' + randomBytes(8).toString('hex') + Date.now().toString(36)
}

/**
 * Create a Discord embed for an event
 * @param {Object} eventData - Event data object
 * @param {string} creatorName - Display name of the event creator (optional, uses eventData.creatorName if not provided)
 * @returns {EmbedBuilder} Discord embed for the event
 */
export function createEventEmbed(eventData, creatorName = null) {
	const creator = creatorName || eventData.creatorName || 'Unknown'
	
	const timestamp = eventData.dateTime instanceof Date 
		? eventData.dateTime.getTime() 
		: eventData.dateTime
	
	const embed = new EmbedBuilder()
		.setTitle(`📅 ${eventData.title}`)
		.setDescription(eventData.description)
		.setColor(0x5865F2)
		.addFields(
			{
				name: '⏰ Date & Time',
				value: `<t:${Math.floor(timestamp / 1000)}:F>`,
				inline: true
			},
			{
				name: '📍 Location',
				value: eventData.location || 'Not specified',
				inline: true
			},
			{
				name: '👥 Attendees',
				value: `${eventData.currentAttendees || 0}${eventData.maxAttendees ? `/${eventData.maxAttendees}` : ''}`,
				inline: true
			}
		)
		.setFooter({
			text: `Created by ${creator}`
		})
		.setTimestamp()

	const timeDiff = timestamp - Date.now()
	const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60))
	
	if (hoursDiff <= 24 && hoursDiff > 0) {
		embed.addFields({
			name: '⚡ Starting Soon',
			value: `<t:${Math.floor(timestamp / 1000)}:R>`,
			inline: false
		})
	}

	return embed
}

/**
 * Create Discord action row with RSVP buttons for an event
 * @param {string} eventId - The event ID to associate with buttons
 * @returns {ActionRowBuilder} Discord action row with buttons
 */
export function createEventButtons(eventId) {
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
