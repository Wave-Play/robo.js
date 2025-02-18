import { env } from '../core/env.js'
import { logger } from '../core/logger.js'
import { Nanocore } from './nanocore.js'

export const Boot = { check, get, getRandom, notification }

const DefaultCheckFrequency = 24 * 60 * 60 * 1_000

const DefaultDev: BootMessage[] = [
	{
		content: 'Beep boop... Code your Robo to life! Got feedback? Tell us on Discord!',
		type: 'dev'
	},
	{
		content: 'Loading modules... Keep refining that magic! Spot any sparks?',
		type: 'dev'
	},
	{
		content: 'Compiling wonders... Your Robo is shaping up. Talk to us if stuck!',
		type: 'dev'
	}
]
const DefaultStart: BootMessage[] = [
	{
		content: 'Boop beep... Powering on Robo! Need hosting? Check out RoboPlay.dev!',
		type: 'start'
	},
	{
		content: 'System go... Show the world your Robo! Need hosting? We’re here!',
		type: 'start'
	}
]

interface BootMessage {
	content: string
	type: BootMessageType
	weight?: number
}

type BootMessageType = 'dev' | 'start'

/**
 * Gets boot messages for the given type.
 */
async function get(type: BootMessageType): Promise<BootMessage[]> {
	let messages = type === 'dev' ? DefaultDev : DefaultStart

	try {
		const data = await Nanocore.get('boot/messages/' + type)

		if (data && Array.isArray(data) && data.length > 0) {
			messages = data
		}
	} catch (e) {
		// Fail silently
		logger.debug('Failed to get boot messages.', e)
	}

	return messages
}

/**
 * Gets a random boot message for the given type.
 */
async function getRandom(type: BootMessageType): Promise<BootMessage> {
	const messages = await get(type)
	const totalWeight = messages.reduce((acc, m) => acc + (m.weight ?? 1), 0)
	const random = Math.random() * totalWeight
	let weight = 0

	for (const message of messages) {
		weight += message.weight ?? 1

		if (random < weight) {
			return message
		}
	}

	return messages[0]
}

/**
 * Checks for updated boot messages in the background.
 * This is used to provide more context to the user when starting Robo.
 *
 * Fails silently and never throws. No data is collected by the API.
 */
async function check() {
	try {
		// Opt-out of boot message check
		if (env.get('boot.disableCheck') === 'true') {
			logger.debug('Boot message check is disabled. Skipping...')
			return
		}

		// Check if we should fetch boot messages
		const check = ((await Nanocore.get('boot/check')) as { frequency: number; lastCheck: number }) ?? {
			frequency: DefaultCheckFrequency,
			lastCheck: 0
		}

		if (Date.now() - check.lastCheck < check.frequency) {
			return
		}

		// Fetch boot messages
		const response = await fetch(env.get('roboplay.api') + '/robojs/messages')

		if (!response.ok) {
			throw new Error(`${response.status} ${response.statusText}`)
		}

		// Update boot data
		const data = (await response.json()) as { checkFrequency: number; messages: BootMessage[] }
		const devMessages = data.messages.filter((m) => m.type === 'dev')
		const startMessages = data.messages.filter((m) => m.type === 'start')

		if (data.checkFrequency) {
			await Nanocore.update('boot/check', { frequency: data.checkFrequency })
		}
		if (devMessages.length > 0) {
			await Nanocore.set('boot/messages/dev', devMessages)
		}
		if (startMessages.length > 0) {
			await Nanocore.set('boot/messages/start', startMessages)
		}
	} catch (e) {
		await Nanocore.update('boot/check', { frequency: DefaultCheckFrequency })
	} finally {
		await Nanocore.update('boot/check', { lastCheck: Date.now() })
	}
}

interface Notification {
	action: {
		command: string
		label: string
	}
	message: string
	type: 'error' | 'info' | 'update' | 'warning'
}

async function notification(notification: Notification) {
	const notifications = (await Nanocore.get('notifications')) ?? []
	const existing = notifications.find((n: Notification) => n.message === notification.message)

	if (!existing) {
		notifications.push(notification)
		await Nanocore.set('notifications', notifications)
	}
}
