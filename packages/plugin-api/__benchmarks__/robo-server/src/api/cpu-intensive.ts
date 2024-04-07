import { logger } from 'robo.js'

export default async () => {
	logger.info(`POST /create`)

	let result = 0
	for (let i = 0; i < 1000000; i++) {
		result += Math.sqrt(i)
	}

	return { result }
}
