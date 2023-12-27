import { logger } from '@roboplay/robo.js'
import { db } from '../../events/_start.js'
import type { RoboRequest } from '@roboplay/plugin-api'

export default async (request: RoboRequest) => {
	const { id } = request.params
	logger.info(`GET /read/${id}`)

	const stmt = db.prepare(`SELECT * FROM test WHERE id = ?`)
	const row = stmt.get(id)

	return row
}
