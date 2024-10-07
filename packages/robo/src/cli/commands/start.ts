import { Command } from '../utils/cli-handler.js'
import fs from 'fs/promises'
import path from 'node:path'
import { logger } from '../../core/logger.js'
import { hasFilesRecursively } from '../utils/fs-helper.js'
import { color, composeColors } from '../../core/color.js'
import { loadConfig } from '../../core/config.js'
import { loadEnv } from '../../core/dotenv.js'
import { Mode, setMode } from '../../core/mode.js'
import { Indent } from '../../core/constants.js'

const command = new Command('start')
	.description('Starts your bot in production mode.')
	.option('-m', '--mode', 'specify the mode(s) to run in (dev, beta, prod, etc...)')
	.option('-h', '--help', 'Shows the available command options')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.handler(startAction)
export default command

interface StartCommandOptions {
	mode?: string
	silent?: boolean
	verbose?: boolean
}

async function startAction(_args: string[], options: StartCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})
	logger.debug('CLI options:', options)

	// Set NODE_ENV if not already set
	if (!process.env.NODE_ENV) {
		process.env.NODE_ENV = 'production'
	}

	// Make sure environment variables are loaded
	const defaultMode = Mode.get()
	await loadEnv({ mode: defaultMode })

	// Handle mode(s)
	const { shardModes } = setMode(options.mode)

	if (shardModes) {
		return shardModes()
	}

	// Welcomeee
	const projectName = path.basename(process.cwd()).toLowerCase()
	logger.log('')
	logger.log(Indent, color.bold(`🚀 Starting ${color.cyan(projectName)} in ${Mode.color(Mode.get())} mode`))
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
			`The manifest file is missing. Make sure your project structure is correct and run ${composeColors(
				color.bold,
				color.cyan
			)('robo build')} again.`
		)
		process.exit(1)
	}

	// Experimental warning, except for the disableBot flag which is a special case
	const config = await loadConfig()
	const experimentalKeys = Object.entries(config.experimental ?? {})
		.filter(([, value]) => value)
		.map(([key]) => key)
		.filter((key) => key !== 'disableBot')

	if (experimentalKeys.length > 0) {
		const features = experimentalKeys.map((key) => color.bold(key)).join(', ')
		logger.warn(`Experimental flags enabled: ${features}.`)
	}

	// Start Roboooooooo!! :D (dynamic to avoid premature process hooks)
	const { Robo } = await import('../../core/robo.js')
	Robo.start({
		shard: !!config.experimental?.shard
	})
}
