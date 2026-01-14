import { Command } from '../../utils/cli-handler.js'
import { startPhase, endPhase, PERF_ENABLED, finalize } from '../../utils/perf-metrics.js'
import { logger as defaultLogger, Logger } from '../../../core/logger.js'
import { loadConfig } from '../../../core/config.js'
import { getProjectSize, printBuildSummary } from '../../utils/build-summary.js'
import plugin from './plugin.js'
import path from 'node:path'
import { Env } from '../../../core/env.js'
import { Mode, resolveCliMode, setMode } from '../../../core/mode.js'
import { Compiler } from '../../utils/compiler.js'
import {
	executeBuildStartHooks,
	executeBuildTransformHooks,
	executeBuildCompleteHooks,
	loadPluginData
} from '../../utils/build-hooks.js'
import { discoverRoutes, validateRoutes } from '../../utils/route-discovery.js'
import { scanAllRoutes } from '../../utils/route-scanner.js'
import { processAllRoutes } from '../../utils/route-processor.js'
import { mergePluginManifests } from '../../utils/plugin-manifest-merger.js'
import { ManifestGenerator } from '../../utils/manifest-generator.js'
import { discoverAllHooks } from '../../utils/hook-discovery.js'
import { generateManifestTypes } from '../../utils/manifest-types.js'
import { generatePortalTypes, collectPluginRoutes, generateTypesIndex } from '../../codegen/portal-types.js'
import { RoboPaths } from '../../../core/paths.js'
import type { CliContext } from '../../../types/cli.js'
import type { LoggerOptions } from '../../../core/logger.js'
import type { RouteEntries } from '../../../types/routes.js'

const command = new Command('build')
	.description('Builds your Robo for production.')
	.option('-d', '--dev', 'build for development')
	.option('-m', '--mode', 'specify the mode(s) to run in (dev, beta, prod, etc...)')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-w', '--watch', 'watch for changes and rebuild')
	.option('-h', '--help', 'Shows the available command options')
	.handler(buildAction)
	.addCommand(plugin)
	.positionalArgs(true)
export default command

export interface BuildCommandOptions {
	dev?: boolean
	exit?: boolean
	files?: string[]
	mode?: string
	silent?: boolean
	verbose?: boolean
	watch?: boolean
}

export async function buildAction(context: CliContext) {
	const options = context.options as BuildCommandOptions
	const files = context.args

	const loggerOptions: LoggerOptions = {
		enabled: !options.silent,
		level: options.verbose ? 'debug' : options.dev ? 'warn' : 'info'
	}
	const logger = options.dev ? new Logger(loggerOptions) : defaultLogger(loggerOptions)
	logger.info(`Building Robo...`)
	logger.debug('CLI parameters:', files)
	logger.debug('CLI options:', options)
	logger.debug(`Current working directory:`, process.cwd())
	const startTime = Date.now()

	// Make sure the user isn't trying to watch builds
	// This only makes sense for plugins anyway
	if (options.watch) {
		logger.error(`Watch mode is only available for building plugins.`)
		process.exit(1)
	}

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

	// Load the configuration file
	startPhase('Config Loading')
	const config = await loadConfig('robo', true)

	if (!config) {
		logger.warn(`Could not find configuration file.`)
	}

	// Load plugin data for build hooks
	const plugins = loadPluginData(config)
	endPhase('Config Loading')

	// Determine build mode
	// Use custom mode from --mode flag if specified, otherwise fall back to dev/production
	const defaultBuildMode = options.dev ? 'development' : 'production'
	const buildMode = envMode ?? defaultBuildMode

	// Configure RoboPaths with custom build directory BEFORE running hooks
	// This ensures hooks receive correct context.paths.output
	RoboPaths.configure({ customBuildDir: config.experimental?.buildDirectory })

	// Execute build/start hooks
	// Create build store and execute start hooks
	const buildStore = await executeBuildStartHooks(plugins, config, buildMode)

	// Use the Robo Compiler to generate .robo/build/{mode}
	startPhase('Compilation')
	const compileTime = await Compiler.buildCode({
		customBuildDir: config.experimental?.buildDirectory,
		mode: buildMode,
		excludePaths: config.excludePaths?.map((p) => p.replaceAll('/', path.sep)),
		files: files
	})
	endPhase('Compilation')
	logger.debug(`Compiled in ${compileTime}ms`)

	// Discover and process routes for granular manifest (using mode-specific build directory)
	startPhase('Route Discovery')
	let routeEntries: RouteEntries = {}
	const routes = await discoverRoutes(plugins, buildMode)

	if (routes.length > 0) {
		// Validate routes for conflicts
		const routeErrors = validateRoutes(routes)
		if (routeErrors.length > 0) {
			for (const error of routeErrors) {
				logger.error(error)
			}
			throw new Error('Route validation failed')
		}

		// Scan and process routes (using mode-specific build directory)
		const buildDir = RoboPaths.build(buildMode)

		const scannedResults = await scanAllRoutes(routes, buildDir)
		routeEntries = await processAllRoutes(scannedResults)
	}
	endPhase('Route Discovery')

	// Merge plugin manifests into route entries
	// This reads each plugin's granular manifest and merges their commands, events, etc.
	routeEntries = await mergePluginManifests(plugins, routeEntries, buildMode)

	// Execute build/transform hooks (filter/transform entries)
	// Runs AFTER plugin merge so hooks can validate/transform ALL entries (project + plugins)
	routeEntries = await executeBuildTransformHooks(plugins, config, buildMode, buildStore, routeEntries)

	// Execute build/complete hooks with route entries
	const { metadataRegistry } = await executeBuildCompleteHooks(plugins, config, buildMode, buildStore, routeEntries)

	// Generate granular manifest
	startPhase('Manifest Generation')
	const granularStartTime = Date.now()

	// Discover all hooks from plugins and project (for manifest generation)
	const hookEntries = await discoverAllHooks(plugins)

	const manifestGenerator = new ManifestGenerator({
		mode: buildMode,
		config,
		routes,
		routeEntries,
		plugins,
		hookEntries
	})

	await manifestGenerator.generateAll(metadataRegistry)
	endPhase('Manifest Generation')

	// Generate manifest types
	startPhase('Type Generation')
	await generateManifestTypes({
		routes,
		routeEntries,
		hooks: hookEntries,
		plugins: Object.fromEntries(
			Array.from(plugins.entries()).map(([name, data]) => [
				name,
				{
					name,
					version: data.version ?? '0.0.0',
					path: data.path ?? `node_modules/${name}`,
					namespace: data.namespace ?? name.split(path.sep).join('/').replace('@robojs/', '').replace('robo-plugin-', ''),
					routes: routes.filter((r) => r.namespace === data.namespace).map((r) => r.name),
					hooks: Object.keys(hookEntries).filter((h) => hookEntries[h].some((e) => e.plugin === name))
				}
			])
		)
	})

	// Generate portal types (auto-typed portal access)
	const { isTypeScript } = Compiler.isTypescriptProject()
	const typesDir = path.join(process.cwd(), '.robo', 'types')
	const portalTypesPath = path.join(typesDir, 'portal.d.ts')

	// Build route definitions for portal type generation
	const routeDefinitions: Record<string, { routes: Record<string, { directory: string; multiple?: boolean; singular?: string }> }> = {}
	for (const route of routes) {
		if (!routeDefinitions[route.namespace]) {
			routeDefinitions[route.namespace] = { routes: {} }
		}
		routeDefinitions[route.namespace].routes[route.name] = {
			directory: route.directory,
			multiple: route.config?.multiple,
			singular: route.config?.singular
		}
	}

	// Collect plugin routes for type extraction
	const pluginRoutesInfo = Array.from(plugins.entries()).map(([name, data]) => ({
		name,
		path: data.path ?? path.join(process.cwd(), 'node_modules', name),
		namespace: data.namespace ?? name.split(path.sep).join('/').replace('@robojs/', '').replace('robo-plugin-', '')
	}))

	const pluginRoutes = await collectPluginRoutes(pluginRoutesInfo, routeDefinitions)
	await generatePortalTypes(pluginRoutes, portalTypesPath, isTypeScript)
	await generateTypesIndex(typesDir)
	endPhase('Type Generation')

	logger.debug(`Generated portal types at ${portalTypesPath}`)
	logger.debug(`Generated granular manifest in ${Date.now() - granularStartTime}ms`)

	if (!options.dev) {
		// Get the size of the entire current working directory
		const sizeStartTime = Date.now()
		const totalSize = await getProjectSize(process.cwd())
		logger.debug(`Computed Robo size in ${Date.now() - sizeStartTime}ms`)

		// Log build summary
		printBuildSummary(routeEntries, totalSize, startTime, false)
		logger.ready('Build complete!')
	}

	// Gracefully exit
	if (options.exit ?? !options.dev) {
		// Print perf metrics before exiting
		if (PERF_ENABLED) {
			await finalize()
		}
		await logger.flush()
		process.exit(0)
	}
}
