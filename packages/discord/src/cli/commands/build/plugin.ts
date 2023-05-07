import { Command } from 'commander'
import { generateManifest } from '../../utils/manifest.js'
import { logger } from '../../../core/logger.js'
import { performance } from 'node:perf_hooks'
import { getProjectSize, printBuildSummary } from '../../utils/build-summary.js'
import { buildInSeparateProcess } from '../dev.js'
import nodeWatch from 'node-watch'
import path from 'node:path'
import url from 'node:url'
import { loadConfigPath } from '../../../core/config.js'
import chalk from 'chalk'

const command = new Command('plugin')
	.description('Builds your plugin for distribution.')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.option('-w --watch', 'watch for changes and rebuild')
	.action(pluginAction)
export default command

interface PluginCommandOptions {
	silent?: boolean
	verbose?: boolean
	watch?: boolean
}

async function pluginAction() {
	// Extract options from parent due to commander not passing them down
	const options = command.parent.opts() as PluginCommandOptions
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Building Robo plugin...`)
	const startTime = performance.now()

	// Use SWC to compile into .robo/build
	const { compile } = await import('../../utils/compiler.js')
	const compileTime = await compile()
	logger.debug(`Compiled in ${Math.round(compileTime)}ms`)

	// Get the size of the entire current working directory
	const sizeStartTime = performance.now()
	const totalSize = await getProjectSize(process.cwd())
	logger.debug(`Computed plugin size in ${Math.round(performance.now() - sizeStartTime)}ms`)

	// Generate manifest.json
	const manifestTime = performance.now()
	const manifest = await generateManifest({ commands: {}, events: {} })
	logger.debug(`Generated manifest in ${Math.round(performance.now() - manifestTime)}ms`)

	// Log commands and events from the manifest
	printBuildSummary(manifest, totalSize, startTime, true)

	if (options.watch) {
		// Watch for changes in the "src" directory or config file
		const watchedPaths = ['src']
		const configPath = await loadConfigPath()
		let configRelative: string
		if (configPath) {
			configRelative = path.relative(process.cwd(), url.fileURLToPath(configPath))
			watchedPaths.push(configRelative)
		}

		const watcher = nodeWatch(watchedPaths, {
			recursive: true,
			filter: (f) => !/(^|[/\\])\.(?!config)[^.]/.test(f) // ignore dotfiles except .config and directories
		})

		// Watch while preventing multiple restarts from happening at the same time
		let isUpdating = false
		logger.ready(`Watching for changes...`)

		watcher.on('change', async (event: string, path: string) => {
			logger.debug(`Watcher event: ${event}`)
			if (isUpdating) {
				return logger.debug(`Already building, skipping...`)
			}
			isUpdating = true

			try {
				if (path === configRelative) {
					const fileName = path.split('/').pop()
					logger.wait(`${chalk.bold(fileName)} file was updated. Rebuilding to apply configuration...`)
				} else {
					logger.wait(`Change detected. Rebuilding plugin...`)
				}

				const time = performance.now()
				await buildInSeparateProcess('robo build plugin --silent')
				logger.ready(`Successfully rebuilt in ${Math.round(performance.now() - time)}ms`)
			} finally {
				isUpdating = false
			}
		})
	}
}
