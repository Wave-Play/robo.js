import { portal } from 'robo.js'
import { unregisterHandlerByPortalKey, unregisterMiddlewareByPortalKey } from '../server/handlers.js'
import { refreshSyncHandlersFromPortal } from './routes/sync.js'
import { syncLogger } from '../core/logger.js'
import type { HmrContext, HmrHookConfig } from 'robo.js'

export const config: HmrHookConfig = {
	namespaces: ['sync'],
	routes: ['sync']
}

export default async function (context: HmrContext): Promise<void> {
	try {
		const changedKeys = new Set<string>()

		for (const route of context.routes) {
			for (const handler of route.handlers) {
				if (handler.changeType === 'remove') {
					unregisterHandlerByPortalKey(handler.key)
					unregisterMiddlewareByPortalKey(handler.key)
					continue
				}

				changedKeys.add(handler.key)
			}
		}

		if (changedKeys.size > 0) {
			await refreshSyncHandlersFromPortal(portal, [...changedKeys])
		}

		syncLogger.debug('[HMR] Refreshed sync handler registry')
	} catch (error) {
		syncLogger.warn('[HMR] Failed to refresh sync handler registry:', error)
	}
}
