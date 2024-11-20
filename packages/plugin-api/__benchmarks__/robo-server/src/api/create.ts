import { db } from '../events/_start.js'
import { logger } from 'robo.js'
import type { RoboRequest } from '@roboplay/plugin-api'

export default async (request: RoboRequest) => {
	const { data } = request.body
	logger.info(`POST /create`)

	const stmt = db.prepare(`INSERT INTO test (data) VALUES (?)`)
	const info = stmt.run(data)

	return { id: info.lastInsertRowid }
}
