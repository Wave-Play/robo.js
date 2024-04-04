import { Command } from '../utils/cli-handler.js'
import fs from 'fs/promises'
import path from 'node:path'
import { logger } from '../../core/logger.js'
import { hasFilesRecursively } from '../utils/fs-helper.js'
import { color, composeColors } from '../../core/color.js'
import { loadConfig } from '../../core/config.js'
import { Flashcore, prepareFlashcore } from '../../core/flashcore.js'
import { FLASHCORE_KEYS, Indent } from '../../core/constants.js'
import { loadState } from '../../core/state.js'

const command = new Command('start')
	.description('Starts your bot in production mode.')
	.option('-h', '--help', 'Shows the available command options')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.handler(startAction)
export default command

interface StartCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function startAction(_args: string[], options: StartCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})

	// Set NODE_ENV to production if not already set
	if (!process.env.NODE_ENV) {
		process.env.NODE_ENV = 'production'
	}

	// Welcomeee
	const projectName = path.basename(process.cwd()).toLowerCase()
	logger.log('')
	logger.log(Indent, color.bold(`🚀 Starting ${color.cyan(projectName)} in ${color.cyan('production')} mode`))
	logger.log(Indent, '   Boop beep... Powering on your Robo creation! Need hosting? Check out RoboPlay!')
	logger.log('')

	// Check if .robo/build directory has .js files (recursively)
	if (!(await hasFilesRecursively(path.join('.robo', 'build')))) {
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
		await fs.access(path.join('.robo', 'manifest.json'))
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

	// Load state from Flashcore
	const stateStart = Date.now()
	const stateLoadPromise = new Promise<void>((resolve) => {
		async function load() {
			await prepareFlashcore()
			const state = await Flashcore.get<Record<string, unknown>>(FLASHCORE_KEYS.state)
			if (state) {
				loadState(state)
			}

			logger.debug(`State loaded in ${Date.now() - stateStart}ms`)
			resolve()
		}
		load()
	})

	// Imported dynamically to prevent multiple process hooks
	const { Robo } = await import('../../core/robo.js')

	// Start Roboooooooo!! :D
	Robo.start({
		stateLoad: stateLoadPromise
	})
}
