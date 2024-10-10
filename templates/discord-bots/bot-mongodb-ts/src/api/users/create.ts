import { User } from '../../events/_start.js'
import { logger } from 'robo.js'
import { RoboResponse } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'

interface RequestBody {
	name: string
	age?: number
	email?: string
}

export default async (request: RoboRequest) => {
	const { name, age, email } = (await request.json()) as RequestBody
	const newUser = new User({ name, email, age })
	await newUser.save()
	logger.info('New user created:', newUser)

	return RoboResponse.json(
		{
			data: { name, age, email },
			success: true
		},
		{
			status: 201
		}
	)
}
