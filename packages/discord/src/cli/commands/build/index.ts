import { Command } from 'commander'
import { generateManifest, loadManifest } from '../../utils/manifest.js'
import { logger } from '../../../core/logger.js'
import { performance } from 'node:perf_hooks'
import { loadConfig } from '../../../core/config.js'
import { getProjectSize, printBuildSummary } from '../../utils/build-summary.js'
import plugin from './plugin.js'
import { findChangedCommands, registerCommands } from '../../utils/commands.js'
import { generateDefaults } from '../../utils/generate-defaults.js'

const command = new Command('build')
	.description('Builds your bot for production.')
	.option('-d --dev', 'build for development')
	.option('-f --force', 'force register commands')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(buildAction)
	.addCommand(plugin)
export default command

interface BuildCommandOptions {
	dev?: boolean
	force?: boolean
	silent?: boolean
	verbose?: boolean
}

async function buildAction(options: BuildCommandOptions) {
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Building Robo...`)
	const startTime = performance.now()
	const config = await loadConfig()
	if (!config) {
		logger.warn(`Could not find configuration file.`)
	}

	// Use SWC to compile into .robo/build
	const { compile } = await import('../../utils/compiler.js')
	const compileTime = await compile()
	logger.debug(`Compiled in ${Math.round(compileTime)}ms`)

	// Assign default commands and events
	const generatedFiles = await generateDefaults()

	// Get the size of the entire current working directory
	const sizeStartTime = performance.now()
	const totalSize = await getProjectSize(process.cwd())
	logger.debug(`Computed Robo size in ${Math.round(performance.now() - sizeStartTime)}ms`)

	// Generate manifest.json
	const oldManifest = await loadManifest()
	const manifestTime = performance.now()
	const manifest = await generateManifest(generatedFiles)
	logger.debug(`Generated manifest in ${Math.round(performance.now() - manifestTime)}ms`)

	// Log commands and events from the manifest
	printBuildSummary(manifest, totalSize, startTime, false)

	// Compare the old manifest with the new one and register any new commands
	const oldCommands = oldManifest.commands
	const newCommands = manifest.commands
	const addedCommands = Object.keys(newCommands).filter((key) => !(key in oldCommands))
	const removedCommands = Object.keys(oldCommands).filter((key) => !(key in newCommands))
	const changedCommands = findChangedCommands(oldCommands, newCommands)

	if (options.force) {
		logger.warn('Forcefully registering commands.')
	}
	if (options.force || addedCommands.length > 0 || removedCommands.length > 0 || changedCommands.length > 0) {
		await registerCommands(options.dev, newCommands, changedCommands, addedCommands, removedCommands)
	}
}
