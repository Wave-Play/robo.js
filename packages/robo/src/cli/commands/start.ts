import { Command } from '../utils/cli-handler.js'
import { startPhase, endPhase } from '../utils/perf-metrics.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { logger, LogLevel } from '../../core/logger.js'
import { hasFilesRecursively } from '../utils/fs-helper.js'
import { color, composeColors } from '../../core/color.js'
import { loadConfig } from '../../core/config.js'
import { Env } from '../../core/env.js'
import { Mode, resolveCliMode, setMode } from '../../core/mode.js'
import { Indent } from '../../core/constants.js'
import { Boot } from '../../internal/boot.js'
import { RoboPaths } from '../../core/paths.js'
import type { CliContext } from '../../types/cli.js'

const command = new Command('start')
	.description('Starts your Robo in production mode.')
	.option('-id', '--instance-id', 'specify the instance ID to use')
	.option('-l', '--log-level', 'specify the log level to use (debug, info, warn, error)')
	.option('-m', '--mode', 'specify the mode(s) to run in (dev, beta, prod, etc...)')
	.option('-h', '--help', 'Shows the available command options')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.handler(startAction)
export default command

interface StartCommandOptions {
	['instance-id']?: string
	['log-level']?: LogLevel
	mode?: string
	silent?: boolean
	verbose?: boolean
}

async function startAction(context: CliContext) {
	const options = context.options as StartCommandOptions

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

	// Got an instance ID? Use it
	if (options['instance-id']) {
		process.env.ROBO_INSTANCE_ID = options['instance-id']
	}

	// Make sure environment variables are loaded
	const defaultMode = Mode.get()
	const envMode = resolveCliMode(options.mode) ?? defaultMode
	await Env.load({ mode: envMode })

	// Handle mode(s)
	const { shardModes } = setMode(options.mode)

	if (shardModes) {
		return shardModes()
	}

	// Welcomeee
	const projectName = path.basename(process.cwd()).toLowerCase()
	const bootMessage = await Boot.getRandom('start')
	logger.log('')
	logger.log(Indent, color.bold(`🚀 Starting ${color.cyan(projectName)} in ${Mode.color(Mode.get())} mode`))
	logger.log(Indent, '  ', bootMessage.content)
	logger.log('')

	// Check if granular manifest is missing
	const manifestPath = path.join('.robo', 'manifest', envMode, 'robo.json')
	try {
		await fs.stat(manifestPath)
	} catch (err) {
		logger.error(
			`The manifest file is missing. Make sure your project structure is correct and run ${composeColors(
				color.bold,
				color.cyan
			)('robo build')} again.`
		)
		process.exit(1)
	}

	// Experimental warning
	startPhase('Config Loading')
	const config = await loadConfig()
	const experimentalKeys = Object.entries(config.experimental ?? {})
		.filter(([, value]) => value)
		.map(([key]) => key)

	if (experimentalKeys.length > 0) {
		const features = experimentalKeys.map((key) => color.bold(key)).join(', ')
		logger.warn(`Experimental flags enabled: ${features}.`)
	}

	// Configure RoboPaths with custom build directory if specified
	RoboPaths.configure({ customBuildDir: config.experimental?.buildDirectory })
	endPhase('Config Loading')

	// Get mode-specific build directory
	const buildDirectory = RoboPaths.build(envMode)

	// Check if .robo/build/{mode} directory has .js files (recursively)
	if (!(await hasFilesRecursively(buildDirectory))) {
		logger.error(
			`No production build found for mode "${envMode}". Make sure to compile your Robo using ${composeColors(
				color.bold,
				color.blue
			)('"robo build"')} first.`
		)
		process.exit(1)
	}

	// Handle graceful shutdown on Ctrl+C
	process.on('SIGINT', async () => {
		const { Robo } = await import('../../core/robo.js')
		await Robo.stop()
	})

	// Start Roboooooooo!! :D (dynamic to avoid premature process hooks)
	startPhase('Robo Start')
	const { Robo } = await import('../../core/robo.js')
	await Robo.start({
		logLevel: options['log-level']
	})
	endPhase('Robo Start')
}
