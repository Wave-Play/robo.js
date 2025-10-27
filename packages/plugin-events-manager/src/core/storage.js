import { Flashcore, logger } from 'robo.js'

/**
 * Storage utility for managing events, RSVPs, and reminders using Flashcore
 */

// Event Management
export async function saveEvent(guildId, eventData) {
	try {
		const eventId = eventData.id
		await Flashcore.set(`event:${eventId}`, eventData, {
			namespace: guildId
		})
		
		const eventIds = await getEventIds(guildId)
		if (!eventIds.includes(eventId)) {
			eventIds.push(eventId)
			await Flashcore.set('event-ids', eventIds, {
				namespace: guildId
			})
		}
		
		logger.debug(`Saved event ${eventId} for guild ${guildId}`)
		return true
	} catch (error) {
		logger.error('Error saving event:', error)
		return false
	}
}

export async function getEvent(guildId, eventId) {
	try {
		return await Flashcore.get(`event:${eventId}`, {
			namespace: guildId
		})
	} catch (error) {
		logger.error('Error getting event:', error)
		return null
	}
}

export async function getEventIds(guildId) {
	try {
		return (await Flashcore.get('event-ids', {
			namespace: guildId
		})) || []
	} catch (error) {
		logger.error('Error getting event IDs:', error)
		return []
	}
}

export async function getAllEvents(guildId) {
	try {
		const eventIds = await getEventIds(guildId)
		const events = []
		
		for (const eventId of eventIds) {
			const event = await getEvent(guildId, eventId)
			if (event) {
				if (event.dateTime && !(event.dateTime instanceof Date)) {
					event.dateTime = new Date(event.dateTime)
				}
				events.push(event)
			}
		}
		
		return events
	} catch (error) {
		logger.error('Error getting all events:', error)
		return []
	}
}

export async function deleteEvent(guildId, eventId) {
	try {
		await Flashcore.delete(`event:${eventId}`, {
			namespace: guildId
		})
		
		const eventIds = await getEventIds(guildId)
		const updatedIds = eventIds.filter(id => id !== eventId)
		await Flashcore.set('event-ids', updatedIds, {
			namespace: guildId
		})
		
		logger.debug(`Deleted event ${eventId} for guild ${guildId}`)
		return true
	} catch (error) {
		logger.error('Error deleting event:', error)
		return false
	}
}

// RSVP Management
export async function updateRSVP(guildId, eventId, userId, rsvpType) {
	try {
		const event = await getEvent(guildId, eventId)
		if (!event) {
			logger.warn(`Event ${eventId} not found for RSVP update`)
			return null
		}
		
		if (!event.attendees) {
			event.attendees = { going: [], maybe: [], notGoing: [] }
		}
		
		event.attendees.going = event.attendees.going.filter(id => id !== userId)
		event.attendees.maybe = event.attendees.maybe.filter(id => id !== userId)
		event.attendees.notGoing = event.attendees.notGoing.filter(id => id !== userId)
		
		switch (rsvpType) {
			case 'yes':
				event.attendees.going.push(userId)
				break
			case 'maybe':
				event.attendees.maybe.push(userId)
				break
			case 'no':
				event.attendees.notGoing.push(userId)
				break
		}
		
		event.currentAttendees = event.attendees.going.length
		
		await saveEvent(guildId, event)
		logger.debug(`Updated RSVP for user ${userId} on event ${eventId}: ${rsvpType}`)
		return event
	} catch (error) {
		logger.error('Error updating RSVP:', error)
		return null
	}
}

export async function getUserRSVP(guildId, eventId, userId) {
	try {
		const event = await getEvent(guildId, eventId)
		if (!event || !event.attendees) return null
		
		if (event.attendees.going.includes(userId)) return 'yes'
		if (event.attendees.maybe.includes(userId)) return 'maybe'
		if (event.attendees.notGoing.includes(userId)) return 'no'
		
		return null
	} catch (error) {
		logger.error('Error getting user RSVP:', error)
		return null
	}
}

// Reminder Management
export async function saveReminder(guildId, reminderData) {
	try {
		const reminderId = reminderData.id
		await Flashcore.set(`reminder:${reminderId}`, reminderData, {
			namespace: guildId
		})
		
		const reminderIds = await getReminderIds(guildId)
		if (!reminderIds.includes(reminderId)) {
			reminderIds.push(reminderId)
			await Flashcore.set('reminder-ids', reminderIds, {
				namespace: guildId
			})
		}
		
		logger.debug(`Saved reminder ${reminderId} for guild ${guildId}`)
		return true
	} catch (error) {
		logger.error('Error saving reminder:', error)
		return false
	}
}

export async function getReminder(guildId, reminderId) {
	try {
		return await Flashcore.get(`reminder:${reminderId}`, {
			namespace: guildId
		})
	} catch (error) {
		logger.error('Error getting reminder:', error)
		return null
	}
}

export async function getReminderIds(guildId) {
	try {
		return (await Flashcore.get('reminder-ids', {
			namespace: guildId
		})) || []
	} catch (error) {
		logger.error('Error getting reminder IDs:', error)
		return []
	}
}

export async function getAllReminders(guildId) {
	try {
		const reminderIds = await getReminderIds(guildId)
		const reminders = []
		
		for (const reminderId of reminderIds) {
			const reminder = await getReminder(guildId, reminderId)
			if (reminder) {
				if (reminder.reminderTime && !(reminder.reminderTime instanceof Date)) {
					reminder.reminderTime = new Date(reminder.reminderTime)
				}
				reminders.push(reminder)
			}
		}
		
		return reminders
	} catch (error) {
		logger.error('Error getting all reminders:', error)
		return []
	}
}

export async function deleteReminder(guildId, reminderId) {
	try {
		await Flashcore.delete(`reminder:${reminderId}`, {
			namespace: guildId
		})
		
		const reminderIds = await getReminderIds(guildId)
		const updatedIds = reminderIds.filter(id => id !== reminderId)
		await Flashcore.set('reminder-ids', updatedIds, {
			namespace: guildId
		})
		
		logger.debug(`Deleted reminder ${reminderId} for guild ${guildId}`)
		return true
	} catch (error) {
		logger.error('Error deleting reminder:', error)
		return false
	}
}

export async function searchEvents(guildId, query) {
	try {
		const events = await getAllEvents(guildId)
		const lowerQuery = query.toLowerCase()
		
		return events.filter(event => 
			event.id === query ||
			event.title.toLowerCase().includes(lowerQuery) ||
			event.description.toLowerCase().includes(lowerQuery)
		)
	} catch (error) {
		logger.error('Error searching events:', error)
		return []
	}
}
