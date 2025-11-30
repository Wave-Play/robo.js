/**
 * Default ready event handler for @robojs/discordjs
 *
 * Logs when the bot is ready and handles restart notifications.
 */
import { color, getState, portal, setState } from 'robo.js'
import { ChannelType } from 'discord.js'
import { discordLogger } from '../core/logger.js'
import { checkIntents } from '../core/intents.js'
import type { Client } from 'discord.js'
import type { EventConfig } from '../types/index.js'

/** State key for restart data */
const STATE_KEY_RESTART = '__robo_restart'

/** Restart state data structure */
interface RestartData {
	channelId: string
	startTime: number
}

export const config: EventConfig = {
	description: 'Log when bot is ready and send restart notification'
}

export default async (client: Client) => {
	const readyAt = color.dim(`(${new Date().toLocaleString()})`)
	discordLogger.ready(`On standby as ${color.bold(client.user?.tag ?? 'Unknown')}`, readyAt)

	// Check for missing intents
	const portalApi = portal as unknown as { getByType: (type: string) => Record<string, unknown[]> }
	const eventsData = portalApi.getByType('discord:events')
	checkIntents(client, eventsData)

	// Send update message if this Robo was just restarted
	const restartData = getState<RestartData>(STATE_KEY_RESTART)

	if (restartData) {
		const { channelId, startTime } = restartData
		const channel = client.channels.cache.get(channelId)

		if (!channel || channel.type !== ChannelType.GuildText) {
			return
		}

		channel.send('```\n' + `Successfully restarted in ${Date.now() - startTime}ms` + '\n```')
		setState(STATE_KEY_RESTART, undefined)
	}
}
