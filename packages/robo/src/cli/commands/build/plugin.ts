import { color } from '../../../core/color.js'
import { Command } from '../../utils/cli-handler.js'
import { generateManifest } from '../../utils/manifest.js'
import { logger } from '../../../core/logger.js'
import { getProjectSize, printBuildSummary } from '../../utils/build-summary.js'
import { buildAsync } from '../dev.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadConfig, loadConfigPath } from '../../../core/config.js'
import { hasProperties } from '../../utils/utils.js'
import Watcher from '../../utils/watcher.js'
import { buildPublicDirectory } from '../../utils/public.js'

const command = new Command('plugin')
	.description('Builds your plugin for distribution.')
	.option('-d', '--dev', 'build for development')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-w', '--watch', 'watch for changes and rebuild')
	.option('-h', '--help', 'Shows the available command options')
	.handler(pluginAction)
export default command

interface PluginCommandOptions {
	dev?: boolean
	silent?: boolean
	verbose?: boolean
	watch?: boolean
}

async function pluginAction(_args: string[], options: PluginCommandOptions) {
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : options.dev ? 'warn' : 'info'
	}).info(`Building Robo plugin...`)
	logger.debug(`Current working directory:`, process.cwd())
	const startTime = Date.now()
	const config = await loadConfig()

	// Use SWC to compile into .robo/build
	const { compile } = await import('../../utils/compiler.js')
	const compileTime = await compile({
		excludePaths: config.excludePaths?.map((p) => p.replaceAll('/', path.sep)),
		plugin: true
	})
	logger.debug(`Compiled in ${compileTime}ms`)

	// Generate manifest.json
	const manifestTime = Date.now()
	const manifest = await generateManifest({ commands: {}, context: {}, events: {} }, 'plugin')
	logger.debug(`Generated manifest in ${Date.now() - manifestTime}ms`)

	if (!options.dev) {
		// Build /public for production if available
		await buildPublicDirectory()

		// Get the size of the entire current working directory
		const sizeStartTime = Date.now()
		const totalSize = await getProjectSize(process.cwd())
		logger.debug(`Computed plugin size in ${Date.now() - sizeStartTime}ms`)

		// Log commands and events from the manifest
		printBuildSummary(manifest, totalSize, startTime, true)
	}

	// Generate a watch file to indicate that the build was successful
	// This is used to determine whether or not to restart the Robo
	if (options.watch || options.dev) {
		const watchFile = path.join(process.cwd(), '.robo', 'watch.mjs')
		const watchContents = `export default ${JSON.stringify(
			{
				updatedAt: Date.now()
			},
			null,
			'\t'
		)}`

		await fs.writeFile(watchFile, watchContents)
	} else {
		// Clean up watch file if it exists
		const watchFile = path.join(process.cwd(), '.robo', 'watch.mjs')

		try {
			const exists = await fs.stat(watchFile)
			if (exists.isFile()) {
				await fs.rm(watchFile)
			}
		} catch (e) {
			if (hasProperties<{ code: unknown }>(e, ['code']) && e.code !== 'ENOENT') {
				logger.warn(`Failed to clean up watch file! Please delete it manually at ${watchFile}`)
			}
		}
	}

	if (options.watch) {
		// Watch for changes in the "src" directory or config file
		const watchedPaths = ['src']
		const configPath = await loadConfigPath()
		let configRelative: string
		if (configPath) {
			configRelative = path.relative(process.cwd(), configPath)
			watchedPaths.push(configRelative)
		}

		const watcher = new Watcher(watchedPaths, {
			exclude: ['node_modules', '.git']
		})

		// Watch while preventing multiple restarts from happening at the same time
		let isUpdating = false
		logger.ready(`Watching for changes...`)

		watcher.start(async (changes) => {
			logger.debug(`Watcher events: ${changes.map((change) => change.changeType).join(', ')}`)
			if (isUpdating) {
				return logger.debug(`Already building, skipping...`)
			}
			isUpdating = true

			try {
				const configChange = changes.find((change) => change.filePath === configRelative)
				if (configChange) {
					const fileName = configChange.filePath.split('/').pop()
					logger.wait(`${color.bold(fileName)} file was updated. Rebuilding to apply configuration...`)
				} else {
					logger.wait(`Change detected. Rebuilding plugin...`)
				}

				const time = Date.now()
				await buildAsync('robo build plugin --dev', config, options?.verbose, [])
				logger.ready(`Successfully rebuilt in ${Date.now() - time}ms`)
			} finally {
				isUpdating = false
			}
		})
	} else if (!options.dev) {
		// Gracefully exit
		process.exit(0)
	}
}
