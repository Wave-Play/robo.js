/**
 * Stop Hook - Server Shutdown
 *
 * This hook runs during Robo.stop() to:
 * 1. Stop any running tunnel (unless stopping due to restart)
 * 2. Gracefully drain HTTP connections
 * 3. Stop the server engine
 */
import { Robo } from 'robo.js'
import { getApiRuntime } from '../core/api-runtime.js'
import { stopDevReload } from '../core/dev-reload.js'
import { logger } from '../core/logger.js'
import { pluginOptions, type PluginConfig } from './prepare.js'
import type { StopContext } from 'robo.js'

/**
 * Stop hook - Gracefully shuts down the server and tunnel
 */
export default async (context: StopContext<PluginConfig>) => {
	const { engine } = pluginOptions
	const isRestart = context.reason === 'restart'

	// Stop tunnel if running (but keep it alive during restarts)
	if (!isRestart && globalThis.roboServer?.tunnelInstance && globalThis.roboServer?.tunnelProvider) {
		try {
			logger.debug('Stopping tunnel...')
			await globalThis.roboServer.tunnelProvider.stop(globalThis.roboServer.tunnelInstance)
			globalThis.roboServer.tunnelInstance = undefined
			globalThis.roboServer.tunnelProvider = undefined
		} catch (error) {
			logger.error('Failed to stop tunnel:', error)
		}
	}

	// Stop server engine
	if (engine?.isRunning()) {
		logger.debug('Draining connections...')
		await engine.stop()
	}

	Robo.status.remove('server')
	stopDevReload()
	getApiRuntime().dispose()
	if (globalThis.roboServer) {
		globalThis.roboServer.ready = false
		globalThis.roboServer.hmrCapabilities = undefined
		globalThis.roboServer.hmrTopologyState = undefined
		globalThis.roboServer.registeredPaths = []
	}
}
