// @ts-expect-error - This is valid once command file is parsed
import { color, getConfig, getState, logger, setState } from '@roboplay/robo.js'
// @ts-expect-error - This is valid once command file is parsed
import { DEFAULT_CONFIG, STATE_KEYS } from '@roboplay/robo.js/dist/core/constants.js'
import { ChannelType, Client } from 'discord.js'

export default async (client: Client) => {
	logger.ready(`On standby as ${color.bold(client.user.tag)} (${new Date().toLocaleString()})`)
	const config = getConfig()

	// Send update message if this Robo was just restarted
	const restartData = getState(STATE_KEYS.restart)
	if (restartData) {
		const { channelId, startTime } = restartData
		const channel = client.channels.cache.get(channelId)

		if (!channel || channel.type !== ChannelType.GuildText) {
			return
		}

		channel.send('```\n' + `Successfully restarted in ${Date.now() - startTime}ms` + '\n```')
		setState(STATE_KEYS.restart, undefined)
	}

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

			fetch(config.heartbeat.url).catch((error) => {
				logger.debug('Heartbeat failed!', error)
			})
		}, config.heartbeat?.interval || DEFAULT_CONFIG.heartbeat.interval)
	}
}
