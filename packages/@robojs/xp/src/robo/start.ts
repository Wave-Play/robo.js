import type { StartContext } from 'robo.js'
import type { PluginOptions } from '../types.js'
import { setGlobalConfig } from '../config.js'
import { logger } from 'robo.js'

export default async (context: StartContext<PluginOptions>) => {
	try {
		const options = context.pluginConfig

		if (options?.defaults) {
			await setGlobalConfig(options.defaults)
			logger.debug('Applied global XP defaults from plugin options')
		}
	} catch (error) {
		logger.error('Failed to apply XP plugin options:', error)
	}
}
