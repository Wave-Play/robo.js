/**
 * Route definition for HTTP API endpoints.
 * Directory inferred from filename: /src/api/
 */
import { Manifest } from 'robo.js'
import type { RouteConfig, ScannedEntry, ProcessedEntry, PortalAPI } from 'robo.js'
import type { HandlerRecord } from 'robo.js'

/**
 * Supported HTTP methods for named exports.
 */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const
export type HttpMethodExport = (typeof HTTP_METHODS)[number]

/**
 * API handler function type.
 * Receives request and can return response data or use RoboResponse.
 */
export type ApiHandler = (request: Request) => Response | Promise<Response> | unknown | Promise<unknown>

/**
 * API handler module with exports.
 * Supports both default export and named HTTP method exports.
 */
export interface ApiHandlerModule {
	default?: ApiHandler
	config?: ApiConfig
	GET?: ApiHandler
	POST?: ApiHandler
	PUT?: ApiHandler
	DELETE?: ApiHandler
	PATCH?: ApiHandler
	OPTIONS?: ApiHandler
	HEAD?: ApiHandler
}

/**
 * API handler configuration.
 */
export interface ApiConfig {
	/** HTTP methods this endpoint responds to */
	methods?: string[]
}

/**
 * Handler type for data access (portal.server.api)
 */
export type Handler = ApiHandlerModule

/**
 * Controller type for method access (portal.server.endpoint())
 */
export interface ApiController {
	/** Get the handler key (route path) */
	key: string
	/** Execute the handler with a request */
	execute: (request: Request) => Promise<Response>
}

/**
 * Controller factory for runtime (per-handler)
 */
export function controller(key: string, record: HandlerRecord, _pluginState: unknown): ApiController {
	return {
		key,
		async execute(request: Request): Promise<Response> {
			const method = request.method.toUpperCase() as HttpMethodExport
			const handler = record.handler as ApiHandlerModule | null

			if (!handler) {
				return new Response('Not Found', { status: 404 })
			}

			const hasDefault = typeof handler.default === 'function'
			const methodExports = HTTP_METHODS.filter((m) => typeof handler[m] === 'function')

			// Compute allowed methods
			const getAllowedMethods = () => {
				const allowed = [...methodExports]
				if (hasDefault) {
					for (const m of HTTP_METHODS) {
						if (!allowed.includes(m)) {
							allowed.push(m)
						}
					}
				}
				return allowed
			}

			// Auto-handle OPTIONS if no explicit handler
			if (method === 'OPTIONS' && !handler.OPTIONS && !hasDefault) {
				const allowed = getAllowedMethods()
				return new Response(null, {
					status: 204,
					headers: { Allow: allowed.join(', ') }
				})
			}

			// Priority: named method export > default export
			let targetHandler = handler[method] ?? handler.default

			// HEAD auto-handling: use GET if no HEAD handler
			if (!targetHandler && method === 'HEAD' && handler.GET) {
				targetHandler = handler.GET
			}

			if (!targetHandler) {
				// No handler for this method - return 405
				return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
					status: 405,
					headers: {
						'Content-Type': 'application/json',
						Allow: methodExports.join(', ')
					}
				})
			}

			const result = await targetHandler(request)

			if (result instanceof Response) {
				return result
			}

			// Auto-convert to JSON response
			return new Response(JSON.stringify(result), {
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}
}

/**
 * Namespace controller for portal.server.apis.
 */
export interface ApiNamespaceController {
	get(key: string): Promise<ApiHandlerModule | null>
	list(): string[]
}

/**
 * Namespace controller factory for portal access.
 * Provides get, list methods for all API routes.
 */
export const NamespaceController = (portal: PortalAPI): ApiNamespaceController => ({
	async get(key: string): Promise<ApiHandlerModule | null> {
		try {
			// The handler module is returned with method exports at the top level
			const handler = (await portal.getHandler<ApiHandler>('server', 'api', key)) as unknown as ApiHandlerModule | null
			// Check if at least one handler exists (default or any method)
			const hasHandler = handler?.default || HTTP_METHODS.some((m) => handler?.[m])
			if (!hasHandler) {
				return null
			}
			return handler
		} catch {
			return null
		}
	},

	list(): string[] {
		return Manifest.routeSummariesSync('server', 'api').map((summary) => summary.key)
	}
})

/**
 * Route configuration - how to scan and process files.
 */
export const config: RouteConfig = {
	key: {
		style: 'filepath',
		separator: '/' // users/[id].ts → "users/[id]"
	},
	nesting: {
		maxDepth: 10, // Allow deep nesting for REST APIs
		allowIndex: true, // index.ts → ""
		dynamicSegment: /\[([^\]]+)\]/, // [param] → :param
		catchAllSegment: /\[\.\.\.\w+\]/, // [...slug] → *
		optionalCatchAll: /\[\[\.\.\.(\w+)\]\]/ // [[...slug]] → *?
	},
	exports: {
		named: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
		default: 'optional',
		config: 'optional'
	},
	description: 'HTTP API endpoints'
}

/**
 * Process each scanned API entry.
 */
export default function (entry: ScannedEntry): ProcessedEntry {
	const handlerConfig = entry.exports.config as ApiConfig | undefined

	return {
		key: entry.key,
		path: entry.filePath.replace(/\.ts$/, '.js'),
		exports: {
			default: 'default' in entry.exports,
			config: 'config' in entry.exports,
			named: Object.keys(entry.exports).filter((k) => !['default', 'config'].includes(k))
		},
		metadata: {
			methods: handlerConfig?.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
		}
	}
}
