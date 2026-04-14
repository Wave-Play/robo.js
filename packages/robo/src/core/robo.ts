import { registerProcessEvents } from './process.js'
import { getConfig, loadConfig } from './config.js'
import { FLASHCORE_KEYS } from './constants.js'
import { consoleDrain, createLevelFilteredDrain, createMultiDrain, Logger, logger, LogLevel } from './logger.js'
import { createFileDrain, setFileDrainSessionId } from './drains.js'
import { Env } from './env.js'
import { executeEventHandler } from './handlers.js'
import { Nanocore } from '../internal/nanocore.js'
import { Flashcore } from './flashcore.js'
import { executeErrorHooks, executeInitHooks, executePrepareHooks, executeStartHooks, executeStopHooks } from './hooks.js'
import { Manifest } from './manifest-api.js'
import { Mode } from './mode.js'
import { loadState } from './state.js'
import { portal, populatePortal } from './portal.js'
import { isMainThread } from 'node:worker_threads'
import { Globals } from './globals.js'
import { Status } from './status.js'
import type { Config, PluginData } from '../types/index.js'
import type { BuildCommandOptions } from '../cli/commands/build/index.js'
import type { CliContext } from '../types/cli.js'

/**
 * Robo is the main entry point for your app. It provides a simple API for starting, stopping, and restarting your Robo.
 *
 * ```ts
 * import { Robo } from 'robo.js'
 *
 * Robo.start()
 * ```
 *
 * You do not normally need to use this API directly, as the CLI will handle starting and stopping for you.
 *
 * [**Learn more:** Robo](https://robojs.dev/robojs/overview)
 */
export const Robo = { restart, start, stop, build, status: Status }

// Re-export portal from portal module for convenience
export { portal }

// Be careful, plugins may contain sensitive data in their config
let plugins: Map<string, PluginData>

/**
 * Get the currently loaded plugins.
 * @internal - Used by HMR hooks
 */
export function getPlugins(): Map<string, PluginData> {
	return plugins ?? new Map()
}

interface StartOptions {
	config?: Config
	envReady?: boolean
	logLevel?: LogLevel
	stateLoad?: Promise<void>
}

type BuildOptions = BuildCommandOptions

/**
 * Builds your Robo instance. Similar to running `robo build` from the CLI.
 *
 * @param options - Options for building your Robo instance, similar to CLI options
 * @returns A promise that resolves when Robo has finished building
 */
export async function build(options?: BuildOptions) {
	const { buildAction } = await import('../cli/commands/build/index.js')
	await buildAction({
		args: [],
		options: {
			exit: false,
			...(options ?? {})
		}
	} as unknown as CliContext)
}

/**
 * Starts your Robo instance. Similar to running `robo start` from the CLI.
 *
 * @param options - Options for starting your Robo instance
 * @returns A promise that resolves when Robo has started
 */
async function start(options?: StartOptions) {
	const pid = process.pid
	const id = String(process.env.ROBO_INSTANCE_ID ?? pid)

	// Generate and set session ID for log correlation
	const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
	Logger.setSessionId(sessionId)
	setFileDrainSessionId(sessionId)

	// In mock test mode (without verbose), suppress console output immediately
	// This must happen before any other code that might use the logger
	const isMockTestMode = process.env.ROBO_MOCK_TEST_MODE === 'true'
	const isMockVerbose = process.env.ROBO_MOCK_VERBOSE === 'true'
	const noOpDrain = async () => {}

	if (isMockTestMode && !isMockVerbose) {
		logger({ drain: noOpDrain })
	}

	try {
		const { config: preloadedConfig, envReady, logLevel, stateLoad } = options ?? {}

		// Important! Register process events before doing anything else
		// This ensures the "ready" signal is sent to the parent process
		registerProcessEvents()

		// 1. Load config first (needed for plugin list and logger config)
		let config: Config
		if (preloadedConfig) {
			config = preloadedConfig
			Globals.registerConfig(config)
		} else {
			config = await loadConfig()
		}

		// 2. Get mode early (needed for logger setup and init hooks)
		const mode = Mode.get()

		// Set up file drains based on config
		const fileDrains: ReturnType<typeof createFileDrain>[] = []

		if (config?.logger?.files?.length) {
			// Create file drains from config
			for (const fileConfig of config.logger.files) {
				fileDrains.push(
					createFileDrain({
						path: fileConfig.path,
						level: fileConfig.level,
						timestamp: fileConfig.timestamp ?? config.logger.timestamp,
						maxSize: fileConfig.maxSize,
						maxFiles: fileConfig.maxFiles,
						format: fileConfig.format,
						colorMap: fileConfig.colorMap ?? config.logger.colorMap
					})
				)
			}
		} else if (config?.logger?.files === undefined && !isMockTestMode) {
			// Auto-create log file for any mode if files is undefined (not explicitly empty)
			// Uses .robo/logs/{mode}.log (e.g., .robo/logs/development.log, .robo/logs/production.log)
			const logMode = mode || 'default'
			fileDrains.push(
				createFileDrain({
					path: `.robo/logs/${logMode}.log`,
					level: 'debug',
					timestamp: 'iso',
					colorMap: config?.logger?.colorMap
				})
			)
		}

		// Combine console + file drains
		// In mock test mode (without verbose), use no-op drain - tests set up their own file drain
		const baseDrain = isMockTestMode && !isMockVerbose ? noOpDrain : (config?.logger?.drain ?? consoleDrain)

		// When combining with file drains, filter console output to info+ level
		// This allows file drains to capture debug messages while console stays at info level
		const consoleLevel = config?.logger?.level ?? 'info'
		const filteredBaseDrain = fileDrains.length > 0 && baseDrain !== noOpDrain
			? createLevelFilteredDrain(baseDrain, consoleLevel)
			: baseDrain
		const combinedDrain = fileDrains.length > 0 ? createMultiDrain([filteredBaseDrain, ...fileDrains]) : baseDrain

		logger({
			drain: combinedDrain,
			enabled: config?.logger?.enabled,
			level: logLevel ?? config?.logger?.level
		}).debug('Starting Robo...')

		// Load environment (needed for init hooks)
		if (!envReady) {
			await Env.load({ mode })
		}

		// 3. Load plugin data early (needed for init hooks)
		// Assign to module-level variable for stop/restart lifecycle events
		plugins = loadPluginData()

		// 4. Execute init hooks BEFORE manifest loading
		// Init hooks run very early and can modify config/env before manifest processing
		await executeInitHooks(plugins, mode)

		// 5. Initialize Manifest and Flashcore+State in parallel (independent operations)
		await Promise.all([
			Manifest.initialize(mode),
			(async () => {
				await Flashcore.$init({ keyvOptions: config.flashcore?.keyv, namespaceSeparator: config.flashcore?.namespaceSeparator })
				if (stateLoad) {
					logger.debug('Waiting for state...')
					await stateLoad
				} else {
					const stateStart = Date.now()
					const state = await Flashcore.get<Record<string, unknown>>(FLASHCORE_KEYS.state)
					if (state) {
						loadState(state)
					}
					logger.debug(`State loaded in ${Date.now() - stateStart}ms`)
				}
			})()
		])

		// Load the portal (commands, context, events)
		// In production mode, handlers are loaded eagerly for faster runtime access
		// In development mode, handlers are loaded lazily on first access
		await populatePortal(mode)

		// Execute prepare hooks (plugins first, then project)
		// Use for initializing resources like Discord client, HTTP servers
		await executePrepareHooks(plugins, mode)

		// Execute start hooks (plugins first, then project)
		await executeStartHooks(plugins, mode)

		// Let external watchers know we're ready to go
		await Nanocore.set('watch', { id, pid, startedAt: Date.now(), status: 'running' })

		// Notify lifecycle event handlers
		await executeEventHandler(plugins, '_start')
	} catch (error) {
		await Nanocore.update('watch', { id, status: 'attention' })
		throw error
	}
}

/**
 * Stops your Robo instance gracefully. Similar to pressing `Ctrl+C` in the terminal.
 *
 * @param exitCode - The exit code to use when stopping Robo
 * @param reason - The reason for stopping (defaults to 'signal' if exitCode is 0, 'error' otherwise)
 */
let _stopPromise: Promise<void> | null = null

async function stop(exitCode = 0, reason?: 'signal' | 'error' | 'restart') {
	// Prevent multiple concurrent stop calls (e.g. duplicate SIGINT handlers)
	if (_stopPromise) {
		return _stopPromise
	}

	_stopPromise = _stopInternal(exitCode, reason)
	return _stopPromise
}

async function _stopInternal(exitCode: number, reason?: 'signal' | 'error' | 'restart') {
	await Nanocore.update('watch', { status: exitCode === 0 ? 'stopping' : 'error' })

	// Determine reason if not provided
	const stopReason = reason ?? (exitCode === 0 ? 'signal' : 'error')

	try {
		// Execute stop hooks (project first, then plugins in reverse order)
		await executeStopHooks(plugins, Mode.get(), stopReason)

		// Notify lifecycle handler
		await executeEventHandler(plugins, '_stop')
		logger.debug(`Stopped Robo at ` + new Date().toLocaleString())

		if (exitCode === 0) {
			await Nanocore.update('watch', { status: 'stopped' })
		}
	} finally {
		if (isMainThread) {
			process.exit(exitCode)
		} else {
			// Flush logs before returning - spirit message handler will send 'exit' and exit
			await logger.flush()
		}
	}
}

/**
 * Restarts your Robo instance gracefully. Similar to making changes with `robo dev` and restarting.
 *
 * @returns A promise that resolves when Robo has restarted
 */
async function restart() {
	try {
		// Execute stop hooks with restart reason
		await executeStopHooks(plugins, Mode.get(), 'restart')

		// Keep legacy _restart event for backwards compatibility
		await executeEventHandler(plugins, '_restart')
		logger.debug(`Restarted Robo at ` + new Date().toLocaleString())
	} finally {
		if (isMainThread) {
			process.exit(0)
		} else {
			// Update status and flush logs before returning - spirit message handler will send 'exit' and exit
			await Nanocore.update('watch', { status: 'restarting' })
			await logger.flush()
		}
	}
}

export function loadPluginData() {
	const config = getConfig()
	const collection = new Map<string, PluginData>()
	if (!config.plugins) {
		return collection
	}

	for (const plugin of config.plugins) {
		if (typeof plugin === 'string') {
			collection.set(plugin, { name: plugin })
		} else if (Array.isArray(plugin)) {
			const [name, options, metaOptions] = plugin
			collection.set(name, { name, options, metaOptions })
		}
	}

	return collection
}

/**
 * Handle unhandled errors by executing error hooks.
 * Called by process event handlers for unhandledRejection and uncaughtException.
 * Blocks until hooks complete or timeout.
 *
 * @param error - The error that occurred
 * @param type - Type of error
 */
export async function handleUnhandledError(
	error: unknown,
	type: 'unhandledRejection' | 'uncaughtException'
): Promise<void> {
	// Only execute if plugins have been loaded (Robo has started)
	if (!plugins) {
		return
	}

	await executeErrorHooks(plugins, Mode.get(), error, type)
}
