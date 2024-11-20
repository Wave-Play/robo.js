import { logger } from '@roboplay/robo.js'
import { db } from '../../events/_start.js'
import type { RoboRequest } from '@roboplay/plugin-api'

export default async (request: RoboRequest) => {
	const { id } = request.params
	logger.info(`PUT /update/${id}`)

	const { data } = request.body
	const stmt = db.prepare(`UPDATE test SET data = ? WHERE id = ?`)
	const info = stmt.run(data, id)

	return { modified: info.changes }
}
