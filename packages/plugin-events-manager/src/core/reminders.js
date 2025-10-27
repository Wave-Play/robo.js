import { logger } from 'robo.js'
import { EmbedBuilder } from 'discord.js'
import { getAllReminders, deleteReminder, getEvent } from './storage.js'

/**
 * Process all reminders across all guilds
 * Sends reminders that are due and deletes them
 */
export async function processReminders(client) {
	// Get all guilds the bot is in
	const guilds = client.guilds.cache

	for (const [guildId, guild] of guilds) {
		try {
			await processGuildReminders(client, guildId, guild)
		} catch (error) {
			logger.error(`Error processing reminders for guild ${guildId}:`, error)
		}
	}
}

/**
 * Process reminders for a specific guild
 */
async function processGuildReminders(client, guildId, guild) {
	const reminders = await getAllReminders(guildId)
	const nowMs = Date.now()
	const MAX_BACKLOG_MS = 7 * 24 * 60 * 60 * 1000 // Process overdue reminders up to 7 days

	// Sort reminders in deterministic order (oldest first)
	reminders.sort((a, b) => {
		const aMs = new Date(a.reminderTime).getTime()
		const bMs = new Date(b.reminderTime).getTime()
		return aMs - bMs
	})

	for (const reminder of reminders) {
		try {
			// Normalize and validate date
			const reminderTime = reminder.reminderTime instanceof Date
				? reminder.reminderTime
				: new Date(reminder.reminderTime)
			const rMs = reminderTime.getTime()
			
			if (Number.isNaN(rMs)) {
				logger.warn(`Invalid reminderTime for reminder ${reminder.id}; skipping`)
				continue
			}

			// Send if due; allow backlog up to MAX_BACKLOG_MS
			const isDue = nowMs >= rMs && (nowMs - rMs) <= MAX_BACKLOG_MS

			if (isDue) {
				await sendReminder(client, reminder, guildId, guild)
				
				// Delete reminder after sending
				await deleteReminder(guildId, reminder.id)
				logger.info(`Sent and deleted reminder ${reminder.id} for event ${reminder.eventTitle}`)
			}
		} catch (error) {
			logger.error(`Error processing reminder ${reminder.id}:`, error)
		}
	}
}

/**
 * Send a reminder to the specified channel
 */
async function sendReminder(client, reminder, guildId, guild) {
	try {
		const channel = guild.channels.cache.get(reminder.channelId)
		if (!channel) {
			logger.warn(`Channel ${reminder.channelId} not found for reminder ${reminder.id}`)
			return
		}

		// Get the event details
		const event = await getEvent(guildId, reminder.eventId)
		if (!event) {
			logger.warn(`Event ${reminder.eventId} not found for reminder ${reminder.id}`)
			return
		}

		const reminderEmbed = createEventReminderEmbed(event)

		await channel.send({
			content: '🔔 **Event Reminder!**',
			embeds: [reminderEmbed]
		})

		logger.info(`Sent reminder for event: ${event.title}`)
	} catch (error) {
		logger.error(`Error sending reminder ${reminder.id}:`, error)
	}
}

/**
 * Create a reminder embed for an event
 */
function createEventReminderEmbed(event) {
	const embed = new EmbedBuilder()
		.setTitle(`🔔 Reminder: ${event.title}`)
		.setDescription(event.description)
		.setColor(0xFFAA00) // Orange for reminders
		.addFields(
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
				name: '⏳ Starting',
				value: `<t:${Math.floor(event.dateTime.getTime() / 1000)}:R>`,
				inline: true
			}
		)
		.setFooter({
			text: "Don't forget to RSVP if you haven't already!"
		})
		.setTimestamp()

	return embed
}
