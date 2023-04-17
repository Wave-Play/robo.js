import { Command } from 'commander'
import { generateManifest } from '../../utils/manifest.js'
import { logger } from '../../../core/logger.js'
import { performance } from 'node:perf_hooks'
import { getProjectSize, printBuildSummary } from '../../utils/build-summary.js'

const command = new Command('plugin')
	.description('Builds your plugin for distribution.')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(pluginAction)
export default command

interface PluginCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function pluginAction(options: PluginCommandOptions) {
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).event(`Building Robo plugin...`)
	const startTime = performance.now()

	// Use SWC to compile into .robo/build
	const { compile } = await import('../../utils/compiler.js')
	const compileTime = await compile()
	logger.debug(`Compiled in ${Math.round(compileTime)}ms`)

	// Get the size of the entire current working directory
	const sizeStartTime = performance.now()
	const totalSize = await getProjectSize(process.cwd() + '/.robo')
	logger.debug(`Computed plugin size in ${Math.round(performance.now() - sizeStartTime)}ms`)

	// Generate manifest.json
	const manifestTime = performance.now()
	const manifest = await generateManifest()
	logger.debug(`Generated manifest in ${Math.round(performance.now() - manifestTime)}ms`)

	// Log commands and events from the manifest
	printBuildSummary(manifest, totalSize, startTime, true)
}
