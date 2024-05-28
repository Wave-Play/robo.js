import { createLogtailDrain } from '../core/drain.js'
import { logger } from 'robo.js'
import type { Client } from 'discord.js'

export let heartbeatIntervalId: NodeJS.Timeout | null = null

interface PluginConfig {
	heartbeat?: {
		debug?: boolean
		interval?: number
		url: string
	}
	sourceToken?: string
}

export default (_client: Client, config: PluginConfig) => {
	const sourceToken = config.sourceToken ?? process.env.BETTER_STACK_SOURCE_TOKEN
	if (sourceToken) {
		logger().setDrain(createLogtailDrain(sourceToken))
	}

	// Ping heartbeat monitor if configured
	const { debug, interval = 5_000, url } = config.heartbeat ?? {}
	if (url) {
		// Supress Fetch API experimental warning
		process.removeAllListeners('warning')

		heartbeatIntervalId = setInterval(() => {
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
