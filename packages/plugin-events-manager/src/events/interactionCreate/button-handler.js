import { logger } from 'robo.js'
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { getEvent, updateRSVP } from '../../core/storage.js'

export default async (interaction) => {
	if (!interaction.isButton()) return

	if (interaction.customId.startsWith('event-rsvp-')) {
		await handleRSVPButton(interaction)
	} else if (interaction.customId === 'event-view-attendees') {
		await handleViewAttendeesButton(interaction)
	} else if (interaction.customId === 'event-list-refresh') {
		await handleListRefreshButton(interaction)
	}
}

async function handleRSVPButton(interaction) {
	try {
		const match = interaction.customId.match(/event-rsvp-(\w+):(\S+)/)
		if (!match) {
			return interaction.reply({
				content: '❌ Invalid button interaction.',
				ephemeral: true
			})
		}
		
	const [, rsvpType, eventId] = match
	const userId = interaction.user.id
	const userName = interaction.user.displayName

	const event = await getEvent(interaction.guild.id, eventId)
	
	if (!event) {
			return interaction.reply({
				content: '❌ Event not found.',
				ephemeral: true
			})
		}

		if (rsvpType === 'yes' && event.maxAttendees) {
			const currentGoing = event.attendees.going.filter(id => id !== userId).length
			
			if (currentGoing >= event.maxAttendees) {
				const updatedEvent = await updateRSVP(interaction.guild.id, eventId, userId, 'maybe')
				
				if (!updatedEvent) {
					return interaction.reply({
						content: '❌ Error updating RSVP.',
						ephemeral: true
					})
				}
				
				return interaction.reply({
					content: `❌ This event is at capacity (${event.maxAttendees}/${event.maxAttendees} attendees). You've been added to the maybe list instead.`,
					ephemeral: true
				})
			}
		}

		const updatedEvent = await updateRSVP(interaction.guild.id, eventId, userId, rsvpType)
		
		if (!updatedEvent) {
			return interaction.reply({
				content: '❌ Error updating RSVP.',
				ephemeral: true
			})
		}

		const embed = interaction.message.embeds[0]
		const updatedEmbed = updateEventEmbedWithRSVP(embed, updatedEvent, rsvpType)
		const buttons = interaction.message.components[0]

		await interaction.update({
			embeds: [updatedEmbed],
			components: [buttons]
		})

		const confirmationMessage = getRSVPConfirmationMessage(rsvpType, userName)
		await interaction.followUp({
			content: confirmationMessage,
			ephemeral: true
		})

		logger.info(`User ${interaction.user.tag} RSVP'd "${rsvpType}" to event: ${updatedEvent.title}`)

	} catch (error) {
		logger.error('Error handling RSVP button:', error)
		await interaction.reply({
			content: '❌ An error occurred while updating your RSVP. Please try again.',
			ephemeral: true
		})
	}
}

async function handleViewAttendeesButton(interaction) {
	try {
		const parts = interaction.customId.split(':')
		const eventId = parts[1]
		
		if (!eventId || parts.length !== 2) {
			return interaction.reply({
				content: '❌ Invalid button interaction.',
				ephemeral: true
			})
		}
		
		const event = await getEvent(interaction.guild.id, eventId)
		
		if (!event) {
			return interaction.reply({
				content: '❌ Event not found.',
				ephemeral: true
			})
		}
		
		const attendeeDetails = {
			going: [],
			maybe: [],
			notGoing: []
		}
		
		for (const userId of event.attendees.going || []) {
			try {
				const user = await interaction.client.users.fetch(userId)
				attendeeDetails.going.push({ id: userId, name: user.displayName || user.username })
			} catch {
				attendeeDetails.going.push({ id: userId, name: 'Unknown User' })
			}
		}
		
		for (const userId of event.attendees.maybe || []) {
			try {
				const user = await interaction.client.users.fetch(userId)
				attendeeDetails.maybe.push({ id: userId, name: user.displayName || user.username })
			} catch {
				attendeeDetails.maybe.push({ id: userId, name: 'Unknown User' })
			}
		}
		
		for (const userId of event.attendees.notGoing || []) {
			try {
				const user = await interaction.client.users.fetch(userId)
				attendeeDetails.notGoing.push({ id: userId, name: user.displayName || user.username })
			} catch {
				attendeeDetails.notGoing.push({ id: userId, name: 'Unknown User' })
			}
		}

		const attendeeEmbed = createAttendeesEmbed(event.title, attendeeDetails)

		await interaction.reply({
			embeds: [attendeeEmbed],
			ephemeral: true
		})

	} catch (error) {
		logger.error('Error showing attendees:', error)
		await interaction.reply({
			content: '❌ An error occurred while fetching attendees. Please try again.',
			ephemeral: true
		})
	}
}

async function handleListRefreshButton(interaction) {
	try {
		await interaction.reply({
			content: '🔄 Events list refreshed!',
			ephemeral: true
		})

	} catch (error) {
		logger.error('Error refreshing event list:', error)
		await interaction.reply({
			content: '❌ An error occurred while refreshing the event list.',
			ephemeral: true
		})
	}
}

function updateEventEmbedWithRSVP(originalEmbed, eventData, rsvpType) {
	const embed = new EmbedBuilder()
		.setTitle(originalEmbed.title)
		.setDescription(originalEmbed.description)
		.setColor(originalEmbed.color)
		.setFooter(originalEmbed.footer)
		.setTimestamp(originalEmbed.timestamp)

	originalEmbed.fields.forEach(field => {
		if (field.name === '👥 Attendees') {
			let newCount = eventData.currentAttendees
			const maxText = eventData.maxAttendees ? `/${eventData.maxAttendees}` : ''
			
			embed.addFields({
				name: field.name,
				value: `${newCount}${maxText}`,
				inline: field.inline
			})
		} else {
			embed.addFields({
				name: field.name,
				value: field.value,
				inline: field.inline
			})
		}
	})

	return embed
}

function getRSVPConfirmationMessage(rsvpType, userName) {
	switch (rsvpType) {
		case 'yes':
			return `✅ Great! You're now marked as **Going** to this event, ${userName}!`
		case 'maybe':
			return `❓ Thanks ${userName}! You're marked as **Maybe** attending this event.`
		case 'no':
			return `❌ Thanks for letting us know, ${userName}. You're marked as **Not Going**.`
		default:
			return `✅ Your RSVP has been updated!`
	}
}

function createAttendeesEmbed(eventTitle, attendees) {
	const embed = new EmbedBuilder()
		.setTitle(`👥 Attendees - ${eventTitle}`)
		.setColor(0x5865F2)
	.setTimestamp()

	if (attendees.going.length > 0) {
		const goingList = attendees.going
			.map((attendee, index) => `${index + 1}. ${attendee.name}`)
			.join('\n')
		
		embed.addFields({
			name: `✅ Going (${attendees.going.length})`,
			value: goingList.length > 1024 ? `${goingList.substring(0, 1020)}...` : goingList,
			inline: false
		})
	}

	if (attendees.maybe.length > 0) {
		const maybeList = attendees.maybe
			.map((attendee, index) => `${index + 1}. ${attendee.name}`)
			.join('\n')
		
		embed.addFields({
			name: `❓ Maybe (${attendees.maybe.length})`,
			value: maybeList.length > 1024 ? `${maybeList.substring(0, 1020)}...` : maybeList,
			inline: false
		})
	}

	if (attendees.notGoing.length > 0) {
		embed.addFields({
			name: `❌ Can't Attend (${attendees.notGoing.length})`,
			value: `${attendees.notGoing.length} member${attendees.notGoing.length === 1 ? '' : 's'} can't attend`,
			inline: false
		})
	}

	const totalResponded = attendees.going.length + attendees.maybe.length + attendees.notGoing.length
	embed.addFields({
		name: '📊 Summary',
		value: `**${totalResponded}** total responses\n**${attendees.going.length}** confirmed attendees\n**${attendees.maybe.length}** possible attendees`,
		inline: false
	})

	if (totalResponded === 0) {
		embed.setDescription('No one has RSVP\'d to this event yet. Be the first!')
	}

	return embed
}