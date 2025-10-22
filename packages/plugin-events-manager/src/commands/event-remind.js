import { createCommandConfig, logger } from 'robo.js'
import { EmbedBuilder } from 'discord.js'

export const config = createCommandConfig({
	description: 'Set up automatic reminders for events',
	options: [
		{
			name: 'event',
			description: 'Event to set reminder for (use event ID or search)',
			type: 'String',
			required: true
		},
		{
			name: 'time',
			description: 'When to send reminder',
			type: 'String',
			choices: [
				{ name: '1 hour before', value: '1h' },
				{ name: '6 hours before', value: '6h' },
				{ name: '1 day before', value: '1d' },
				{ name: '3 days before', value: '3d' },
				{ name: '1 week before', value: '1w' }
			],
			required: true
		},
		{
			name: 'channel',
			description: 'Channel to send reminder to',
			type: 'Channel',
			required: false
		}
	]
})

export default async (interaction) => {
	logger.info(`Event remind command used by ${interaction.user.tag}`)

	if (!interaction.member.permissions.has('ManageEvents') && !interaction.member.permissions.has('Administrator')) {
		return interaction.reply({
			content: '❌ You need the "Manage Events" permission to set up reminders.',
			ephemeral: true
		})
	}

	const eventQuery = interaction.options.getString('event')
	const reminderTime = interaction.options.getString('time')
	const targetChannel = interaction.options.getChannel('channel') || interaction.channel

	try {
		const mockEvent = findMockEvent(eventQuery)
		
		if (!mockEvent) {
			return interaction.reply({
				content: `❌ Could not find an event matching "${eventQuery}". Use \`/event-list\` to see available events.`,
				ephemeral: true
			})
		}

		const reminderDateTime = calculateReminderTime(mockEvent.dateTime, reminderTime)
		
		if (reminderDateTime <= new Date()) {
			return interaction.reply({
				content: '❌ The reminder time would be in the past. Choose a different reminder time.',
				ephemeral: true
			})
		}

		const reminder = {
			id: generateReminderId(),
			eventId: mockEvent.id,
			eventTitle: mockEvent.title,
			reminderTime: reminderDateTime,
			channelId: targetChannel.id,
			createdBy: interaction.user.id,
			guildId: interaction.guild.id
		}

		logger.info(`Reminder created: ${reminder.id} for event ${mockEvent.title}`)

		const embed = createReminderConfirmationEmbed(mockEvent, reminder, targetChannel)

		await interaction.reply({
			embeds: [embed]
		})

	} catch (error) {
		logger.error('Error setting up reminder:', error)
		return interaction.reply({
			content: '❌ An error occurred while setting up the reminder. Please try again.',
			ephemeral: true
		})
	}
}

function findMockEvent(query) {
	const mockEvents = [
		{
			id: '1',
			title: 'Weekly Gaming Session',
			description: 'Join us for our weekly gaming night!',
			dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
			location: 'Gaming Voice Channel',
			creatorName: 'GameMaster'
		},
		{
			id: '2',
			title: 'Community Meeting',
			description: 'Monthly community meeting to discuss server updates.',
			dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
			location: 'General Voice Channel',
			creatorName: 'ServerAdmin'
		}
	]

	const lowerQuery = query.toLowerCase()
	return mockEvents.find(event => 
		event.id === query ||
		event.title.toLowerCase().includes(lowerQuery) ||
		event.description.toLowerCase().includes(lowerQuery)
	)
}

function calculateReminderTime(eventDateTime, reminderTimeString) {
	const eventTime = eventDateTime.getTime()
	let offsetMs = 0

	switch (reminderTimeString) {
		case '1h':
			offsetMs = 60 * 60 * 1000 // 1 hour
			break
		case '6h':
			offsetMs = 6 * 60 * 60 * 1000 // 6 hours
			break
		case '1d':
			offsetMs = 24 * 60 * 60 * 1000 // 1 day
			break
		case '3d':
			offsetMs = 3 * 24 * 60 * 60 * 1000 // 3 days
			break
		case '1w':
			offsetMs = 7 * 24 * 60 * 60 * 1000
			break
		default:
			offsetMs = 60 * 60 * 1000
	}

	return new Date(eventTime - offsetMs)
}

function generateReminderId() {
	return 'rem_' + Math.random().toString(36).substr(2, 9)
}

function createReminderConfirmationEmbed(event, reminder, channel) {
	const embed = new EmbedBuilder()
		.setTitle('⏰ Reminder Set Successfully')
		.setDescription(`A reminder has been scheduled for **${event.title}**`)
		.setColor(0x00FF00)
		.addFields(
			{
				name: '📅 Event',
				value: event.title,
				inline: true
			},
			{
				name: '⏰ Event Time',
				value: `<t:${Math.floor(event.dateTime.getTime() / 1000)}:F>`,
				inline: true
			},
			{
				name: '📍 Location',
				value: event.location,
				inline: true
			},
			{
				name: '🔔 Reminder Time',
				value: `<t:${Math.floor(reminder.reminderTime.getTime() / 1000)}:F>`,
				inline: false
			},
			{
				name: '📢 Reminder Channel',
				value: `<#${channel.id}>`,
				inline: false
			}
		)
		.setFooter({
			text: `Reminder ID: ${reminder.id}`
		})
		.setTimestamp()

	return embed
}

export const reminderUtils = {
	async sendEventReminder(client, reminder, event) {
		try {
			const guild = client.guilds.cache.get(reminder.guildId)
			if (!guild) return

			const channel = guild.channels.cache.get(reminder.channelId)
			if (!channel) return

			const reminderEmbed = createEventReminderEmbed(event)
			
			await channel.send({
				content: '🔔 **Event Reminder!**',
				embeds: [reminderEmbed]
			})

			logger.info(`Sent reminder for event: ${event.title}`)
		} catch (error) {
			logger.error('Error sending event reminder:', error)
		}
	},

	async processReminders(client) {
		logger.info('Processing event reminders...')
	}
}

function createEventReminderEmbed(event) {
	const embed = new EmbedBuilder()
		.setTitle(`🔔 Reminder: ${event.title}`)
		.setDescription(event.description)
		.setColor(0xFFAA00)
		.addFields(
			{
				name: '⏰ Event Time',
				value: `<t:${Math.floor(event.dateTime.getTime() / 1000)}:F>`,
				inline: true
			},
			{
				name: '📍 Location',
				value: event.location,
				inline: true
			},
			{
				name: '⏳ Starting',
				value: `<t:${Math.floor(event.dateTime.getTime() / 1000)}:R>`,
				inline: true
			}
		)
		.setFooter({
			text: `Don't forget to RSVP if you haven't already!`
		})
		.setTimestamp()

	return embed
}