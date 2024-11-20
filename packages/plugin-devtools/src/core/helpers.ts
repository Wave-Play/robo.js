import { color, composeColors, Logger } from 'robo.js'

export let logger: Logger = new Logger({
	customLevels: {
		dev: {
			label: composeColors(color.dim, color.cyan)('dev  '),
			priority: 1
		}
	},
	level: 'dev'
})

export function updateLogger(level: string) {
	logger = new Logger({
		customLevels: {
			dev: {
				label: composeColors(color.dim, color.cyan)('dev  '),
				priority: 1
			}
		},
		level: level ?? 'dev'
	})
}
