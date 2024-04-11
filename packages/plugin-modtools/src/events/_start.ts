import type { Client, TextChannel } from 'discord.js'

interface PluginOptions {
	deletePolls?: boolean
}

export default (client: Client, options: PluginOptions) => {
	const { deletePolls } = options

	client.on('raw', async (event) => {
		// Only listen to new message events
		if (!deletePolls || event.t !== 'MESSAGE_CREATE') {
			return
		}

		// Delete poll messages
		const { d: message } = event

		if (message.poll) {
			const channel = client.channels.cache.get(message.channel_id) as TextChannel
			channel?.messages.delete(message.id)
		}
	})
}
