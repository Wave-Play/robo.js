import { ActivityType } from 'discord.js'

export default (client) => {
	client.user?.setActivity({
		name: 'Baking treats',
		type: ActivityType.Custom
	})
}
