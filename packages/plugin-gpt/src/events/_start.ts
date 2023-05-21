import { init, type PluginOptions } from '../core.js'
import type { Client } from 'discord.js'

export default async (_client: Client, options: PluginOptions) => {
	if (!options?.openaiKey) {
		throw new Error('Missing "openaiKey" option in plugin config')
	}

	init(options)
}
