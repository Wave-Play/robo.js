import { ActivityType } from 'discord.js'
import { getClient } from '@robojs/discordjs'

/**
 * This event handler will be called when your Robo is logged in and ready.
 * You can get the client from `@robojs/discordjs` directly or as a parameter in `clientReady` events.
 *
 * Learn more about Discord events:
 * https://robojs.dev/discord-bots/events
 */
export default () => {
	getClient()?.user?.setActivity({
		name: '✨ Built with Robo.js',
		type: ActivityType.Custom,
		url: 'https://robojs.dev'
	})
}
