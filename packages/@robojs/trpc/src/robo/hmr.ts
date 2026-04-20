import { portal } from 'robo.js'
import { trpcLogger } from '../core/loggers.js'
import type { HmrContext, HmrHookConfig } from 'robo.js'

export const config: HmrHookConfig = {
	namespaces: ['trpc'],
	routes: ['trpc']
}

export default async function (context: HmrContext): Promise<void> {
	try {
		// Ensure the trpc route is loaded into the portal so handler records exist
		// for subsequent HMR reloads. The portal lazy-loads routes in dev mode,
		// so without this call, reloadHandlerByPath would find an empty route.
		await portal.ensureRoute('trpc', 'trpc')

		const changedKeys: string[] = []

		for (const route of context.routes) {
			for (const handler of route.handlers) {
				changedKeys.push(handler.key)
			}
		}

		if (changedKeys.length > 0) {
			trpcLogger.debug(`[HMR] Refreshed tRPC handlers: ${changedKeys.join(', ')}`)
		}
	} catch (error) {
		trpcLogger.warn('[HMR] Failed to refresh tRPC handlers:', error)
	}
}
