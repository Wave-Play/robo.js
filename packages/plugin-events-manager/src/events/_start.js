import { logger } from 'robo.js'
import { processReminders } from '../core/reminders.js'

/**
 * Initialize reminder processing when bot starts
 * Checks for due reminders every minute
 */
export default async (client) => {
	logger.info('Events Manager plugin initialized')
	
	// Check reminders every minute
	setInterval(async () => {
		try {
			await processReminders(client)
		} catch (error) {
			logger.error('Error in reminder processing loop:', error)
		}
	}, 60 * 1000) // Every 60 seconds
	
	// Run once immediately on startup
	try {
		await processReminders(client)
	} catch (error) {
		logger.error('Error in initial reminder processing:', error)
	}
}
