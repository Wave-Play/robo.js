import { color, composeColors, Logger } from 'robo.js'
import type { Client } from 'discord.js'

const logger = new Logger({
	customLevels: {
		dev: {
			label: composeColors(color.dim, color.cyan)('dev  '),
			priority: 5
		}
	},
	enabled: true,
	level: 'debug'
})

interface DevtoolsConfig {
	monitorInterval?: number
	monitorResources?: boolean
}

export default (_client: Client, config: DevtoolsConfig) => {
	const { monitorInterval = 5_000, monitorResources } = config ?? {}
	const { cpuUsage, memoryUsage } = process

	// Check resource usage every minute if enabled
	if (monitorResources) {
		let lastCpuUsage = cpuUsage()

		setInterval(() => {
			const { heapUsed, external, arrayBuffers, rss } = memoryUsage()
			const { user, system } = cpuUsage(lastCpuUsage)
			const cpu = ((user + system) / 1000000).toFixed(2)
			const memory = (rss / (1024 * 1024)).toFixed(2)
			logger.custom('dev', `CPU: ${cpu}%, Memory: ${memory}MB - ${new Date().toLocaleString()}`)

			// Warn if the memory usage is over 250MB
			if (heapUsed + external + arrayBuffers > 250000000) {
				logger.warn(
					`Memory usage is over 250MB! - ${memory}MB - ${heapUsed} heap - ${external} external - ${arrayBuffers} array buffers`
				)
			}
			lastCpuUsage = cpuUsage()
		}, monitorInterval)
	}
}
