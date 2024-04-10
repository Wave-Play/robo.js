// @ts-expect-error - This is valid once command file is parsed
import { color, getState, setState } from 'robo.js'
// @ts-expect-error - This is valid once command file is parsed
import { STATE_KEYS, discordLogger } from 'robo.js/dist/core/constants.js'
import { ChannelType } from 'discord.js'
import type { Client } from 'discord.js'

export default async (client: Client) => {
	const readyAt = color.dim(`(${new Date().toLocaleString()})`)
	discordLogger.ready(`On standby as ${color.bold(client.user.tag)}`, readyAt)

	// Send update message if this Robo was just restarted
	const restartData = getState<{ channelId: string; startTime: number }>(STATE_KEYS.restart)

	if (restartData) {
		const { channelId, startTime } = restartData
		const channel = client.channels.cache.get(channelId)

		if (!channel || channel.type !== ChannelType.GuildText) {
			return
		}

		channel.send('```\n' + `Successfully restarted in ${Date.now() - startTime}ms` + '\n```')
		setState(STATE_KEYS.restart, undefined)
	}
}
