import { getClient } from '@robojs/discordjs'
import type { EventConfig } from '@robojs/discordjs'
//import { Robo } from 'robo.js'
import { ActivityType } from 'discord.js'

export const config: EventConfig = {
	frequency: 'once'
}

export default async () => {
	const client = getClient()
	client.user?.setActivity('tasks | !help', { type: ActivityType.Watching })
	//Robo.status.set('bot', 'Connected to Discord', { priority: 5 })
}
