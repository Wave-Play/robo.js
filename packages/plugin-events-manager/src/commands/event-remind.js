import { createCommandConfig, logger } from 'robo.js'
import { EmbedBuilder } from 'discord.js'
import { searchEvents, saveReminder } from '../core/storage.js'
import { generateReminderId } from '../core/utils.js'

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

	if (!interaction.member.permissions.has('ManageGuild') && !interaction.member.permissions.has('Administrator')) {
		return interaction.reply({
			content: '❌ You need the "Manage Guild" permission to set up reminders.',
			ephemeral: true
		})
	}

	const eventQuery = interaction.options.getString('event')
	const reminderTime = interaction.options.getString('time')
	const targetChannel = interaction.options.getChannel('channel') || interaction.channel

	try {
		const events = await searchEvents(interaction.guild.id, eventQuery)
		
		if (events.length === 0) {
			return interaction.reply({
				content: `❌ Could not find an event matching "${eventQuery}". Use \`/event-list\` to see available events.`,
				ephemeral: true
			})
		}
		
		const event = events[0]

		const reminderDateTime = calculateReminderTime(event.dateTime, reminderTime)
		
		if (reminderDateTime <= new Date()) {
			return interaction.reply({
				content: '❌ The reminder time would be in the past. Choose a different reminder time.',
				ephemeral: true
			})
		}

	const reminder = {
		id: generateReminderId(),
		eventId: event.id,
		eventTitle: event.title,
		reminderTime: reminderDateTime.getTime(),
		channelId: targetChannel.id,
		createdBy: interaction.user.id,
		guildId: interaction.guild.id
	}
		
		const saved = await saveReminder(interaction.guild.id, reminder)
		if (!saved) {
			return interaction.reply({
				content: '❌ Failed to save reminder. Please try again.',
				ephemeral: true
			})
		}

		logger.info(`Reminder created: ${reminder.id} for event ${event.title}`)

		const embed = createReminderConfirmationEmbed(event, reminder, targetChannel)

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
			value: event.location || 'Not specified',
			inline: true
		},
		{
			name: '🔔 Reminder Time',
			value: `<t:${Math.floor(reminder.reminderTime / 1000)}:F>`,
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

