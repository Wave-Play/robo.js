/**
 * Route definition for Discord middleware.
 * Directory inferred from filename: /src/middleware/
 */
import type { RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'
import type { MiddlewareHandler, MiddlewareController, MiddlewareConfig } from '../../types/middleware.js'
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
 * Controller factory for runtime
 */
export { createMiddlewareController as controller }

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
