import type { PluginOptions } from '../types.js'
import { setGlobalConfig } from '../config.js'
import { getPluginOptions, logger } from 'robo.js'

export default async () => {
	try {
		const options = getPluginOptions<PluginOptions>('@robojs/xp')

		if (options?.defaults) {
			await setGlobalConfig(options.defaults)
			logger.debug('Applied global XP defaults from plugin options')
		}
	} catch (error) {
		logger.error('Failed to apply XP plugin options:', error)
	}
}
