import { logger } from 'robo.js'
import { processReminders } from '../core/reminders.js'

const INTERVAL_MS = 60_000
const REMINDER_LOOP_KEY = Symbol.for('@robojs/events-manager:reminderLoop')

/**
 * Initialize reminder processing when bot starts
 * Checks for due reminders every minute
 */
export default async (client) => {
	logger.info('Events Manager plugin initialized')

	// Clear any previous loop (hot reload / multiple inits)
	if (client[REMINDER_LOOP_KEY]?.handle) {
		clearInterval(client[REMINDER_LOOP_KEY].handle)
	}

	let running = false
	const tick = async () => {
		if (running) {
			logger.debug('Reminder loop still running, skipping tick')
			return
		}
		running = true
		try {
			await processReminders(client)
		} catch (error) {
			logger.error('Error in reminder processing loop:', error)
		} finally {
			running = false
		}
	}

	// Run once immediately on startup
	await tick()

	// Schedule periodic checks
	const handle = setInterval(tick, INTERVAL_MS)
	client[REMINDER_LOOP_KEY] = { handle }
}
