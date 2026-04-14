import { getApiRuntime } from '../core/api-runtime.js'
import { logger } from '../core/logger.js'
import type { HmrContext, HmrHookConfig } from 'robo.js'

export const config: HmrHookConfig = {
	namespaces: ['server'],
	routes: ['api']
}

export default async function (context: HmrContext): Promise<void> {
	const apiRuntime = getApiRuntime()
	const topologyRouteKeys = new Set<string>()
	const changedRouteKeys = new Set<string>()

	for (const route of context.routes) {
		for (const handler of route.handlers) {
			if (handler.changeType === 'change') {
				changedRouteKeys.add(handler.key)
			} else {
				topologyRouteKeys.add(handler.key)
			}
		}
	}

	if (topologyRouteKeys.size === 0) {
		apiRuntime.markRoutesStale([...changedRouteKeys])
		if (changedRouteKeys.size > 0) {
			logger.debug(`[HMR] Invalidated ${changedRouteKeys.size} API route(s)`)
		}
		return
	}

	try {
		await apiRuntime.syncTopology()
		globalThis.roboServer.registeredPaths = apiRuntime.getRegisteredPaths()
		globalThis.roboServer.hmrTopologyState = { success: true }

		if (changedRouteKeys.size > 0) {
			apiRuntime.markRoutesStale([...changedRouteKeys])
			logger.debug(`[HMR] Invalidated ${changedRouteKeys.size} API route(s) after topology sync`)
		}

		logger.debug(`[HMR] Synced API topology (${globalThis.roboServer.registeredPaths.length} routes)`)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		const rollbackAttempted = error instanceof Error && 'rollbackAttempted' in error ? Boolean((error as Record<string, unknown>).rollbackAttempted) : false
		const rollbackFailed = error instanceof Error && 'rollbackFailed' in error ? Boolean((error as Record<string, unknown>).rollbackFailed) : false
		globalThis.roboServer.hmrTopologyState = {
			success: false,
			error: message,
			rollbackAttempted,
			rollbackFailed
		}
		logger.warn('[HMR] Failed to sync API topology:', error)
	}
}
