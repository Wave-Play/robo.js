import type { MiddlewareConfig, MiddlewareData } from '@robojs/discordjs'
import { logger } from 'robo.js'

export const config: MiddlewareConfig = {
	order: 0
}

export default (data: MiddlewareData) => {
	logger.debug(`[${data.record.type}] ${data.record.key}`)
}
