import { color, composeColors } from '../../../core/color.js'
import { Command } from '../../utils/cli-handler.js'
import { logger } from '../../../core/logger.js'
import { getProjectSize } from '../../utils/build-summary.js'
import { buildAsync } from '../dev.js'
import path from 'node:path'
import { Env } from '../../../core/env.js'
import { Mode, resolveCliMode, setMode } from '../../../core/mode.js'
import { loadConfig, loadConfigPath } from '../../../core/config.js'
import Watcher from '../../utils/watcher.js'
import { Nanocore } from '../../../internal/nanocore.js'
import { discoverRoutes } from '../../utils/route-discovery.js'
import { scanAllRoutes } from '../../utils/route-scanner.js'
import { processAllRoutes } from '../../utils/route-processor.js'
import { ManifestGenerator, discoverProjectHooks, createHookEntries } from '../../utils/manifest-generator.js'
import { loadPluginData } from '../../utils/build-hooks.js'
import type { CliContext } from '../../../types/cli.js'
import type { PluginData } from '../../../types/common.js'
import type { RouteEntries, ProcessedEntry } from '../../../types/routes.js'

const command = new Command('plugin')
	.description('Builds your plugin for distribution.')
	.option('-d', '--dev', 'build for development')
	.option('-m', '--mode', 'specify the mode(s) to run in (dev, beta, prod, etc...)')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-w', '--watch', 'watch for changes and rebuild')
	.option('-h', '--help', 'Shows the available command options')
	.handler(pluginAction)
export default command

interface PluginCommandOptions {
	dev?: boolean
	mode?: string
	silent?: boolean
	verbose?: boolean
	watch?: boolean
}

async function pluginAction(context: CliContext) {
	const options = context.options as PluginCommandOptions
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : options.dev ? 'warn' : 'info'
	}).info(`Building Robo plugin...`)
	logger.debug('CLI options:', options)
	logger.debug(`Current working directory:`, process.cwd())

	// Set NODE_ENV if not already set
	if (!process.env.NODE_ENV) {
		process.env.NODE_ENV = options.dev ? 'development' : 'production'
	}

	// Make sure environment variables are loaded
	const defaultMode = Mode.get()
	const envMode = resolveCliMode(options.mode) ?? defaultMode
	await Env.load({ mode: envMode })

	// Handle mode(s)
	const { shardModes } = setMode(options.mode)

	if (shardModes) {
		logger.error(`Mode sharding is not available for builds.`)
		process.exit(1)
	}

	const startTime = Date.now()
	const config = await loadConfig('robo', true)

	// Run the Robo Compiler
	const { Compiler } = await import('../../utils/compiler.js')
	const compileTime = await Compiler.buildCode({
		excludePaths: config.excludePaths?.map((p) => p.replaceAll('/', path.sep)),
		plugin: true
	})
	logger.debug(`Compiled in ${compileTime}ms`)

	// Bundle files to seed (if available)
	await Compiler.buildSeed()

	// Generate manifest using the granular format
	const manifestTime = Date.now()
	const buildDir = config.experimental?.buildDirectory
		? path.join(process.cwd(), config.experimental.buildDirectory)
		: path.join(process.cwd(), '.robo', 'build')

	// Load dependent plugins from config (e.g., @robojs/discordjs)
	// This allows the plugin being built to use route definitions from its dependencies
	const dependentPlugins = loadPluginData(config)
	logger.debug(`Loaded ${dependentPlugins.size} dependent plugin(s) from config`)

	// Create a plugin data entry for self (the plugin being built)
	const pkg = await readPackageJson()
	const pluginName = pkg.name ?? 'unnamed-plugin'
	const selfPluginData: PluginData = {
		name: pluginName,
		version: pkg.version ?? '0.0.0',
		path: '.',
		namespace: inferNamespace(pluginName),
		hooks: [],
		seed: config.seed
			? {
					description: config.seed.description,
					env: config.seed.env,
					hook: config.seed.hook ? '/.robo/seed/__inline__/seed.js' : undefined
				}
			: undefined
	}

	// Combine dependent plugins with self - self goes last so its entries are processed
	const plugins = new Map<string, PluginData>(dependentPlugins)
	plugins.set(pluginName, selfPluginData)

	// Discover routes that this plugin provides
	const routes = await discoverRoutes(plugins)
	logger.debug(`Discovered ${routes.length} route(s) for plugin`)

	// Scan and process route entries from the plugin's build
	const scannedResults = await scanAllRoutes(routes, buildDir)
	const routeEntries = await processAllRoutes(scannedResults)

	// Discover hooks from the plugin's build
	const projectHooks = await discoverProjectHooks(buildDir)
	const hookEntries = createHookEntries(plugins, projectHooks, pluginName)

	// Generate granular manifest files
	const buildMode = options.dev ? 'development' : 'production'
	const manifestGenerator = new ManifestGenerator({
		mode: buildMode,
		config,
		routes,
		routeEntries,
		plugins,
		hookEntries,
		buildType: 'plugin',
		pluginName
	})
	await manifestGenerator.generateAll()
	logger.debug(`Generated manifest in ${Date.now() - manifestTime}ms`)

	if (!options.dev) {
		// Get the size of the entire current working directory
		const sizeStartTime = Date.now()
		const totalSize = await getProjectSize(process.cwd())
		logger.debug(`Computed plugin size in ${Date.now() - sizeStartTime}ms`)

		// Print plugin build summary from granular manifest
		await printPluginBuildSummary(routeEntries, totalSize, startTime, pluginName)
		logger.ready('Build complete!')
	}

	// Generate a watch file to indicate that the build was successful
	// This is used to determine whether or not to restart the Robo
	if (options.watch || options.dev) {
		await Nanocore.set('watch', { builtAt: Date.now(), status: 'built' })
	} else {
		await Nanocore.remove('watch')
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
				await buildAsync('robo build plugin --dev', config, options.verbose, [])
				logger.ready(`Successfully rebuilt in ${Date.now() - time}ms`)
			} finally {
				isUpdating = false
			}
		})
	} else if (!options.dev) {
		// Gracefully exit
		await logger.flush()
		process.exit(0)
	}
}

/**
 * Read package.json from current directory.
 */
async function readPackageJson(): Promise<Record<string, unknown>> {
	const fs = await import('node:fs/promises')
	try {
		const content = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf-8')
		return JSON.parse(content)
	} catch {
		return {}
	}
}

/**
 * Infer namespace from plugin name.
 */
function inferNamespace(pluginName: string): string {
	// Normalize path separators to forward slashes for Windows compatibility
	const normalizedName = pluginName.split(path.sep).join('/')

	// @robojs/discord → discord
	// @robojs/discordjs → discordjs
	// robo-plugin-analytics → analytics
	if (normalizedName.startsWith('@robojs/')) {
		return normalizedName.replace('@robojs/', '')
	}
	if (normalizedName.startsWith('robo-plugin-')) {
		return normalizedName.replace('robo-plugin-', '')
	}
	return normalizedName
}

/**
 * Print a build summary for plugin builds using the granular route entries.
 */
async function printPluginBuildSummary(
	routeEntries: RouteEntries,
	totalSize: number,
	startTime: number,
	pluginName: string
): Promise<void> {
	const entries: Array<{ type: string; name: string; description?: string; extra?: { parent?: string; type?: string } }> = []

	// Collect all entries from route entries
	for (const [namespace, routes] of Object.entries(routeEntries)) {
		for (const [routeName, handlers] of Object.entries(routes)) {
			for (const handler of handlers) {
				const metadata = handler.metadata as Record<string, unknown> | undefined

				if (routeName === 'commands') {
					// Determine command type
					let type = 'Command'
					if (handler.extra?.type === 'subcommand') {
						type = 'Subcommand'
					} else if (handler.extra?.type === 'subcommand-group') {
						type = 'Subcommand Group'
					}

					entries.push({
						type,
						name: `/${handler.key}`,
						description: metadata?.description as string | undefined,
						extra: handler.extra as { parent?: string; type?: string } | undefined
					})
				} else if (routeName === 'events') {
					entries.push({
						type: 'Event',
						name: handler.key,
						description: undefined
					})
				} else if (routeName === 'context') {
					entries.push({
						type: 'Context Menu',
						name: handler.key,
						description: metadata?.description as string | undefined
					})
				}
			}
		}
	}

	// Calculate column widths
	const maxTypeLength = Math.max(...entries.map((e) => e.type.length), 'Type'.length) + 4
	const maxNameLength = Math.max(...entries.map((e) => e.name.length), 'Name'.length, 15)

	// Print header
	const header = color.bold(
		`\n${'Type'.padEnd(maxTypeLength)}${'Name'.padEnd(maxNameLength + 1)}Description`
	)
	logger.log(header)
	logger.log('─'.repeat(maxTypeLength + maxNameLength + 20))

	// Print entries
	for (const entry of entries) {
		const typeColor = entry.type === 'Event' ? color.magenta : color.blue
		const typeText = composeColors(color.bold, typeColor)(entry.type.padEnd(maxTypeLength))
		const nameText = color.bold(entry.name.padEnd(maxNameLength + 1))
		const descText = entry.description || ''

		logger.log(`${typeText}${nameText}${descText}`)
	}

	// Format size
	let sizeText = ''
	if (totalSize < 1024 * 1024) {
		sizeText = `${(totalSize / 1024).toFixed(2)} kB`
	} else if (totalSize < 1024 * 1024 * 1024) {
		sizeText = `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
	} else {
		sizeText = `${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`
	}

	// Determine size color
	let sizeColor = color.green
	if (totalSize >= 1024 * 1024 * 1024) {
		sizeColor = composeColors(color.red)
	} else if (totalSize >= 500 * 1024 * 1024) {
		sizeColor = color.red
	} else if (totalSize >= 100 * 1024 * 1024) {
		sizeColor = color.yellow
	}

	// Print footer
	const buildTime = ((Date.now() - startTime) / 1000).toFixed(2)
	logger.log(color.bold(`\nPlugin size: `) + sizeColor(sizeText))
	logger.log(color.green(`Built in ${buildTime}s\n`))
}
