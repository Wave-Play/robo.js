/**
 * Prepare Hook - Server Engine Initialization
 *
 * This hook runs during Robo.start() BEFORE start hooks to:
 * 1. Initialize the HTTP server engine (Fastify or Node.js)
 * 2. Initialize engine (creates router, http server)
 * 3. Set up Vite dev server if available
 * 4. Set up plugin configuration
 * 5. Initialize plugin route registry (with defaults from manifest + user overrides)
 *
 * By running in the prepare phase, the engine and router are available to other
 * plugins (like @robojs/mock) during their prepare callbacks and start hooks.
 */
import { initDevReload } from '../core/dev-reload.js'
import { logger } from '../core/logger.js'
import { initPluginRoutes, type PluginPrefixMap } from '../core/plugin-routes.js'
import { hasDependency } from '../core/runtime-utils.js'
import { setConfig, setEngine } from '../core/server.js'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { color, Manifest, Mode } from 'robo.js'
import type { BaseEngine } from '../engines/base.js'
import type { PrepareContext } from 'robo.js'
import type { ViteDevServer } from 'vite'
import type { TunnelConfig } from '../core/tunnel/types.js'
import type { OpenAPIConfig } from '../core/openapi-generator.js'

/**
 * CORS configuration options.
 */
export interface CorsConfig {
	/** Allowed origins. Use '*' for all origins (not compatible with credentials). */
	origins?: string[] | '*'
	/** Whether to allow credentials (cookies, authorization headers). */
	credentials?: boolean
}

// Extend globalThis to include engine callbacks type (used by @robojs/mock)
declare global {
	// eslint-disable-next-line no-var
	var __roboServerEngineCallbacks: Array<(engine: BaseEngine) => void> | undefined
}

/**
 * Plugin configuration options.
 */
export interface PluginConfig {
	cors?: boolean | CorsConfig
	engine?: BaseEngine
	hostname?: string
	/**
	 * Maximum number of ports to try when configured port is in use.
	 * Set to 1 to disable auto-increment (fail if port is in use).
	 * @default 10
	 */
	maxPortAttempts?: number
	/**
	 * Plugin URL prefixes - centralized configuration for plugin route prefixing.
	 *
	 * By default, routes are **exclusive** (only accessible via the prefix).
	 * Set `exclusive: false` for additive mode (both prefixed and non-prefixed work).
	 *
	 * Example:
	 * ```typescript
	 * pluginPrefixes: {
	 *   '@robojs/mock': '/mock',  // Exclusive: only /mock/* works
	 *   // OR granular:
	 *   '@robojs/mock': {
	 *     api: '/mock-api',
	 *     static: '/mock-static',
	 *     exclusive: false  // Additive: both /mock-api/* and /* work
	 *   }
	 * }
	 * ```
	 */
	pluginPrefixes?: PluginPrefixMap
	port?: number
	prefix?: string | null | false
	vite?: ViteDevServer
	tunnel?: TunnelConfig
	openapi?: boolean | OpenAPIConfig
}

export let pluginOptions: PluginConfig = {}

/**
 * Prepare hook - Initializes the server engine and configuration
 */
export default async (context: PrepareContext<PluginConfig>) => {
	const { pluginConfig } = context
	pluginOptions = pluginConfig ?? {}
	globalThis.roboServer = {}

	// Set default options
	if (pluginOptions.prefix === undefined) {
		pluginOptions.prefix = '/api'
	}
	if (!pluginOptions.engine) {
		pluginOptions.engine = await getDefaultEngine()
	}

	// Assign config instance for `Server.config()`
	setConfig(pluginOptions)

	// Assign engine instance for `Server.getEngine()` and other plugins
	setEngine(pluginOptions.engine)
	globalThis.roboServer.engine = pluginOptions.engine

	// Initialize engine (creates router and http server)
	// This must happen before Vite setup and before engine callbacks
	// so that routes can be registered by other plugins
	let vite: ViteDevServer | undefined = pluginOptions.vite
	await pluginOptions.engine.init({ vite })

	// Set up Vite dev server if available and running via robo dev
	if (vite) {
		logger.debug('Using Vite server specified in options.')
	} else if (Mode.isDev() && (await hasDependency('vite', true))) {
		try {
			const { createServer: createViteServer } = await import('vite')
			const viteConfigPathTs = path.join(process.cwd(), 'config', 'vite.ts')
			const viteConfigPath = path.join(process.cwd(), 'config', 'vite.mjs')

			vite = await createViteServer({
				configFile: existsSync(viteConfigPathTs) ? viteConfigPathTs : existsSync(viteConfigPath) ? viteConfigPath : undefined,
				server: {
					hmr: {
						path: '/hmr',
						server: pluginOptions.engine.getHttpServer()
					},
					middlewareMode: { server: pluginOptions.engine.getHttpServer() }
				},
				// Suppress "Could not auto-determine entry point" warning for projects without HTML files
				optimizeDeps: {
					entries: []
				}
			})
			logger.debug('Vite server created successfully.')
		} catch (e) {
			logger.error(`Failed to start Vite server:`, e)
		}
	}

	// Setup Vite if available and register HMR socket bypass
	if (vite) {
		await pluginOptions.engine.setupVite(vite)

		// Prevent other plugins from registering the HMR route
		pluginOptions.engine.registerWebsocket('/hmr', () => {
			logger.debug('Vite HMR connection detected. Skipping registration...')
		})
	}

	// Call any registered engine callbacks (e.g., from @robojs/mock)
	// This allows plugins that run before us alphabetically to register
	// handlers that need the engine before start hooks run
	// NOTE: Engine is now fully initialized with router, so routes can be registered
	if (globalThis.__roboServerEngineCallbacks) {
		logger.debug(`Calling ${globalThis.__roboServerEngineCallbacks.length} engine callback(s)`)
		for (const callback of globalThis.__roboServerEngineCallbacks) {
			try {
				callback(pluginOptions.engine)
			} catch (error) {
				logger.error('Engine callback failed:', error)
			}
		}
		// Clear callbacks after calling them
		globalThis.__roboServerEngineCallbacks = undefined
	}

	// Initialize plugin route registry for prefix stripping and static asset serving
	// Merge plugin-declared defaults (from manifest) with user-configured prefixes
	const mergedPrefixes = mergePluginPrefixes(pluginOptions.pluginPrefixes)
	initPluginRoutes(mergedPrefixes)

	const prefixCount = Object.keys(mergedPrefixes).length
	if (prefixCount > 0) {
		logger.debug(`Initialized plugin route registry with ${prefixCount} plugin prefix(es)`)
	}

	// Initialize dev reload for plugin frontend hot reload (dev mode only)
	await initDevReload(pluginOptions.engine)

	logger.debug('Server engine prepared and available for other plugins')
}

/**
 * Get plugin-declared default prefixes from the manifest.
 * Plugins can declare a default `prefix` in their server config,
 * which gets stored in the manifest at build time.
 *
 * @returns Map of plugin names to their declared prefix
 */
function getPluginDefaultPrefixes(): Map<string, string> {
	const defaults = new Map<string, string>()

	try {
		const plugins = Manifest.plugins()

		for (const plugin of plugins) {
			if (plugin.prefix) {
				defaults.set(plugin.name, plugin.prefix)
			}
		}
	} catch {
		// Manifest may not be available during development or testing
		logger.debug('Could not load plugin prefixes from manifest')
	}

	return defaults
}

/**
 * Merge plugin-declared default prefixes with user-configured prefixes.
 * User configuration always takes precedence over plugin defaults.
 *
 * Resolution order (highest to lowest priority):
 * 1. User's explicit `pluginPrefixes['@plugin/name']` in server config
 * 2. Plugin's declared `pluginPrefix` from manifest (pre-computed at build)
 * 3. No prefix (backwards compatible)
 *
 * @param userPrefixes - User-configured plugin prefixes (may be undefined)
 * @returns Merged plugin prefix map
 */
function mergePluginPrefixes(userPrefixes?: PluginPrefixMap): PluginPrefixMap {
	const merged: PluginPrefixMap = {}

	// Apply plugin defaults first (from manifest)
	const pluginDefaults = getPluginDefaultPrefixes()
	for (const [name, prefix] of pluginDefaults) {
		// Store with leading slash for consistency with PluginRouteRegistry
		merged[name] = prefix.startsWith('/') ? prefix : `/${prefix}`
	}

	// User config overrides plugin defaults
	if (userPrefixes) {
		Object.assign(merged, userPrefixes)
	}

	return merged
}

/**
 * Get the default server engine based on available dependencies
 */
async function getDefaultEngine(): Promise<BaseEngine> {
	// Return Fastify if available
	const isFastifyAvailable = await hasDependency('fastify')
	if (isFastifyAvailable) {
		logger.debug(color.bold('Fastify'), 'is available. Using it as the server engine.')
		const { FastifyEngine } = await import('../engines/fastify.js')
		return new FastifyEngine()
	}

	// Default engine
	logger.debug('Using', color.bold('Node.js'), 'as the server engine.')
	const { NodeEngine } = await import('../engines/node.js')
	return new NodeEngine()
}
