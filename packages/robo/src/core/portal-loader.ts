/**
 * Portal Loader
 *
 * Populates the portal from the manifest during Robo.start().
 * Supports both eager (production) and lazy (development) loading strategies.
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Manifest } from './manifest-api.js'
import { portal } from './portal-impl.js'
import { logger } from './logger.js'
import { getConfig } from './config.js'
import type { HandlerRecord } from '../types/common.js'
import type { HandlerEntry, RouteDefinition } from '../types/manifest-v1.js'

export interface PopulateOptions {
	/** Force eager loading regardless of mode */
	eager?: boolean
}

// Extended portal interface for internal methods
interface PortalInternal {
	initialize(mode: string): Promise<void>
	registerNamespace(namespace: string, routes: string[]): void
	registerSingularName(namespace: string, routeName: string, singularName: string): void
}

/**
 * Populate the portal from the manifest.
 * Called during Robo.start() after manifest is initialized.
 *
 * @param mode - Runtime mode ('development', 'production', or custom)
 * @param options - Population options
 */
export async function populatePortal(mode: string, options?: PopulateOptions): Promise<void> {
	const config = getConfig()

	// Determine loading strategy:
	// 1. Options override
	// 2. Config setting (portal.loading)
	// 3. Default based on mode
	// 4. Force lazy loading in mock/test mode to avoid Jest ESM module linking issues
	let eager: boolean
	if (options?.eager !== undefined) {
		eager = options.eager
	} else if (config?.portal?.loading) {
		eager = config.portal.loading === 'eager'
	} else if (process.env.ROBO_MOCK_MODE === 'true') {
		eager = false
	} else {
		eager = mode === 'production'
	}

	// Initialize portal
	const portalInternal = portal as unknown as PortalInternal
	await portalInternal.initialize(mode)

	// Get route definitions
	const routeDefs = Manifest.routeDefinitions()

	logger.debug(`Populating portal from manifest (${eager ? 'eager' : 'lazy'} loading)`)

	// Phase 1: Register namespaces and collect route work (no I/O needed)
	const routeWork: Array<{ namespace: string; routeName: string; routeConfig: RouteDefinition }> = []

	for (const [namespace, namespaceConfig] of Object.entries(routeDefs)) {
		logger.debug(`Processing namespace: ${namespace}`)

		const routeNames = Object.keys(namespaceConfig.routes)
		portalInternal.registerNamespace(namespace, routeNames)

		for (const [routeName, routeConfig] of Object.entries(namespaceConfig.routes)) {
			if (routeConfig.singular) {
				portalInternal.registerSingularName(namespace, routeName, routeConfig.singular)
			}
			routeWork.push({ namespace, routeName, routeConfig })
		}
	}

	// Phase 2: Load all manifests in parallel
	const loadedRoutes = await Promise.all(
		routeWork.map(async ({ namespace, routeName, routeConfig }) => {
			const entries = await Manifest.load(namespace, routeName)
			return { namespace, routeName, routeConfig, entries }
		})
	)

	// Phase 3: Process results and register with portal (sync, fast)
	const eagerImports: Promise<void>[] = []
	const controllerRegistrations: Promise<void>[] = []

	for (const { namespace, routeName, routeConfig, entries } of loadedRoutes) {
		logger.debug(`Loaded ${entries.length} entries for route: ${namespace}.${routeName}`)

		if (entries.length === 0) {
			logger.debug(`No entries for route: ${namespace}.${routeName}`)
			continue
		}

		const handlers = createHandlerRecords(entries, namespace, routeName, routeConfig)
		logger.debug(`Created ${Object.keys(handlers).length} handler records for ${namespace}.${routeName}`)

		portal.registerRoute(namespace, routeName, handlers)

		if (eager) {
			eagerImports.push(importAllHandlers(namespace, routeName, handlers))
		}

		if (routeConfig.controller?.factory) {
			controllerRegistrations.push(registerControllerFactory(namespace, routeName, routeConfig.controller.factory))
		}
	}

	// Phase 4: Eager imports and controller registrations in parallel
	if (eagerImports.length > 0 || controllerRegistrations.length > 0) {
		await Promise.all([...eagerImports, ...controllerRegistrations])
	}

	logger.debug('Portal population complete')
}

/**
 * Create handler records from manifest entries.
 */
function createHandlerRecords(
	entries: HandlerEntry[],
	namespace: string,
	route: string,
	routeConfig: RouteDefinition
): Record<string, HandlerRecord | HandlerRecord[]> {
	const handlers: Record<string, HandlerRecord | HandlerRecord[]> = {}

	for (const entry of entries) {
		const record: HandlerRecord = {
			// Handler is null until lazy imported
			handler: null,

			// Exports info from manifest (available before import)
			exports: {
				default: entry.exports?.default ?? true,
				config: entry.exports?.config ?? false,
				named: entry.exports?.named ?? []
			},

			// Core identifiers
			key: entry.key,
			type: `${namespace}:${route}`,
			path: entry.path,

			// Metadata from config export
			metadata: entry.metadata ?? {},

			// Plugin info
			plugin: entry.plugin
				? { name: entry.plugin, version: entry.pluginVersion ?? 'unknown' }
				: undefined,

			// Module for cross-cutting enable/disable
			module: entry.module,

			// Auto-generated flag
			auto: entry.auto,

			// Runtime enabled state
			enabled: true
		}

		// Handle multiple handlers per key (like events)
		if (routeConfig.multiple) {
			if (!handlers[entry.key]) {
				handlers[entry.key] = []
			}
			(handlers[entry.key] as HandlerRecord[]).push(record)
		} else {
			handlers[entry.key] = record
		}
	}

	return handlers
}

/**
 * Import all handlers eagerly.
 * Used in production mode for faster runtime access.
 */
async function importAllHandlers(
	namespace: string,
	route: string,
	handlers: Record<string, HandlerRecord | HandlerRecord[]>
): Promise<void> {
	const importPromises: Promise<void>[] = []

	for (const [key, recordOrArray] of Object.entries(handlers)) {
		const records = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray]

		for (let i = 0; i < records.length; i++) {
			// For arrays, use index-based key
			const importKey = records.length > 1 ? `${key}[${i}]` : key
			importPromises.push(
				portal.importHandler(namespace, route, key).catch((error) => {
					logger.error(`Failed to import handler ${namespace}.${route}['${importKey}']:`, error)
				})
			)
		}
	}

	await Promise.all(importPromises)
}

/**
 * Register a controller factory from the route definition.
 */
async function registerControllerFactory(
	namespace: string,
	routeName: string,
	factoryPath: string
): Promise<void> {
	try {
		// Factory path format: 'module-path#exportName'
		const [modulePath, exportName] = factoryPath.split('#')

		if (!modulePath || !exportName) {
			logger.warn(`Invalid controller factory path: ${factoryPath}`)
			return
		}

		// Resolve relative paths
		let importPath = modulePath
		if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
			// Look up the plugin that provides this namespace
			const plugins = Manifest.plugins()
			const plugin = plugins.find((p) => p.namespace === namespace)

			let basePath: string
			if (plugin) {
				// Resolve from plugin's directory
				basePath = path.resolve(process.cwd(), plugin.path)
				logger.debug(`Resolving controller factory from plugin: ${plugin.name} at ${basePath}`)
			} else {
				// Fallback to project root
				basePath = process.cwd()
			}

			const absolutePath = path.resolve(basePath, modulePath)
			importPath = pathToFileURL(absolutePath).toString()
		}

		const factoryModule = await import(importPath)
		const factory = factoryModule[exportName]

		if (typeof factory !== 'function') {
			logger.warn(`Controller factory not found or not a function: ${factoryPath}`)
			return
		}

		portal.registerController(namespace, routeName, factory)
		logger.debug(`Registered controller factory: ${namespace}.${routeName}`)
	} catch (error) {
		logger.error(`Failed to load controller factory ${factoryPath}:`, error)
	}
}

/**
 * Reload a specific route in the portal.
 * Called by HMR when files change.
 */
export async function reloadPortalRoute(namespace: string, route: string): Promise<void> {
	await portal.reloadRoute(namespace, route)

	// Re-load entries from manifest
	const entries = await Manifest.load(namespace, route)
	const routeDefs = Manifest.routeDefinitions()
	const routeConfig = routeDefs[namespace]?.routes[route]

	if (!routeConfig) {
		logger.warn(`Route config not found for ${namespace}.${route}`)
		return
	}

	// Create new handler records
	const handlers = createHandlerRecords(entries, namespace, route, routeConfig)

	// Re-register with portal
	portal.registerRoute(namespace, route, handlers)

	logger.debug(`Reloaded portal route: ${namespace}.${route}`)
}

/**
 * Clear the portal and re-populate from manifest.
 * Called when the entire manifest needs to be reloaded.
 */
export async function repopulatePortal(mode: string, options?: PopulateOptions): Promise<void> {
	portal.clearCache()
	await populatePortal(mode, options)
}
