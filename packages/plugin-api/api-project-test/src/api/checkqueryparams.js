import { Logger } from '@roboplay/robo.js'

export default async function CheckQueryParams(req, res) {
	const customLogger = new Logger({
		level: 'debug', // Set log level
		prefix: 'DiscordLogger', // Prefix For Logs
		maxEntries: 200 // Default: 100
	})
	let dataSet = [
		{
			name: 'Alex',
			age: 21,
			id: 5693
		}
	]

	const query = req.query

	customLogger.info(query)

	console.log('HELLOOOOOOOOOOOOOOOOOOO')

	const isUser = dataSet.filter((user) => user.id === parseInt(query.id, 10))
	if (isUser.length >= 1) {
		return res.code(200).send('User found !')
	} else {
		return res.code(404).send('User not found !')
	}
}
