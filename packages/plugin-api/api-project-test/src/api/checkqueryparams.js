import { Logger, logger } from '@roboplay/robo.js'

export default async function CheckQueryParams(req, res) {
	let dataSet = [
		{
			name: 'Alex',
			age: 21,
			id: 5693
		}
	]

	const query = req.query

	logger.info(query)

	const isUser = dataSet.filter((user) => user.id === parseInt(query.id, 10))
	if (isUser.length >= 1) {
		return res.code(200).send('User found !')
	} else {
		return res.code(404).send('User not found !')
	}
}
