import { getClient } from '@robojs/discordjs'
import type { TextChannel } from 'discord.js'
import type { StartContext } from 'robo.js'

interface PluginOptions {
	deletePolls?: boolean
}

export default (context: StartContext<PluginOptions>) => {
	const { deletePolls } = context.pluginConfig ?? {}
	const client = getClient()

	client.on('raw', async (event) => {
		// Only listen to new message events
		if (!deletePolls || event.t !== 'MESSAGE_CREATE') {
			return
		}

		// Delete poll messages
		const { d: message } = event

		if (message.poll) {
			const channel = client.channels.cache.get(message.channel_id) as unknown as TextChannel
			channel?.messages.delete(message.id)
		}
	})
}
