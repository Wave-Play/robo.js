import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { color, composeColors } from '../core/color.js'
import { setGlobalOverwrites } from '../core/env.js'
import { logger } from '../core/logger.js'
import { setMode } from '../core/mode.js'
import { removeInstances } from '../core/state.js'
import type { HmrReloadHandlerPayload, HmrReloadRoutePayload, SpiritMessage } from '../types/index.js'
import type { HmrNotifyPayload } from '../core/hooks.js'

// This should only be run in a worker thread
if (isMainThread) {
	logger.error('Spirit file should never be imported from the main thread!')
	process.exit(1)
}

// Apply environment variables passed from main thread to process.env
// This ensures CLI extension overrides (like mock tokens) are used
if (workerData.env) {
	for (const [key, value] of Object.entries(workerData.env)) {
		if (value !== undefined) {
			process.env[key] = value as string
		}
	}
	// Keep track of which keys were passed so Env.load() knows to preserve them
	// Exclude DISCORD_TOKEN and DISCORD_REST_API from overwrite list since they may
	// be set by CLI extensions (like mock mode) and shouldn't be overwritten by .env
	const overwriteKeys = Object.keys(workerData.env).filter(
		(key) => key !== 'DISCORD_TOKEN' && key !== 'DISCORD_REST_API'
	)
	setGlobalOverwrites(overwriteKeys)
}

// Inherit mode for this thread
if (workerData.mode) {
	setMode(workerData.mode)
}

// This is used to wait for the state to be loaded before continuing
let isRobo = false
let stateLoadResolve: () => void
const stateLoad = new Promise<void>((resolve) => {
	stateLoadResolve = resolve
})

interface BuildPayload {
	files: string[]
	mode?: string
}

interface HmrCompilePayload {
	files: string[]
	mode?: string
}

/**
 * Spirits continue living in the background until their job is done.
 * Each job may be different, and some don't end until told to do so.
 */
async function run(message: SpiritMessage): Promise<unknown> {
	if (message.event === 'build') {
		const { buildAction } = await import('./commands/build/index.js')
		const payload = message.payload as BuildPayload
		await buildAction({
			args: payload.files ?? [],
			options: {
				dev: true,
				mode: payload.mode,
				verbose: message.verbose,
				silent: !message.verbose
			},
			logger: logger,
			cwd: process.cwd(),
			argv: []
		})
		return 'exit'
	} else if (message.event === 'get-state') {
		const { state } = await import('../core/state.js')
		return removeInstances(state)
	} else if (message.event === 'cli-state-set') {
		const { key, value } = message.payload as { key: string; value: unknown }
		const { setState } = await import('../core/state.js')
		setState(key, value)
		return true
	} else if (message.event === 'cli-state-delete') {
		const { key } = message.payload as { key: string }
		const { state } = await import('../core/state.js')
		delete state[key]
		return true
	} else if (message.event === 'cli-state-forks') {
		const { State } = await import('../core/state.js')
		return State.listForks()
	} else if (message.event === 'restart') {
		if (!isRobo) {
			return 'exit'
		}

		const { Robo } = await import('../core/robo.js')
		await Robo.restart()
		return 'exit'
	} else if (message.event === 'set-state') {
		const { loadState } = await import('../core/state.js')
		loadState(message.state)
		stateLoadResolve()
		return 'ok'
	} else if (message.event === 'start') {
		const { Robo } = await import('../core/robo.js')
		const logLevel = message.logLevel
		Robo.start({ logLevel, stateLoad }).catch((error) => {
			logger.error(error)
			logger.wait(
				`Robo failed to start, please check the logs for more information. Waiting for changes before retrying...`
			)
			process.exit(1)
		})
		isRobo = true
		return 'ok'
	} else if (message.event === 'stop') {
		if (!isRobo) {
			return 'exit'
		}

		const { Robo } = await import('../core/robo.js')
		await Robo.stop()
		return 'exit'
	} else if (message.event === 'hmr-compile') {
		// Compile specific files for HMR without running full build pipeline
		const payload = message.payload as HmrCompilePayload
		const start = Date.now()

		try {
			const { buildCode } = await import('./compiler/build.js')
			const { RoboPaths } = await import('../core/paths.js')

			// Compile just the specified files
			await buildCode({
				files: payload.files,
				mode: payload.mode,
				clean: false, // Don't clean the directory for incremental builds
				copyOther: false // Skip full copyDir() scan - non-TS files are already present from initial build
			})

			const elapsed = Date.now() - start
			logger.debug(`[HMR] Compiled ${payload.files.length} file(s) in ${elapsed}ms`)
			return { success: true, elapsed }
		} catch (error) {
			logger.error(`[HMR] Compilation failed:`, error)
			return { success: false, error: String(error) }
		}
	} else if (message.event === 'hmr-reload-handler') {
		// Hot reload a single handler
		if (!isRobo) {
			return { success: false, error: 'Robo not running' }
		}

		const payload = message.payload as HmrReloadHandlerPayload
		const { portal } = await import('../core/portal-impl.js')

		try {
			// Use reloadHandlerByPath for reliable matching (esp. for events with multiple handlers)
			const reloaded = await portal.reloadHandlerByPath(payload.namespace, payload.route, payload.handlerPath)
			if (reloaded) {
				logger.debug(`[HMR] Reloaded handler: ${payload.namespace}.${payload.route} [${payload.handlerPath}]`)
				return { success: true }
			} else {
				// Fallback to key-based reload for backwards compatibility
				await portal.reloadHandler(payload.namespace, payload.route, payload.key)
				logger.debug(`[HMR] Reloaded handler by key: ${payload.namespace}.${payload.route}['${payload.key}']`)
				return { success: true }
			}
		} catch (error) {
			logger.error(`[HMR] Failed to reload handler:`, error)
			return { success: false, error: String(error) }
		}
	} else if (message.event === 'hmr-reload-route') {
		// Hot reload an entire route (for added/removed handlers)
		if (!isRobo) {
			return { success: false, error: 'Robo not running' }
		}

		const payload = message.payload as HmrReloadRoutePayload
		const { reloadPortalRoute } = await import('../core/portal-loader.js')

		try {
			await reloadPortalRoute(payload.namespace, payload.route)
			logger.debug(`[HMR] Reloaded route: ${payload.namespace}.${payload.route}`)
			return { success: true }
		} catch (error) {
			logger.error(`[HMR] Failed to reload route:`, error)
			return { success: false, error: String(error) }
		}
	} else if (message.event === 'hmr-status') {
		// Return HMR readiness status
		return { ready: isRobo }
	} else if (message.event === 'hmr-notify') {
		// Execute HMR hooks after handlers are reloaded
		if (!isRobo) {
			return { success: false, error: 'Robo not running' }
		}

		const payload = message.payload as HmrNotifyPayload

		// Validate payload
		if (!['change', 'add', 'remove'].includes(payload?.changeType)) {
			return { success: false, error: 'Invalid changeType' }
		}
		if (!Array.isArray(payload?.files)) {
			return { success: false, error: 'Invalid files array' }
		}
		if (!Array.isArray(payload?.routes)) {
			return { success: false, error: 'Invalid routes array' }
		}

		try {
			const { executeHmrHooks } = await import('../core/hooks.js')
			const { getPlugins } = await import('../core/robo.js')
			const { getMode } = await import('../core/mode.js')

			const plugins = getPlugins()
			const mode = getMode()

			await executeHmrHooks(plugins, mode, payload)
			logger.debug(`[HMR] Notified hooks: ${payload.files.length} file(s), ${payload.routes.length} route(s)`)
			return { success: true }
		} catch (error) {
			logger.warn(`[HMR] Hook execution failed:`, error)
			return { success: false, error: String(error) }
		}
	} else {
		throw `Unknown Spirit message event: ${message.event}`
	}
}

parentPort.on('message', async (message: SpiritMessage) => {
	// Update logger only if this spirit isn't already a Robo
	if (!isRobo) {
		logger({
			level: message.verbose ? 'debug' : 'info'
		})
	}
	logger.debug(`Spirit (${composeColors(color.bold, color.cyan)(workerData.spiritId)}) received message:`, message)

	// Handle message and send response (if any) back to main thread
	let result: SpiritMessage
	try {
		const payload = await run(message)
		result = { event: message.event, payload }
	} catch (error) {
		result = { error, payload: 'exit' }
	}
	logger.debug(`Spirit (${composeColors(color.bold, color.cyan)(workerData.spiritId)}) sending response:`, result)

	// Preemptively flush logs if we're exiting
	if (result.payload === 'exit') {
		await logger.flush()
	}

	// Forward response to main thread
	parentPort.postMessage(result)

	// Stop living once work is done ;-;
	if (result.payload === 'exit') {
		parentPort.close()
		process.exit()
	}
})
