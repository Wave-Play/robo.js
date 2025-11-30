/**
 * Route definition for Discord middleware.
 * Directory inferred from filename: /src/middleware/
 */
import type { PortalAPI, RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'
import type {
	MiddlewareHandler,
	MiddlewareController,
	MiddlewareConfig,
	MiddlewareNamespaceController,
	MiddlewareChainEntry
} from '../../types/middleware.js'
import { createMiddlewareController } from '../../core/controllers.js'

/**
 * Handler type for data access (portal.discord.middleware)
 */
export type Handler = MiddlewareHandler

/**
 * Controller type for method access (portal.discord.middleware())
 */
export type Controller = MiddlewareController

/**
 * Controller factory for runtime (per-handler)
 */
export { createMiddlewareController as controller }

/**
 * Namespace controller factory for portal access.
 * Provides list, chain methods for all middleware.
 */
export const NamespaceController = (portal: PortalAPI): MiddlewareNamespaceController => ({
	list(): string[] {
		const portalApi = portal as unknown as { getByType: (type: string) => Record<string, unknown> }
		const middlewareData = portalApi.getByType('discord:middleware')
		return Object.keys(middlewareData)
	},

	async chain(): Promise<MiddlewareChainEntry[]> {
		const portalApi = portal as unknown as { getByType: (type: string) => Record<string, unknown> }
		const middlewareData = portalApi.getByType('discord:middleware')
		const entries: MiddlewareChainEntry[] = []

		for (const [key, recordOrArray] of Object.entries(middlewareData)) {
			const record = (Array.isArray(recordOrArray) ? recordOrArray[0] : recordOrArray) as {
				handler?: { default?: MiddlewareHandler }
				metadata?: { order?: number }
				enabled?: boolean
			}

			// Import handler if needed
			if (!record.handler) {
				await portal.importHandler('discord', 'middleware', key)
			}

			// Check if handler exists and middleware is enabled (default true)
			const isEnabled = record.enabled ?? true
			if (record.handler?.default && isEnabled) {
				entries.push({
					key,
					handler: record.handler.default,
					order: (record.metadata?.order as number) ?? 0,
					enabled: isEnabled
				})
			}
		}

		// Sort by order (lower runs first)
		return entries.sort((a, b) => a.order - b.order)
	}
})

/**
 * Route configuration - how to scan and process files.
 */
export const config: RouteConfig = {
	key: {
		style: 'filepath',
		separator: '/'
	},
	nesting: {
		maxDepth: 3,
		allowIndex: true
	},
	exports: {
		default: 'required',
		config: 'optional'
	},
	description: 'Discord middleware for command/event processing'
}

/**
 * Process each scanned middleware entry.
 */
export default function (entry: ScannedEntry): ProcessedEntry {
	const handlerConfig = entry.exports.config as MiddlewareConfig | undefined

	return {
		key: entry.key,
		path: entry.filePath.replace(/\.ts$/, '.js'),
		exports: {
			default: 'default' in entry.exports,
			config: 'config' in entry.exports,
			named: []
		},
		metadata: {
			order: handlerConfig?.order ?? 0,
			enabled: handlerConfig?.enabled ?? true
		}
	}
}
