import { ActivityType } from 'discord.js'

const statusArray = [
	'Coding with MrJAwesome',
	'Learning new things',
	'Watching MrJAwesome',
	'Practicing Robo.js',
	'Developing new features'
].map((content) => ({
	content,
	type: ActivityType.Watching,
	status: 'dnd'
}))

export default (client) => {
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
		console.error(error)
	}
}
