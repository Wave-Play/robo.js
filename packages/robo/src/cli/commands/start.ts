import { Command } from 'commander'
import fs from 'fs/promises'
import { logger } from '../../core/logger.js'
import { hasFilesRecursively } from '../utils/fs-helper.js'
import { color, composeColors } from '../../core/color.js'
import { loadConfig } from '../../core/config.js'

const command = new Command('start')
	.description('Starts your bot in production mode.')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(startAction)
export default command

interface StartCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function startAction(options: StartCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Starting Robo in ${color.bold('production mode')}...`)
	logger.warn(`Thank you for trying Robo.js! This is a pre-release version, so please let us know of issues on GitHub.`)

	// Check if .robo/build directory has .js files (recursively)
	if (!(await hasFilesRecursively('.robo/build'))) {
		logger.error(
			`No production build found. Make sure to compile your Robo using ${composeColors(
				color.bold,
				color.blue
			)('"robo build"')} first.`
		)
		process.exit(1)
	}

	// Check if .robo/manifest.json is missing
	try {
		await fs.access('.robo/manifest.json')
	} catch (err) {
		logger.error(
			`The ${color.bold(
				'.robo/manifest.json'
			)} file is missing. Make sure your project structure is correct and run ${composeColors(
				color.bold,
				color.blue
			)('"robo build"')} again.`
		)
		process.exit(1)
	}

	// Experimental warning
	const config = await loadConfig()
	const experimentalKeys = Object.entries(config.experimental ?? {})
		.filter(([, value]) => value)
		.map(([key]) => key)
	if (experimentalKeys.length > 0) {
		const features = experimentalKeys.map((key) => color.bold(key)).join(', ')
		logger.warn(`Experimental flags enabled: ${features}.`)
	}

	// Imported dynamically to prevent multiple process hooks
	const { Robo } = await import('../../core/robo.js')

	// Start Roboooooooo!! :D
	Robo.start()
}
