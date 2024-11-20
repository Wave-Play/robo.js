import { logger } from '~/core/logger.js'
import { pluginOptions } from '../events/_start.js'

export default async () => {
	const { engine } = pluginOptions

	if (engine.isRunning()) {
		logger.debug('Draining connections...')
		await engine.stop()
	}
}
