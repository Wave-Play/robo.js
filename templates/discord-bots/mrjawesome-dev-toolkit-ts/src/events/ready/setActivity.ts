import { ActivityType, Client } from 'discord.js'

/**
 * This event handler will be called when your Robo is logged in and ready.
 * You can get `client` from `robo.js` directly or as a parameter in `ready` events.
 *
 * Learn more about Discord events:
 * https://robojs.dev/discord-bots/events
 */
export default async (client: Client) => {
	client.user?.setActivity({
		name: '🌍 Using dev toolkit w/ Robo.js',
		type: ActivityType.Custom
		// url: 'https://www.twitch.tv/discord'
	})
}
