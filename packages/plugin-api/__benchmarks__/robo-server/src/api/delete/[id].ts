import { logger } from '@roboplay/robo.js'
import { db } from '../../events/_start.js'
import type { RoboRequest } from '@roboplay/plugin-api'

export default async (request: RoboRequest) => {
	const { id } = request.params
	logger.info(`DELETE /delete/${id}`)

	const stmt = db.prepare(`DELETE FROM test WHERE id = ?`)
	const info = stmt.run(id)

	return { deleted: info.changes }
}
