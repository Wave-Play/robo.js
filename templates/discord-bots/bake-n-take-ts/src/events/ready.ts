import { ActivityType, Client } from 'discord.js'

export default (client: Client) => {
	client.user?.setActivity({
		name: 'Baking treats',
		type: ActivityType.Custom
	})
}
