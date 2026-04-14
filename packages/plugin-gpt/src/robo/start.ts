import { init, type PluginOptions } from '../core.js'
import type { StartContext } from 'robo.js'

export default async (context: StartContext<PluginOptions>) => {
	if (!context.pluginConfig?.openaiKey) {
		throw new Error('Missing "openaiKey" option in plugin config')
	}

	init(context.pluginConfig)
}
