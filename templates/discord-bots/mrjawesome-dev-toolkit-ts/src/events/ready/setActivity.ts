import { ActivityType, Client } from 'discord.js'

export default async (client: Client) => {
	client.user?.setActivity({
		name: '🌍 Using dev toolkit w/ Robo.js',
		type: ActivityType.Custom
		// url: 'https://www.twitch.tv/discord'
	})
}
