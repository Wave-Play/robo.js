import { User } from '../../events/_start.js'
import { logger } from 'robo.js'
import type { RoboRequest } from '@robojs/server'

interface QueryParams {
	limit?: string
}

export default async (request: RoboRequest) => {
	const { limit = '10' } = request.query as QueryParams

	const users = await User.find().limit(Number(limit))
	logger.info(`Users:`, users)

	return {
		data: users,
		success: true
	}
}
