import { Command } from '../utils/cli-handler.js'
import { startPhase, endPhase, PERF_ENABLED, finalize } from '../utils/perf-metrics.js'
import { spawn } from 'child_process'
import { logger, LogLevel } from '../../core/logger.js'
import { DEFAULT_CONFIG, FLASHCORE_KEYS, HighlightGreen, Indent } from '../../core/constants.js'
import { getConfigPaths, loadConfig, loadConfigPath } from '../../core/config.js'
import { IS_WINDOWS, filterExistingPaths, getWatchedPlugins, packageJson, timeout } from '../utils/utils.js'
import path from 'node:path'
import Watcher, { Change } from '../utils/watcher.js'
import { color, composeColors } from '../../core/color.js'
import { Spirits } from '../utils/spirits.js'
import * as interactiveCli from '../utils/interactive-cli.js'
import { Highlight } from '../../core/constants.js'
import { Flashcore } from '../../core/flashcore.js'
import { getPackageExecutor, getPackageManager } from '../utils/runtime-utils.js'
import { Mode, resolveCliMode, setMode } from '../../core/mode.js'
import { Env } from '../../core/env.js'
import { Boot } from '../../internal/boot.js'
import { Nanocore } from '../../internal/nanocore.js'
import {
	detectRouteChanges,
	getNonHandlerChanges,
	getRestartRequiredChanges,
	getUniqueRoutes,
	mapFileToRoute,
	type HmrMapping
} from '../utils/hmr-mapper.js'
import { toBuildPath, reindexEntries, type ManifestEntry } from '../utils/hmr-manifest.js'
import {
	buildInitialGraph,
	updateGraphForFiles,
	getImpactedHandlers,
	hasAffectedDynamicImports,
	getGraphStats,
	getTraversalMetrics,
	removeModule,
	MAX_TRAVERSAL_NODES,
	type DependencyGraph
} from '../utils/hmr-graph.js'
import { linkModules } from '../utils/hmr-linker.js'
import type { CliContext } from '../../types/cli.js'
import type { Config, SpiritMessage } from '../../types/index.js'
import type { RouteDefinitions } from '../../types/manifest-v1.js'

/**
 * Enable verbose HMR debug output with timing metrics.
 * Set ROBO_HMR_DEBUG=1 or ROBO_HMR_DEBUG=true to enable.
 */
const HMR_DEBUG = process.env.ROBO_HMR_DEBUG === '1' || process.env.ROBO_HMR_DEBUG === 'true'

const command = new Command('dev')
	.description('Ready, set, code your Robo to life! Starts development mode.')
	.option('-h', '--help', 'Shows the available command options')
	.option('-H', '--hmr', 'Enable hot module replacement for handlers (experimental)')
	.option('-id', '--instance-id', 'specify the instance ID to use')
	.option('-l', '--log-level', 'specify the log level to use (debug, info, warn, error)')
	.option('-m', '--mode', 'specify the mode(s) to run in (dev, beta, prod, etc...)')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.handler(devAction)
export default command

interface DevCommandOptions {
	hmr?: boolean
	['instance-id']?: string
	['log-level']?: LogLevel
	mode?: string
	silent?: boolean
	verbose?: boolean
}

let spirits: Spirits | undefined

async function devAction(context: CliContext) {
	// Mark that we're running via robo dev (before any env loading)
	process.env.ROBO_DEV = 'true'

	const options = context.options as DevCommandOptions
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})
	logger.debug('CLI options:', options)
	logger.debug(`Package manager:`, getPackageManager())
	logger.debug(`Robo.js version:`, packageJson.version)
	logger.debug(`Current working directory:`, process.cwd())

	// Set NODE_ENV if not already set
	if (!process.env.NODE_ENV) {
		process.env.NODE_ENV = 'development'
	}

	// Make sure environment variables are loaded for CLI
	const defaultMode = Mode.get()
	const envMode = resolveCliMode(options.mode) ?? defaultMode
	await Env.load({ mode: envMode })

	// Got an instance ID? Use it
	if (options['instance-id']) {
		process.env.ROBO_INSTANCE_ID = options['instance-id']
		Env.data().ROBO_INSTANCE_ID = options['instance-id']
	}

	// Enable HMR environment variable for cleanup API
	if (options.hmr) {
		process.env.ROBO_HMR = 'true'
	}

	// Handle mode(s)
	const { shardModes } = setMode(options.mode)

	if (shardModes) {
		return shardModes()
	}

	// Welcomeee
	const projectName = path.basename(process.cwd()).toLowerCase()
	const bootMessage = await Boot.getRandom('dev')
	logger.log('')
	logger.log(Indent, color.bold(`🚀 Starting ${color.cyan(projectName)} in ${Mode.color(Mode.get())} mode`))
	logger.log(Indent, '  ', bootMessage.content)
	logger.log('')

	// Load the configuration before anything else
	const config = await loadConfig('robo', true)
	const configPath = await loadConfigPath()
	let configRelative: string

	if (configPath) {
		configRelative = path.relative(process.cwd(), configPath)
	} else {
		logger.error(`Could not find configuration file. Please make sure ${color.bold('/config/robo.mjs')} exists.`)
		process.exit(1)
	}

	// Experimental warning
	const experimentalKeys = Object.entries(config.experimental ?? {})
		.filter(([, value]) => value)
		.map(([key]) => key)

	if (experimentalKeys.length > 0) {
		const features = experimentalKeys.map((key) => color.bold(key)).join(', ')
		logger.warn(`Experimental flags enabled: ${features}.`)
	}

	// Declare variables early to avoid TDZ issues in closures registered before these lines execute
	let buildSuccess = false
	let isUpdating = false

	// Define shutdown callback before interactive CLI needs it
	let isStopping = false
	const callback = async (_signal: NodeJS.Signals) => {
		if (isStopping) {
			return
		}
		isStopping = true

		try {
			await spirits?.stopAll()
		} catch (err) {
			logger.debug('Spirit cleanup error:', err)
		}
		try {
			await interactiveCli.stop()
		} catch {
			// Terminal cleanup is best-effort
		}

		// Ensure stdout/stderr are fully flushed before exiting
		// This prevents logs from appearing after the terminal prompt
		await Promise.race([
			new Promise<void>((resolve) => {
				if (process.stdout.write('')) {
					resolve()
				} else {
					process.stdout.once('drain', resolve)
				}
			}),
			new Promise<void>((resolve) => setTimeout(resolve, 2000))
		])

		process.exit(0)
	}

	// Create the dev runtime provider — wraps Spirit IPC for state, direct import for Flashcore.
	// Uses getters since both `spirits` and `roboSpirit` are set after provider creation.
	const { createDevProvider } = await import('../utils/cli-runtime-provider.js')
	let roboSpirit: string
	const runtimeProvider = createDevProvider(() => spirits, () => roboSpirit)

	// Start interactive CLI (no-op in non-TTY environments)
	interactiveCli.start({
		config,
		runtime: runtimeProvider,
		onExit: () => callback('SIGINT')
	})
	interactiveCli.setStatus('building')

	// Register lazy-loaded interactive commands
	const { getInteractiveCommands } = await import('./interactive/index.js')
	const { registerLazy } = await import('../utils/cli-commands.js')
	for (const cmd of getInteractiveCommands()) {
		registerLazy(cmd)
	}

	// Register dev-specific interactive commands early so they're available during initial build
	interactiveCli.registerCommand({
		name: 'restart',
		description: 'Full rebuild and restart',
		handler: async () => {
			if (isUpdating) {
				process.stdout.write('A rebuild is already in progress...\n')
				return
			}
			if (!roboSpirit && !buildSuccess) {
				process.stdout.write('No running Robo to restart. Waiting for a successful build...\n')
				return
			}
			isUpdating = true
			interactiveCli.setStatus('restarting')
			try {
				logger.wait('Restarting Robo...')
				spirits.off(roboSpirit, restartCallback)
				roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, [])
				spirits.on(roboSpirit, restartCallback)
			} finally {
				interactiveCli.setStatus(roboSpirit ? 'ready' : 'error')
				isUpdating = false
			}
		}
	})

	// Helper to load and register terminal commands from manifest
	const loadTerminalCommands = async () => {
		try {
			const { loadTerminalManifest, buildTerminalCommands } = await import('../utils/cli-loader.js')
			const { registerTerminal } = await import('../utils/cli-commands.js')
			const terminal = await loadTerminalManifest()
			if (terminal) {
				const cmds = buildTerminalCommands(terminal, { config, runtime: runtimeProvider })
				for (const cmd of cmds) {
					registerTerminal(cmd)
				}
			}
		} catch (error) {
			logger.debug('Failed to load terminal commands:', error)
		}
	}

	// Ensure worker spirits are ready
	spirits = new Spirits(3, interactiveCli.getOutputCallback())

	// Stop spirits on process exit
	process.on('SIGINT', () => callback('SIGINT'))
	process.on('SIGTERM', () => callback('SIGTERM'))

	// Run first build
	startPhase('Initial Build')
	buildSuccess = false
	try {
		const start = Date.now()
		// Lazy import buildAction to avoid loading build module at CLI startup
		const { buildAction } = await import('./build/index.js')
		await buildAction({
			args: [],
			options: {
				dev: true,
				verbose: options.verbose
			}
		} as unknown as CliContext)
		logger.debug(`Build completed in ${Date.now() - start}ms`)
		buildSuccess = true
	} catch (error) {
		logger.error(error)
	}
	endPhase('Initial Build')

	// These callbacks are necessary to ensure "/dev restart" works
	const restartCallback = async (message: SpiritMessage) => {
		if (message.event === 'restart' && message.payload === 'trigger') {
			logger.wait(`Restarting Robo...`)
			spirits.off(roboSpirit, restartCallback)
			roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, [])
			spirits.on(roboSpirit, restartCallback)
		}
	}

	// Get state saved to disk as the default
	startPhase('Flashcore Init')
	const stateStart = Date.now()
	await Flashcore.$init({ keyvOptions: config.flashcore?.keyv, namespaceSeparator: config.flashcore?.namespaceSeparator })
	const persistedState = (await Flashcore.get<Record<string, unknown>>(FLASHCORE_KEYS.state)) ?? {}
	logger.debug(`State loaded in ${Date.now() - stateStart}ms`)
	endPhase('Flashcore Init')

	// Start the Robo!
	startPhase('Spirit Startup')
	if (buildSuccess) {
		roboSpirit = await spirits.newTask<string>({
			event: 'start',
			logLevel: options['log-level'],
			onExit: (exitCode: number) => {
				if (exitCode !== 0) {
					logger.error(
						composeColors(
							color.bgBlack,
							color.redBright,
							color.underline,
							color.bold
						)(`Robo exited with code ${exitCode}`)
					)
					return false
				}
			},
			onRetry: (value: string) => {
				roboSpirit = value
				spirits.on(roboSpirit, restartCallback)
				spirits.send(roboSpirit, { event: 'set-state', state: persistedState })
			}
		})
		spirits.on(roboSpirit, restartCallback)
		spirits.send(roboSpirit, { event: 'set-state', state: persistedState })
	} else {
		const id = String(process.env.ROBO_INSTANCE_ID ?? process.pid)
		await Nanocore.update('watch', { id, status: 'attention' })
		logger.wait(`Build failed! Waiting for changes before retrying...`)
	}
	endPhase('Spirit Startup')
	interactiveCli.setStatus(buildSuccess ? 'ready' : 'error')

	// Load terminal commands from manifest (file-based convention system)
	if (buildSuccess) {
		await loadTerminalCommands()
	}

	// Watch for changes in the "src" directory alongside special files
	const watchedPaths = ['src']
	const ignoredPaths = ['node_modules', '.git', ...(config.watcher?.ignore ?? [])]
	const additionalFiles = await filterExistingPaths(['.env', 'tsconfig.json'])
	watchedPaths.push(...additionalFiles)

	// Watch all plugins that are also currently in development mode, along with their config files
	const watchedPlugins = await getWatchedPlugins(config)
	Object.keys(watchedPlugins).forEach((pluginPath) => watchedPaths.push(pluginPath))
	getConfigPaths().forEach((configPath) => watchedPaths.push(path.relative(process.cwd(), configPath)))

	// Watch while preventing multiple restarts from happening at the same time
	logger.debug(`Watching:`, watchedPaths)
	logger.debug(`Ignoring paths:`, ignoredPaths)
	const watcher = new Watcher(watchedPaths, { exclude: ignoredPaths })
	let rebuildCount = 0

	// HMR mode setup
	const hmrEnabled = options.hmr ?? false
	let routeDefinitions: RouteDefinitions | undefined
	let dependencyGraph: DependencyGraph | undefined

	const tryLoadRouteDefinitions = async (): Promise<RouteDefinitions | undefined> => {
		try {
			const manifestPath = path.join(process.cwd(), '.robo', 'manifest', Mode.get(), 'routes', '@.json')
			const fs = await import('node:fs/promises')
			const content = await fs.readFile(manifestPath, 'utf-8')
			return JSON.parse(content) as RouteDefinitions
		} catch {
			return undefined
		}
	}

	if (hmrEnabled) {
		logger.debug(color.cyan('[HMR]'), 'Hot module replacement enabled for handlers')

		// Load route definitions for HMR mapping
		routeDefinitions = await tryLoadRouteDefinitions()
		if (routeDefinitions) {
			// Build initial dependency graph for utility change tracking
			dependencyGraph = buildInitialGraph(Mode.get(), routeDefinitions)
			const stats = getGraphStats(dependencyGraph)
			if (HMR_DEBUG) {
				logger.debug(
					`[HMR] Dependency graph: ${stats.moduleCount} modules, ${stats.edgeCount} edges, ` +
					`depth=${stats.maxChainDepth}, avg=${stats.avgDepsPerModule} deps/module`
				)
			} else {
				logger.debug(`[HMR] Dependency graph: ${stats.moduleCount} modules, ${stats.edgeCount} edges`)
			}
		} else {
			logger.warn('[HMR] Could not load route definitions; HMR will fall back to full restarts until available')
		}
	}

	// Print startup perf report before entering watch mode
	if (PERF_ENABLED) {
		await finalize()
	}

	watcher.start(async (changes) => {
		logger.debug('Watcher events:', changes)
		if (isUpdating) {
			return logger.debug(`Already updating, skipping...`)
		}
		isUpdating = true
		rebuildCount++
		interactiveCli.setStatus('building')

		// Track rebuild cycle for performance metrics
		const rebuildPhaseName = `Rebuild #${rebuildCount}`
		startPhase(rebuildPhaseName)

		try {
			const configChange = changes.find((change) => change.filePath === configRelative)
			const pluginChange = changes.find((change) => Object.keys(watchedPlugins).includes(change.filePath))

			// Always do full restart for config/plugin changes
			if (configChange) {
				const fileName = configChange.filePath.split('/').pop()
				logger.wait(`${color.bold(fileName)} file was updated. Restarting to apply configuration...`)
				roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, changes)
				spirits.on(roboSpirit, restartCallback)
			} else if (pluginChange) {
				const plugin = watchedPlugins[pluginChange.filePath]
				logger.wait(`${color.bold(plugin.name)} plugin was updated. Restarting to apply changes...`)
				roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, changes)
				spirits.on(roboSpirit, restartCallback)
			} else if (hmrEnabled && roboSpirit) {
				// If route definitions weren't available at startup, try to load them now.
				// Without route definitions, HMR mapping can't safely identify handlers.
				if (!routeDefinitions) {
					routeDefinitions = await tryLoadRouteDefinitions()
					if (routeDefinitions) {
						dependencyGraph = buildInitialGraph(Mode.get(), routeDefinitions)
						const stats = getGraphStats(dependencyGraph)
						if (HMR_DEBUG) {
							logger.debug(
								`[HMR] Loaded route definitions; dependency graph: ${stats.moduleCount} modules, ` +
								`${stats.edgeCount} edges, depth=${stats.maxChainDepth}, avg=${stats.avgDepsPerModule} deps/module`
							)
						} else {
							logger.debug(`[HMR] Loaded route definitions; dependency graph: ${stats.moduleCount} modules, ${stats.edgeCount} edges`)
						}
					}
				}

				if (!routeDefinitions) {
					logger.wait(`[HMR] Route definitions unavailable. Falling back to full restart...`)
					roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, changes)
					spirits.on(roboSpirit, restartCallback)
					return
				}

				// Try HMR for handler changes
				const hmrResult = await handleHmrChanges(
					changes,
					roboSpirit,
					config,
					options.verbose,
					routeDefinitions,
					dependencyGraph
				)

				if (!hmrResult.success) {
					// Fall back to full restart
					logger.wait(`[HMR] Falling back to full restart...`)
					roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, changes)
					spirits.on(roboSpirit, restartCallback)
				}
			} else {
				// Non-HMR mode or no spirit - do full restart
				logger.wait(`Change detected. Restarting Robo...`)
				roboSpirit = await rebuildRobo(roboSpirit, config, options.verbose, changes)
				spirits.on(roboSpirit, restartCallback)
			}
		} finally {
			endPhase(rebuildPhaseName)
			interactiveCli.setStatus(roboSpirit ? 'ready' : 'error')

			// Re-register terminal commands (manifest may have changed)
			if (roboSpirit) {
				const { clearTerminalCommands } = await import('../utils/cli-commands.js')
				const { clearCliManifestCache } = await import('../utils/cli-loader.js')
				clearTerminalCommands()
				clearCliManifestCache()
				await loadTerminalCommands()
			}

			// Print rebuild metrics
			if (PERF_ENABLED) {
				await finalize()
			}

			isUpdating = false
		}
	})

	// Check for updates
	try {
		await checkUpdates(config)
		await Boot.check()
	} catch (error) {
		logger.warn(error)
	}
}

/**
 * Building in a separate process/thread clears the import cache.
 * This is necessary to prevent the Robo from using old code.
 */
export async function buildAsync(command: string | null, config: Config, verbose: boolean, changes: Change[]) {
	return new Promise<boolean>((resolve, reject) => {
		const start = Date.now()

		if (!command) {
			spirits
				.newTask({
					event: 'build',
					payload: {
						files: changes.map((change) => change.filePath),
						mode: Mode.get()
					},
					verbose: verbose
				})
				.then(() => {
					logger.debug(`Build completed in ${Date.now() - start}ms`)
					resolve(true)
				})
				.catch(() => resolve(false))
		} else {
			const args = command.split(' ')
			let pkgManager = getPackageManager()

			// Unfortunately, Windows has issues recursively spawning processes via PNPM
			// If you're reading this and know how to fix it, please open a PR!
			if (pkgManager === 'pnpm' && IS_WINDOWS) {
				logger.debug(`Detected Windows. Using ${color.bold('npm')} instead of ${color.bold('pnpm')} to build.`)
				pkgManager = 'npm'
			}

			// Check if args include option flags
			if (pkgManager === 'npm' || pkgManager === 'pnpm') {
				args.splice(0, 0, 'exec')
			}

			// Inserts -- before options to make sure they're being passed correctly
			if (pkgManager === 'npm') {
				const optionsIndex = args.findIndex((arg) => arg.startsWith('-'))
				if (optionsIndex !== -1) {
					args.splice(optionsIndex, 0, '--')
				}
			}

			logger.debug(`> ${pkgManager} ${args.join(' ')}`)
			const childProcess = spawn(pkgManager, args, {
				env: { ...process.env, FORCE_COLOR: '1' },
				shell: IS_WINDOWS,
				stdio: 'inherit'
			})

			childProcess.on('close', (code) => {
				if (code === 0) {
					logger.debug(`Build completed in ${Date.now() - start}ms`)
					resolve(true)
				} else {
					resolve(false)
				}
			})

			childProcess.on('error', (error) => {
				reject(error)
				resolve(false)
			})
		}
	})
}

export async function checkUpdates(config: Config, forceCheck = false, suggest = true) {
	const { updateCheckInterval = 60 * 60 } = config

	const update = {
		currentVersion: packageJson.version,
		hasUpdate: false,
		latestVersion: ''
	}

	// Ignore if disabled
	if (!forceCheck && updateCheckInterval <= 0) {
		return update
	}

	// Check if update check is due
	const lastUpdateCheck = (await Flashcore.get<number>(FLASHCORE_KEYS.lastUpdateCheck)) ?? 0
	const now = Date.now()
	const isDue = now - lastUpdateCheck > updateCheckInterval * 1000

	if (!forceCheck && !isDue) {
		return update
	}

	// Check NPM registry for updates
	const response = await fetch(`https://registry.npmjs.org/${packageJson.name}/latest`)
	const latestVersion = (await response.json()).version
	update.hasUpdate = packageJson.version !== latestVersion
	update.latestVersion = latestVersion

	// Update last update check time
	await Flashcore.set(FLASHCORE_KEYS.lastUpdateCheck, now)

	// Compare versions
	if (update.hasUpdate) {
		// Prepare commands
		const packageExecutor = getPackageExecutor()

		// Print update message
		const versionDelta = color.dim(`(v${packageJson.version} → v${latestVersion})`)
		let message = `\n${Indent} 💡 ${HighlightGreen('Update available!')} ${versionDelta}\n`

		if (suggest) {
			const command = `${packageExecutor} sage upgrade`
			message += `${Indent}    Run ${Highlight(command)} or disable update checks in config.\n`
		}
		logger.log(message)
		await Boot.notification({
			action: {
				command: 'npx sage upgrade',
				label: 'Update'
			},
			message: 'An update is ready!',
			type: 'update'
		})
	}

	return update
}

async function rebuildRobo(spiritId: string, config: Config, verbose: boolean, changes: Change[]) {
	// Guard against accidentally killing the new spirit
	const roboSpirit = spiritId
	const isValid = roboSpirit !== null && roboSpirit !== undefined

	// Get state dump before restarting
	const stateSaveStart = Date.now()
	logger.debug('Saving state...')
	const savedState =
		(await spirits.exec<Record<string, unknown>>(roboSpirit, {
			event: 'get-state'
		})) ?? {}
	logger.debug(`Saved state in ${Date.now() - stateSaveStart}ms:`, savedState)

	// Stop the previous spirit if it's still running
	// We wait for the spirit to exit before starting a new one
	let isTerminated = false
	const terminate = new Promise<void>((resolve) => {
		if (!isValid) {
			return resolve()
		}
		const spirit = spirits.get(roboSpirit)

		const callback = () => {
			logger.debug(`Gracefully stopped Robo spirit (${composeColors(color.bold, color.cyan)(roboSpirit)})`)
			spirit.worker?.off('exit', callback)
			spirit.isTerminated = true
			isTerminated = true
			resolve()
		}

		if (spirit?.isTerminated) {
			return callback()
		}

		spirit.worker.once('exit', callback)
		spirit.worker.on('message', (message: SpiritMessage) => {
			if (message.payload === 'exit') {
				callback()
			}
		})
		spirits.send(roboSpirit, { event: 'restart', verbose })
	})

	// Force abort the Robo if it doesn't exit after n seconds
	// This is to prevent the Robo from running multiple instances
	const forceAbort = timeout(() => {
		if (!isTerminated && isValid) {
			logger.warn('Robo termination timed out. Force stopping...')
			spirits.stop(roboSpirit, true)
		}
	}, config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle)

	// Wait for the Robo to exit or force abort
	const awaitStop = Promise.race([terminate, forceAbort])
	const [success] = await Promise.all([buildAsync(null, config, verbose, changes), awaitStop])

	// Return null for the Robo if the build failed so we can retry later
	if (!success) {
		const id = String(process.env.ROBO_INSTANCE_ID ?? process.pid)
		await Nanocore.update('watch', { id, status: 'attention' })
		logger.wait(`Build failed! Waiting for changes before retrying...`)
		return null
	}

	// Start Robo via spirit
	const start = Date.now()
	const newSpiritId = await spirits.newTask<string>({ event: 'start' })
	logger.debug(`Robo spirit (${composeColors(color.bold, color.cyan)(newSpiritId)}) started in ${Date.now() - start}ms`)
	spirits.send(newSpiritId, { event: 'set-state', state: savedState })
	return newSpiritId
}

/**
 * Result of HMR change handling.
 */
interface HmrResult {
	success: boolean
	reloadedHandlers: number
	reloadedRoutes: number
}

/**
 * Handle file changes using HMR instead of full restart.
 * Compiles only changed files and hot-reloads handlers in the running Robo.
 * When utility files change, uses the dependency graph to find impacted handlers.
 */
async function handleHmrChanges(
	changes: Change[],
	spiritId: string,
	config: Config,
	verbose: boolean,
	routeDefinitions?: RouteDefinitions,
	dependencyGraph?: DependencyGraph
): Promise<HmrResult> {
	const start = Date.now()
	const result: HmrResult = {
		success: true,
		reloadedHandlers: 0,
		reloadedRoutes: 0
	}

	// Check for files that require full restart
	const restartRequired = getRestartRequiredChanges(changes)
	if (restartRequired.length > 0) {
		for (const change of restartRequired) {
			logger.warn(`[HMR] ${color.bold(change.filePath)} requires full restart`)
		}
		return { ...result, success: false }
	}

	// Detect handler changes
	const { added, removed, modified } = detectRouteChanges(changes, routeDefinitions)

	// Check for non-handler changes (utilities) and find impacted handlers via dependency graph
	const nonHandlerChanges = getNonHandlerChanges(changes, routeDefinitions)
	const impactedFromUtilities: HmrMapping[] = []

	// Track utility build paths for graph update after compilation
	let utilityBuildPaths: string[] = []
	let hasDynamicImportRisk = false
	let exceededGraphTraversalLimit = false
	let visitedModulesForLinking: string[] = []

	if (nonHandlerChanges.length > 0 && dependencyGraph && routeDefinitions) {
		const impactStart = HMR_DEBUG ? Date.now() : 0

		// Convert utility source paths to build paths for graph lookup
		utilityBuildPaths = nonHandlerChanges.map((m) =>
			m.filePath.replace(/^src\//, '').replace(/\.(ts|tsx|mts)$/, '.js')
		)

		// Check if any affected modules have unresolved dynamic imports
		// If so, we'll use route-level reload for safety
		hasDynamicImportRisk = hasAffectedDynamicImports(dependencyGraph, utilityBuildPaths)
		if (hasDynamicImportRisk) {
			logger.debug(`[HMR] Utility changes affect modules with dynamic imports - using route-level reload`)
		}

		// Find all handlers that depend on the changed utilities (using current graph state)
		const impact = getImpactedHandlers(dependencyGraph, utilityBuildPaths, routeDefinitions)
		exceededGraphTraversalLimit = impact.exceededLimit
		const impactedHandlerPaths = impact.impacted
		visitedModulesForLinking = impact.visited

		// Log traversal metrics when debug is enabled
		if (HMR_DEBUG) {
			const metrics = getTraversalMetrics(impact)
			const impactTime = Date.now() - impactStart
			logger.debug(
				`[HMR] Impact analysis: visited=${metrics.visitedCount}/${MAX_TRAVERSAL_NODES} ` +
				`(${(metrics.traversalUtilization * 100).toFixed(1)}%), impacted=${metrics.impactedCount}, time=${impactTime}ms`
			)
		}

		// Convert impacted handler paths back to HmrMappings
		for (const handlerPath of impactedHandlerPaths) {
			// Treat build-relative handler path as a "source-like" path for mapping purposes.
			// This lets the mapper compute namespace/route/key correctly using routeDefinitions.
			const pseudoSrcPath = `src/${handlerPath}`
			const mapping = mapFileToRoute(pseudoSrcPath, routeDefinitions)
			if (mapping && mapping.type === 'handler') {
				impactedFromUtilities.push(mapping)
			}
		}

		if (impactedFromUtilities.length > 0) {
			logger.debug(
				`[HMR] Utility changes impact ${impactedFromUtilities.length} handler(s):`,
				impactedFromUtilities.map((m) => `${m.namespace}.${m.route}`)
			)
		}
	} else if (nonHandlerChanges.length > 0) {
		// No dependency graph available - warn about utility changes
		for (const mapping of nonHandlerChanges) {
			logger.warn(`[HMR] ${color.dim(mapping.filePath)} - utility file changed, won't hot-reload`)
		}
	}

	// Combine modified handlers with those impacted by utility changes
	const allModified = [...modified, ...impactedFromUtilities]

	// If no handler changes, nothing to do
	if (added.length === 0 && removed.length === 0 && allModified.length === 0) {
		if (nonHandlerChanges.length > 0) {
			logger.log(Indent, color.cyan('[HMR]'), color.dim('No handler changes to hot-reload'))
		}
		return result
	}

	// Compile changed files using lightweight HMR compile (no full build pipeline)
	// Include both handler files and utility files
	const handlerFilesToCompile = [...added, ...modified].map((m) => m.filePath)
	const utilityPathSet = new Set(nonHandlerChanges.map((m) => m.filePath))
	const utilityFilesToCompile = changes
		.filter((c) => c.changeType !== 'removed' && utilityPathSet.has(c.filePath))
		.map((c) => c.filePath)
	const filesToCompile = [...new Set([...handlerFilesToCompile, ...utilityFilesToCompile])]
	const restartOnCompileFailure = added.length > 0 || removed.length > 0
	if (filesToCompile.length > 0) {
		logger.debug(`[HMR] Compiling ${filesToCompile.length} file(s)...`)
		const compileStart = Date.now()

		try {
			// Use hmr-compile which only runs the compiler, not the full build pipeline
			const compileResult = await spirits.exec<{ success: boolean; elapsed?: number; error?: string }>(spiritId, {
				event: 'hmr-compile',
				payload: {
					files: filesToCompile,
					mode: Mode.get()
				}
			})

			if (!compileResult?.success) {
				logger.error(`[HMR] Compilation failed:`, compileResult?.error)
				if (restartOnCompileFailure) {
					return { ...result, success: false }
				}
				logger.warn(`[HMR] Keeping previous code until next change`)
				return result
			}

			logger.debug(`[HMR] Compilation completed in ${Date.now() - compileStart}ms`)
		} catch (error) {
			logger.error(`[HMR] Compilation failed:`, error)
			if (restartOnCompileFailure) {
				return { ...result, success: false }
			}
			logger.warn(`[HMR] Keeping previous code until next change`)
			return result
		}
	}

	// If dependency graph traversal exceeded limits, fall back to full restart.
	// This avoids silently skipping reloads in very large graphs.
	if (exceededGraphTraversalLimit) {
		logger.warn(`[HMR] Dependency graph traversal exceeded limit, falling back to full restart`)
		return { ...result, success: false }
	}

	// If files were deleted from src/, remove their compiled artifacts so the runtime and graph
	// reflect the deletion (important for Phase 2 cache-busting correctness).
	try {
		const fs = await import('node:fs/promises')
		const mode = Mode.get()
		const buildBase = path.join(process.cwd(), '.robo', 'build', mode)

		for (const change of changes) {
			if (change.changeType !== 'removed') continue
			if (!change.filePath.startsWith('src/')) continue

			const buildRel = change.filePath
				.replace(/^src\//, '')
				.replace(/\.(ts|tsx|mts)$/, '.js')

			await fs.rm(path.join(buildBase, buildRel), { force: true })
		}
	} catch {
		// Best-effort cleanup only
	}

	// Update dependency graph after compilation (and deletion cleanup) with new build output.
	if (dependencyGraph && routeDefinitions) {
		const graphUpdateStart = HMR_DEBUG ? Date.now() : 0

		const handlerBuildPaths = [...added, ...removed, ...modified].map((m) => toBuildPath(m))
		const utilityBuildPathsForGraph = nonHandlerChanges.map((m) =>
			m.filePath.replace(/^src\//, '').replace(/\.(ts|tsx|mts)$/, '.js')
		)

		const graphPaths = [...new Set([...handlerBuildPaths, ...utilityBuildPathsForGraph])]

		// Explicitly mark removed utility modules as deleted in the graph (even if build artifacts linger).
		for (const change of changes) {
			if (change.changeType !== 'removed') continue
			if (!change.filePath.startsWith('src/')) continue
			const buildRel = change.filePath
				.replace(/^src\//, '')
				.replace(/\.(ts|tsx|mts)$/, '.js')
			removeModule(buildRel, dependencyGraph)
		}

		updateGraphForFiles(dependencyGraph, graphPaths)

		if (HMR_DEBUG) {
			const graphUpdateTime = Date.now() - graphUpdateStart
			logger.debug(`[HMR] Graph update: ${graphPaths.length} file(s) in ${graphUpdateTime}ms`)
		} else {
			logger.debug(`[HMR] Updated dependency graph for ${graphPaths.length} file(s)`)
		}
	}

	// Update manifest for added/removed handlers
	if (added.length > 0 || removed.length > 0) {
		logger.debug(`[HMR] Updating manifest for ${added.length} added, ${removed.length} removed handlers`)
		try {
			await updateManifestIncremental(added, removed, modified)
		} catch (error) {
			logger.error(`[HMR] Manifest update failed:`, error)
			return { ...result, success: false }
		}
	}

	// Link modules (import specifier rewriting) only when utility files change.
	// Linking causes ESM to treat dependencies as new module URLs via ?robo_hmr=,
	// which is required to make utility changes observable after a handler reload.
	//
	// Avoid linking on handler-only changes to reduce unnecessary module duplication
	// and side-effect accumulation over time.
	if (nonHandlerChanges.length > 0) {
		const modulesToLink = new Set<string>(visitedModulesForLinking)

		// Include handlers we will reload in this batch so they import deps via robo_hmr=.
		// (Includes added/modified handlers + those impacted by utility changes.)
		for (const mapping of [...added, ...allModified]) {
			const buildPath = mapping.filePath
				.replace(/^src\//, '')
				.replace(/\.(ts|tsx|mts)$/, '.js')
			modulesToLink.add(buildPath)
		}

		// Include directly changed utilities so their own import chains propagate robo_hmr=.
		for (const mapping of nonHandlerChanges) {
			const buildPath = mapping.filePath
				.replace(/^src\//, '')
				.replace(/\.(ts|tsx|mts)$/, '.js')
			modulesToLink.add(buildPath)
		}

		if (modulesToLink.size > 0) {
			const linkStart = HMR_DEBUG ? Date.now() : 0
			const hmrVersion = Date.now()
			logger.debug(`[HMR] Linking ${modulesToLink.size} module(s) with version ${hmrVersion}`)

			try {
				const linkResult = await linkModules({
					mode: Mode.get(),
					version: hmrVersion,
					modules: Array.from(modulesToLink)
				})

				if (HMR_DEBUG) {
					const linkTime = Date.now() - linkStart
					logger.debug(`[HMR] Linked ${linkResult.linkedCount} file(s) in ${linkTime}ms`)
				} else if (linkResult.linkedCount > 0) {
					logger.debug(`[HMR] Linked ${linkResult.linkedCount} file(s)`)
				}

				if (linkResult.errors.length > 0) {
					for (const error of linkResult.errors) {
						logger.warn(`[HMR] Link warning: ${error}`)
					}
				}
			} catch (error) {
				// Linking failure is non-fatal - handlers may still work, just with potential cache issues
				logger.warn(`[HMR] Linking failed (continuing anyway):`, error)
			}
		}
	}

	// Determine reload strategy
	// Use route-level reload for: added/removed handlers, or when dynamic imports are at risk
	const needsRouteReload = added.length > 0 || removed.length > 0 || hasDynamicImportRisk

	if (needsRouteReload) {
		// Route-level reload for added/removed handlers or dynamic import safety
		const uniqueRoutes = getUniqueRoutes([...added, ...removed, ...allModified])
		let failedRoutes = 0

		for (const [namespace, route] of uniqueRoutes) {
			logger.debug(`[HMR] Reloading route: ${namespace}.${route}`)

			try {
				const response = await spirits.exec<{ success: boolean; error?: string }>(spiritId, {
					event: 'hmr-reload-route',
					payload: { namespace, route }
				})

				if (!response?.success) {
					failedRoutes++
					logger.error(`[HMR] Route reload failed (keeping previous code): ${response?.error}`)
					continue
				}

				result.reloadedRoutes++
			} catch (error) {
				// IPC/worker failures are fatal for HMR - fall back to full restart
				logger.error(`[HMR] Route reload failed:`, error)
				return { ...result, success: false }
			}
		}

		logger.log(
			Indent,
			color.cyan('[HMR]'),
			failedRoutes > 0
				? `Reloaded ${result.reloadedRoutes} route(s) (${failedRoutes} failed)`
				: `Reloaded ${result.reloadedRoutes} route(s)`,
			color.dim(`(${Date.now() - start}ms)`)
		)
	} else {
		// Handler-level reload for modifications only (including those impacted by utility changes)
		let failedHandlers = 0
		for (const mapping of allModified) {
			// Convert source path to build path (e.g., src/events/messageCreate/example.ts -> events/messageCreate/example.js)
			const handlerPath = mapping.filePath
				.replace(/^src\//, '')
				.replace(/\.(ts|tsx|mts)$/, '.js')

			logger.debug(`[HMR] Reloading handler: ${mapping.namespace}.${mapping.route} [${handlerPath}]`)

			try {
				const response = await spirits.exec<{ success: boolean; error?: string }>(spiritId, {
					event: 'hmr-reload-handler',
					payload: {
						namespace: mapping.namespace,
						route: mapping.route,
						key: mapping.key,
						handlerPath
					}
				})

				if (!response?.success) {
					failedHandlers++
					logger.error(`[HMR] Handler reload failed (keeping previous code): ${response?.error}`)
					continue
				}

				result.reloadedHandlers++
			} catch (error) {
				// IPC/worker failures are fatal for HMR - fall back to full restart
				logger.error(`[HMR] Handler reload failed:`, error)
				return { ...result, success: false }
			}
		}

		logger.log(
			Indent,
			color.cyan('[HMR]'),
			failedHandlers > 0
				? `Reloaded ${result.reloadedHandlers} handler(s) (${failedHandlers} failed)`
				: `Reloaded ${result.reloadedHandlers} handler(s)`,
			color.dim(`(${Date.now() - start}ms)`)
		)
	}

	// Send HMR notification to execute hooks and subscribers
	const affectedMappings = [...added, ...removed, ...allModified]
	if (affectedMappings.length > 0) {
		try {
			// Determine primary change type
			const changeType: 'change' | 'add' | 'remove' =
				added.length > 0 ? 'add' : removed.length > 0 ? 'remove' : 'change'

			// Collect source files
			const files = affectedMappings.map((m) => m.filePath)

			// Group handlers by namespace:route
			const routeMap = new Map<string, Array<{ key: string; path: string }>>()
			for (const m of affectedMappings) {
				const routeKey = `${m.namespace}:${m.route}`
				if (!routeMap.has(routeKey)) {
					routeMap.set(routeKey, [])
				}
				routeMap.get(routeKey)!.push({
					key: m.key,
					path: m.filePath.replace(/^src\//, '').replace(/\.(ts|tsx|mts)$/, '.js')
				})
			}

			// Build routes array
			const routes = Array.from(routeMap.entries()).map(([routeKey, handlers]) => {
				const [namespace, route] = routeKey.split(':')
				return { namespace, route, handlers }
			})

			await spirits.exec(spiritId, {
				event: 'hmr-notify',
				payload: { changeType, files, routes }
			})
		} catch (error) {
			// HMR notification failure is non-fatal
			logger.debug(`[HMR] Hook notification failed:`, error)
		}
	}

	return result
}

/**
 * Update manifest incrementally for HMR changes.
 * Handles added, removed, and modified handler entries.
 *
 * This function properly supports multiple: true routes (like events)
 * where multiple handlers can share the same key. It:
 * - Matches entries by build path (not key) for removal/modification
 * - Allows multiple entries with the same key
 * - Reindexes entries to assign proper id/index values
 */
async function updateManifestIncremental(
	added: HmrMapping[],
	removed: HmrMapping[],
	modified: HmrMapping[]
): Promise<void> {
	const fs = await import('node:fs/promises')
	const mode = Mode.get()
	const manifestBase = path.join(process.cwd(), '.robo', 'manifest', mode)

	// Group by route
	const routeChanges = new Map<string, {
		added: HmrMapping[]
		removed: HmrMapping[]
		modified: HmrMapping[]
	}>()

	const addToRoute = (mapping: HmrMapping, type: 'added' | 'removed' | 'modified') => {
		const key = `${mapping.namespace}.${mapping.route}`
		if (!routeChanges.has(key)) {
			routeChanges.set(key, { added: [], removed: [], modified: [] })
		}
		routeChanges.get(key)![type].push(mapping)
	}

	for (const m of added) addToRoute(m, 'added')
	for (const m of removed) addToRoute(m, 'removed')
	for (const m of modified) addToRoute(m, 'modified')

	// Update each affected route's manifest file
	for (const [routeKey, changes] of routeChanges) {
		const [namespace, route] = routeKey.split('.')
		const routeManifestPath = path.join(manifestBase, 'routes', `${namespace}.${route}.json`)

		let entries: ManifestEntry[] = []

		// Load existing entries
		try {
			const content = await fs.readFile(routeManifestPath, 'utf-8')
			entries = JSON.parse(content)
		} catch {
			// File doesn't exist yet
		}

		// Remove entries for deleted handlers - match by path, not key
		// This correctly handles multiple: true routes where multiple handlers share a key
		for (const rem of changes.removed) {
			const buildPath = toBuildPath(rem)
			entries = entries.filter((e) => e.path !== buildPath)
		}

		// Add entries for new handlers - check duplicate by path, not key
		// This allows multiple handlers with the same key (for events)
		for (const add of changes.added) {
			const buildPath = toBuildPath(add)

			// Only skip if exact same path already exists (true duplicate)
			if (!entries.some((e) => e.path === buildPath)) {
				entries.push({
					id: '', // Will be set during reindex
					key: add.key,
					path: buildPath,
					source: 'project',
					plugin: null,
					exports: { default: true }
				})
			}
		}

		// Update paths for modified handlers - match by path
		// This correctly identifies the specific handler when multiple share a key
		for (const mod of changes.modified) {
			const buildPath = toBuildPath(mod)
			const entry = entries.find((e) => e.path === buildPath)
			if (entry) {
				// Path hasn't changed for modifications, but key might need update
				entry.key = mod.key
			}
		}

		// Reindex all entries to assign proper id and index values
		reindexEntries(entries)

		// Write updated manifest
		await fs.mkdir(path.dirname(routeManifestPath), { recursive: true })
		await fs.writeFile(routeManifestPath, JSON.stringify(entries, null, 2))

		logger.debug(`[HMR] Updated manifest: ${routeKey}`)
	}
}
