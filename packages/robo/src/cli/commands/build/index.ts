import { Command } from 'commander'
import { generateManifest, loadManifest } from '../../utils/manifest.js'
import { logger as defaultLogger, Logger } from '../../../core/logger.js'
import { loadConfig } from '../../../core/config.js'
import { getProjectSize, printBuildSummary } from '../../utils/build-summary.js'
import plugin from './plugin.js'
import { findCommandDifferences, registerCommands } from '../../utils/commands.js'
import { generateDefaults } from '../../utils/generate-defaults.js'
import { compile } from '../../utils/compiler.js'
import type { LoggerOptions } from '../../../core/logger.js'

const command = new Command('build')
	.description('Builds your bot for production.')
	.argument('[files...]')
	.option('-d --dev', 'build for development')
	.option('-f --force', 'force register commands')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.option('-w --watch', 'watch for changes and rebuild')
	.action(buildAction)
	.addCommand(plugin)
export default command

interface BuildCommandOptions {
	dev?: boolean
	files?: string[]
	force?: boolean
	silent?: boolean
	verbose?: boolean
	watch?: boolean
}

export async function buildAction(files: string[], options: BuildCommandOptions) {
	const loggerOptions: LoggerOptions = {
		enabled: !options.silent,
		level: options.verbose ? 'debug' : options.dev ? 'warn' : 'info'
	}
	const logger = options.dev ? new Logger(loggerOptions) : defaultLogger(loggerOptions)
	logger.info(`Building Robo...`)
	logger.debug(`Current working directory:`, process.cwd())
	const startTime = Date.now()

	// Make sure the user isn't trying to watch builds
	// This only makes sense for plugins anyway
	if (options.watch) {
		logger.error(`Watch mode is only available for building plugins.`)
		process.exit(1)
	}

	// Load the configuration file
	const config = await loadConfig()
	if (!config) {
		logger.warn(`Could not find configuration file.`)
	}

	// Use SWC to compile into .robo/build
	const compileTime = await compile({ files })
	logger.debug(`Compiled in ${compileTime}ms`)

	// Assign default commands and events
	const generatedFiles = await generateDefaults()

	// Generate manifest.json
	const oldManifest = await loadManifest()
	const manifestTime = Date.now()
	const manifest = await generateManifest(generatedFiles, 'robo')
	logger.debug(`Generated manifest in ${Date.now() - manifestTime}ms`)

	if (!options.dev) {
		// Get the size of the entire current working directory
		const sizeStartTime = Date.now()
		const totalSize = await getProjectSize(process.cwd())
		logger.debug(`Computed Robo size in ${Date.now() - sizeStartTime}ms`)

		// Log commands and events from the manifest
		printBuildSummary(manifest, totalSize, startTime, false)
	}

	// Compare the old manifest with the new one
	const oldCommands = oldManifest.commands
	const newCommands = manifest.commands
	const addedCommands = findCommandDifferences(oldCommands, newCommands, 'added')
	const removedCommands = findCommandDifferences(oldCommands, newCommands, 'removed')
	const changedCommands = findCommandDifferences(oldCommands, newCommands, 'changed')
	const hasCommandChanges = addedCommands.length > 0 || removedCommands.length > 0 || changedCommands.length > 0

	// Do the same but for context commands
	const oldContextCommands = { ...(oldManifest.context?.message ?? {}), ...(oldManifest.context?.user ?? {}) }
	const newContextCommands = { ...manifest.context.message, ...manifest.context.user }
	const addedContextCommands = findCommandDifferences(oldContextCommands, newContextCommands, 'added')
	const removedContextCommands = findCommandDifferences(oldContextCommands, newContextCommands, 'removed')
	const changedContextCommands = findCommandDifferences(oldContextCommands, newContextCommands, 'changed')
	const hasContextCommandChanges =
		addedContextCommands.length > 0 || removedContextCommands.length > 0 || changedContextCommands.length > 0

	// Register command changes
	if (options.force) {
		logger.warn('Forcefully registering commands.')
	}
	if (options.force || hasCommandChanges || hasContextCommandChanges) {
		await registerCommands(
			options.dev,
			newCommands,
			manifest.context.message,
			manifest.context.user,
			changedCommands,
			addedCommands,
			removedCommands,
			changedContextCommands,
			addedContextCommands,
			removedContextCommands
		)
	}
}
