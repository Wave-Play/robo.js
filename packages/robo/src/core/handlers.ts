import { getConfig } from './config.js'
import { DEFAULT_CONFIG, TIMEOUT } from './constants.js'
import { logger } from './logger.js'
import { timeout } from '../cli/utils/utils.js'
import type { PluginData } from '../types/index.js'

/**
 * Execute lifecycle event handlers (_start, _stop, _restart)
 *
 * Note: In the new architecture, lifecycle events are primarily handled through
 * the hooks system (executeStartHooks, executeStopHooks). This function provides
 * backwards compatibility for projects that still use event handlers for lifecycle.
 *
 * Platform-specific events (like Discord events) are handled by their respective plugins.
 */
export async function executeEventHandler(
	plugins: Map<string, PluginData> | null,
	eventName: string,
	 
	..._eventData: unknown[]
): Promise<void> {
	// Only handle lifecycle events in core
	// Platform-specific events are handled by their respective plugins
	if (!eventName.startsWith('_')) {
		return
	}

	// In the new architecture, lifecycle events are handled through hooks
	// (executeStartHooks, executeStopHooks, executeInitHooks)
	// This function now just logs for debugging
	const config = getConfig()
	const lifecycleTimeout = config?.timeouts?.lifecycle || DEFAULT_CONFIG.timeouts.lifecycle

	logger.debug(`Lifecycle event "${eventName}" triggered (timeout: ${lifecycleTimeout}ms)`)

	// Return immediately - lifecycle handling is done through hooks
	return
}

/**
 * Helper to create a timeout promise for lifecycle events
 */
export function createLifecycleTimeout(): Promise<symbol> {
	const config = getConfig()
	return timeout(() => TIMEOUT, config?.timeouts?.lifecycle || DEFAULT_CONFIG.timeouts.lifecycle)
}
