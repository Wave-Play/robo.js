import { Command } from '../../utils/cli-handler.js'
import { generateManifest } from '../../utils/manifest.js'
import { logger as defaultLogger, Logger } from '../../../core/logger.js'
import { loadConfig } from '../../../core/config.js'
import { getProjectSize, printBuildSummary } from '../../utils/build-summary.js'
import plugin from './plugin.js'
import path from 'node:path'
import { Env } from '../../../core/env.js'
import { Mode, resolveCliMode, setMode } from '../../../core/mode.js'
import { findCommandDifferences, registerCommands } from '../../utils/commands.js'
import { generateDefaults } from '../../utils/generate-defaults.js'
import { Compiler } from '../../utils/compiler.js'
import { Flashcore } from '../../../core/flashcore.js'
import { bold } from '../../../core/color.js'
import { buildPublicDirectory } from '../../utils/public.js'
import { discordLogger, FLASHCORE_KEYS } from '../../../core/constants.js'
import {
	executeBuildStartHooks,
	executeBuildCompleteHooks,
	loadPluginData
} from '../../utils/build-hooks.js'
import { discoverRoutes, validateRoutes } from '../../utils/route-discovery.js'
import { scanAllRoutes } from '../../utils/route-scanner.js'
import { processAllRoutes } from '../../utils/route-processor.js'
import { ManifestGenerator, createHookEntries, discoverProjectHooks } from '../../utils/manifest-generator.js'
import { generateManifestTypes } from '../../utils/manifest-types.js'
import type { LoggerOptions } from '../../../core/logger.js'
import type { RouteEntries } from '../../../types/routes.js'

const command = new Command('build')
	.description('Builds your bot for production.')
	.option('-d', '--dev', 'build for development')
	.option('-f', '--force', 'force register commands')
	.option('-nr', '--no-register', 'skip automatic command registration')
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
	force?: boolean
	'no-register'?: boolean
	mode?: string
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
	logger.debug('CLI parameters:', files)
	logger.debug('CLI options:', options)
	logger.debug(`Current working directory:`, process.cwd())
	const startTime = Date.now()

	// Normalize the --no-register flag to a boolean registerFlag
	const registerFlag = !options['no-register']

	// Make sure the user isn't trying to watch builds
	// This only makes sense for plugins anyway
	if (options.watch) {
		logger.error(`Watch mode is only available for building plugins.`)
		process.exit(1)
	}

	// Set NODE_ENV if not already set
	if (!process.env.NODE_ENV) {
		// TODO: Generate different .manifest files for each mode, always keeping the default one
		// TODO: Also update `deploy` command for plugins to use correct manifest and update package.json files
		process.env.NODE_ENV = options.dev ? 'development' : 'production'
	}

	// Make sure environment variables are loaded
	const defaultMode = Mode.get()
	const envMode = resolveCliMode(options.mode) ?? defaultMode
	await Env.load({ mode: envMode })

	// Handle mode(s)
	const { shardModes } = setMode(options.mode)

	if (shardModes) {
		// TODO: Generate different .manifest files for each mode, always keeping the default one
		logger.error(`Mode sharding is not available for builds.`)
		process.exit(1)
	}

	// Load the configuration file
	const config = await loadConfig('robo', true)

	if (!config) {
		logger.warn(`Could not find configuration file.`)
	}

	// Load plugin data for build hooks
	const plugins = loadPluginData(config)

	// Initialize Flashcore to persist build error data
	await Flashcore.$init({ keyvOptions: config.flashcore?.keyv, namespaceSeparator: config.flashcore?.namespaceSeparator })

	// Determine build mode
	const buildMode = options.dev ? 'development' : 'production'

	// Execute build/start hooks
	await executeBuildStartHooks(plugins, config, buildMode)

	// Use the Robo Compiler to generate .robo/build
	const compileTime = await Compiler.buildCode({
		distDir: config.experimental?.buildDirectory,
		excludePaths: config.excludePaths?.map((p) => p.replaceAll('/', path.sep)),
		files: files
	})
	logger.debug(`Compiled in ${compileTime}ms`)

	// Assign default commands and events
	const generatedFiles = await generateDefaults(config.experimental?.buildDirectory)

	// Generate manifest.json (legacy)
	const oldManifest = await Compiler.useManifest({ safe: true })
	const manifestTime = Date.now()
	const manifest = await generateManifest(generatedFiles, 'robo', { config, mode: buildMode, plugins })
	logger.debug(`Generated manifest in ${Date.now() - manifestTime}ms`)

	// Discover and process routes for granular manifest
	let routeEntries: RouteEntries = {}
	const routes = await discoverRoutes(plugins)

	if (routes.length > 0) {
		// Validate routes for conflicts
		const routeErrors = validateRoutes(routes)
		if (routeErrors.length > 0) {
			for (const error of routeErrors) {
				logger.error(error)
			}
			throw new Error('Route validation failed')
		}

		// Scan and process routes
		const buildDir = config.experimental?.buildDirectory
			? path.join(process.cwd(), config.experimental.buildDirectory)
			: path.join(process.cwd(), '.robo', 'build')

		const scannedResults = await scanAllRoutes(routes, buildDir)
		routeEntries = await processAllRoutes(scannedResults)
	}

	// Execute build/complete hooks with route entries
	const { metadataRegistry } = await executeBuildCompleteHooks(plugins, config, buildMode, manifest, routeEntries)

	// Generate granular manifest (enabled by default)
	if (!config.experimental?.disableGranularManifest) {
		const granularStartTime = Date.now()

		// Discover project hooks from built files
		const buildDir = config.experimental?.buildDirectory
			? path.join(process.cwd(), config.experimental.buildDirectory)
			: path.join(process.cwd(), '.robo', 'build')
		const projectHooks = await discoverProjectHooks(buildDir)
		const hookEntries = createHookEntries(plugins, projectHooks)

		const manifestGenerator = new ManifestGenerator({
			mode: buildMode,
			config,
			routes,
			routeEntries,
			plugins,
			legacyManifest: manifest,
			hookEntries
		})

		await manifestGenerator.generateAll(metadataRegistry)

		// Generate manifest types
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
						namespace: data.namespace ?? name.replace('@robojs/', '').replace('robo-plugin-', ''),
						routes: routes.filter((r) => r.namespace === data.namespace).map((r) => r.name),
						hooks: Object.keys(hookEntries).filter((h) => hookEntries[h].some((e) => e.plugin === name))
					}
				])
			)
		})

		logger.debug(`Generated granular manifest in ${Date.now() - granularStartTime}ms`)
	}

	if (!options.dev) {
		// Build /public for production if available
		await buildPublicDirectory()

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

	// Determine if auto-registration is enabled
	const autoRegisterEnabled =
		registerFlag === false
			? false
			: config?.autoRegisterCommands === false
				? false
				: true

	// Register command changes
	const shouldRegister = autoRegisterEnabled && (options.force || hasCommandChanges || hasContextCommandChanges)

	// Provide feedback when auto-registration is disabled
	if (!autoRegisterEnabled && config.experimental?.disableBot !== true) {
		if (registerFlag === false) {
			logger.debug(`Command registration skipped due to ${bold('--no-register')} flag.`)
		} else {
			logger.debug(`Command registration skipped due to ${bold('autoRegisterCommands: false')} in config.`)
		}
		logger.debug(`Use the ${bold('registerSlashCommands()')} API for manual command registration.`)
	}

	if (config.experimental?.disableBot !== true && autoRegisterEnabled && options.force) {
		discordLogger.warn('Forcefully registering commands.')
	}

	if (config.experimental?.disableBot !== true && autoRegisterEnabled && shouldRegister) {
		await registerCommands(
			options.dev,
			options.force,
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
	} else if (config.experimental?.disableBot !== true && autoRegisterEnabled) {
		const hasPreviousError = await Flashcore.get<boolean>(FLASHCORE_KEYS.commandRegisterError)
		if (hasPreviousError) {
			discordLogger.warn(`Previous command registration failed. Run ${bold('robo build --force')} to try again.`)
		}
	}

	// Gracefully exit
	if (options.exit ?? !options.dev) {
		process.exit(0)
	}
}
