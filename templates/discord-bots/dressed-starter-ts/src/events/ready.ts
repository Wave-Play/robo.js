import { ActivityType } from 'discord.js'
import { getClient } from '@robojs/discordjs'

/**
 * This event handler will be called when your Robo is logged in and ready.
 * You can get `client` from `robo.js` directly or as a parameter in `ready` events.
 *
 * Learn more about Discord events:
 * https://robojs.dev/discord-bots/events
 */
export default () => {
	const client = getClient()
	client.user?.setActivity({
		name: '✨ Built with Robo.js',
		type: ActivityType.Custom,
		url: 'https://robojs.dev'
	})
}
