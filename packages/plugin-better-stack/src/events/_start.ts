import { createLogtailDrain } from '../core/drain.js'
import { logger } from '@roboplay/robo.js'
import type { Client } from 'discord.js'

interface PluginConfig {
	sourceToken?: string
}

export default (_client: Client, config: PluginConfig) => {
	logger().setDrain(createLogtailDrain(config.sourceToken))
}
