import { randomBytes } from 'crypto'

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
