import { ActivityType } from 'discord.js'
import { client, logger } from 'robo.js'

const statusArray = [
	'Coding with MrJAwesome',
	'Learning new things',
	'Watching MrJAwesome',
	'Practicing Robo.js',
	'Developing new features'
].map((content) => ({
	content,
	type: ActivityType.Watching,
	status: 'dnd' as const
}))

/**
 * This event handler will be called when your Robo is logged in and ready.
 * You can get `client` from `robo.js` directly or as a parameter in `ready` events.
 *
 * Learn more about Discord events:
 * https://robojs.dev/discord-bots/events
 */
export default () => {
	const option = Math.floor(Math.random() * statusArray.length)

	try {
		client.user?.setPresence({
			activities: [
				{
					name: statusArray[option].content,
					type: statusArray[option].type
				}
			],
			status: statusArray[option].status
		})
	} catch (error) {
		logger.error(error)
	}
}
