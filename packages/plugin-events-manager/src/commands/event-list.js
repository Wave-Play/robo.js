import { createCommandConfig, logger } from 'robo.js'
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js'
import { getAllEvents } from '../core/storage.js'

export const config = createCommandConfig({
	description: 'View upcoming and past events',
	options: [
		{
			name: 'filter',
			description: 'Filter events by type',
			type: 'String',
			choices: [
				{ name: 'Upcoming', value: 'upcoming' },
				{ name: 'Past', value: 'past' },
				{ name: 'All', value: 'all' }
			],
			required: false
		},
		{
			name: 'user',
			description: 'Show events created by specific user',
			type: 'User',
			required: false
		}
	]
})

export default async (interaction) => {
	logger.info(`Event list command used by ${interaction.user.tag}`)

	const filter = interaction.options.getString('filter') || 'upcoming'
	const targetUser = interaction.options.getUser('user')

	try {
		const events = await getAllEvents(interaction.guild.id)
		
		let filteredEvents = filterEvents(events, filter)
		
		if (targetUser) {
			filteredEvents = filteredEvents.filter(event => event.creatorId === targetUser.id)
		}

		if (filteredEvents.length === 0) {
			const noEventsMessage = getNoEventsMessage(filter, targetUser)
			return interaction.reply({
				content: noEventsMessage,
				ephemeral: true
			})
		}

		const embed = createEventListEmbed(filteredEvents, filter, targetUser)
		const buttons = createNavigationButtons()

		await interaction.reply({
			embeds: [embed],
			components: buttons.length > 0 ? [buttons] : []
		})

	} catch (error) {
		logger.error('Error fetching events:', error)
		return interaction.reply({
			content: '❌ An error occurred while fetching events. Please try again.',
			ephemeral: true
		})
	}
}


function filterEvents(events, filter) {
	const now = new Date()

	switch (filter) {
		case 'upcoming':
			return events.filter(event => event.dateTime > now)
		case 'past':
			return events.filter(event => event.dateTime <= now)
		case 'all':
		default:
			return events
	}
}

function getNoEventsMessage(filter, targetUser) {
	const userFilter = targetUser ? ` created by ${targetUser.displayName}` : ''
	
	switch (filter) {
		case 'upcoming':
			return `📅 No upcoming events found${userFilter}. Use \`/event-create\` to create one!`
		case 'past':
			return `📅 No past events found${userFilter}.`
		case 'all':
		default:
			return `📅 No events found${userFilter}. Use \`/event-create\` to create the first one!`
	}
}

function createEventListEmbed(events, filter, targetUser) {
	const embed = new EmbedBuilder()
		.setColor(0x5865F2)
		.setTimestamp()

	// Set title based on filter and user
	let title = '📅 Events'
	if (filter !== 'all') {
		title += ` - ${filter.charAt(0).toUpperCase() + filter.slice(1)}`
	}
	if (targetUser) {
		title += ` by ${targetUser.displayName}`
	}
	embed.setTitle(title)

	// Sort events by date
	const sortedEvents = events.sort((a, b) => {
		if (filter === 'past') {
			return b.dateTime - a.dateTime
		}
		return a.dateTime - b.dateTime
	})

	const maxEvents = 10
	const displayEvents = sortedEvents.slice(0, maxEvents)

	if (displayEvents.length === 0) {
		embed.setDescription('No events to display.')
		return embed
	}

	displayEvents.forEach((event, index) => {
		const attendeeInfo = event.maxAttendees 
			? `${event.currentAttendees}/${event.maxAttendees}` 
			: `${event.currentAttendees}`

		const eventStatus = event.dateTime <= new Date() ? '🔴 Past' : '🟢 Upcoming'
		const timeDisplay = `<t:${Math.floor(event.dateTime.getTime() / 1000)}:R>`

		embed.addFields({
			name: `${index + 1}. ${event.title}`,
			value: `${eventStatus} • ${timeDisplay} • 👥 ${attendeeInfo}\n📍 ${event.location || 'Not specified'}\n*${event.description.slice(0, 100)}${event.description.length > 100 ? '...' : ''}*`,
			inline: false
		})
	})

	if (sortedEvents.length > maxEvents) {
		embed.setFooter({ 
			text: `Showing ${maxEvents} of ${sortedEvents.length} events. Run the command again to refresh.` 
		})
	}

	return embed
}

function createNavigationButtons() {
	const refreshButton = new ButtonBuilder()
		.setCustomId('event-list-refresh')
		.setLabel('🔄 Refresh')
		.setStyle(ButtonStyle.Primary)

	return new ActionRowBuilder().addComponents(refreshButton)
}
