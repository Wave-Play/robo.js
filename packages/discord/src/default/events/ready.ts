// @ts-expect-error - This is valid once command file is parsed
import { getConfig, logger } from '@roboplay/robo.js'
// @ts-expect-error - This is valid once command file is parsed
import { DEFAULT_CONFIG } from '@roboplay/robo.js/dist/core/constants.js'
// @ts-expect-error - This is valid once command file is parsed
import { chalk } from '@roboplay/robo.js/dist/cli/utils/utils.js'
import type { Client } from 'discord.js'

export default async (client: Client) => {
	logger.ready(`On standby as ${chalk.bold(client.user.tag)} (${new Date().toLocaleString()})`)
	const config = getConfig()

	// Ping heartbeat monitor if configured
	if (config.heartbeat?.url) {
		// Supress Fetch API experimental warning
		process.removeAllListeners('warning')

		setInterval(() => {
			if (!client?.isReady() || client?.uptime <= 0) {
				if (config.heartbeat.debug) {
					logger.warn('Robo is not ready, skipping heartbeat.')
				}
				return
			}

			// Bah-dumtz!
			if (config.heartbeat.debug) {
				logger.debug('Sending heartbeat...', new Date().toISOString())
			}
			fetch(config.heartbeat.url)
		}, config.heartbeat?.interval || DEFAULT_CONFIG.heartbeat.interval)
	}
}
