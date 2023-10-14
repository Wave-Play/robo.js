import { createLogtailDrain } from '../core/drain.js'
import { logger } from '@roboplay/robo.js'
import type { Client } from 'discord.js'

interface PluginConfig {
	heartbeat?: {
		debug?: boolean
		interval?: number
		url: string
	}
	sourceToken?: string
}

export default (_client: Client, config: PluginConfig) => {
	logger().setDrain(createLogtailDrain(config.sourceToken))

	// Ping heartbeat monitor if configured
	const { debug, interval = 5_000, url } = config.heartbeat ?? {}
	if (url) {
		// Supress Fetch API experimental warning
		process.removeAllListeners('warning')

		setInterval(() => {
			// Bah-dumtz!
			if (debug) {
				logger.debug('Sending heartbeat...', new Date().toISOString())
			}

			fetch(url).catch((error) => {
				logger.debug('Heartbeat failed!', error)
			})
		}, interval)
	}
}
