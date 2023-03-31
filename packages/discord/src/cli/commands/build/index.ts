import { Command } from 'commander'
import { generateManifest } from '../../utils/manifest.js'
import { logger } from '../../utils/logger.js'
import { performance } from 'node:perf_hooks'
import { loadConfig } from '../../utils/config.js'
import { getProjectSize, printBuildSummary } from '../../utils/build-summary.js'
import plugin from './plugin.js'

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
	}).event(`Building Robo...`)
	const startTime = performance.now()
	const config = await loadConfig()
	if (!config) {
		logger.warn(`Could not find configuration file.`)
	}

	// Use SWC to compile into .robo/build
	const { compile } = await import('../../../core/compiler.js')
	const compileTime = await compile({
		defaultHelp: config?.defaults?.help ?? true
	})
	logger.debug(`Compiled in ${Math.round(compileTime)}ms`)

	// Get the size of the entire current working directory
	const sizeStartTime = performance.now()
	const totalSize = await getProjectSize(process.cwd())
	logger.debug(`Computed Robo size in ${Math.round(performance.now() - sizeStartTime)}ms`)

	// Generate manifest.json
	const manifestTime = performance.now()
	const manifest = await generateManifest(options.dev, options.force, false)
	logger.debug(`Generated manifest in ${Math.round(performance.now() - manifestTime)}ms`)

	// Log commands and events from the manifest
	printBuildSummary(manifest, totalSize, startTime, false)
}
