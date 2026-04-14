/**
 * Portal Implementation
 *
 * Namespace-based, lazy-loading portal with auto-typed access and plugin-provided controllers.
 * Uses Proxy objects for namespace access with singular/plural convention.
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Manifest } from './manifest-api.js'
import { logger } from './logger.js'
import { RoboPaths } from './paths.js'
import type { HandlerModule, HandlerRecord } from '../types/common.js'
import type {
	ControllerFactory,
	ModuleController,
	ModuleState,
	PortalAPI,
	PortalNamespaces,
	ScopedPortal
} from '../types/portal.js'
import type { HandlerEntry, RouteDefinition } from '../types/manifest-v1.js'

/** Timestamp counter for cache busting ES module imports */
let importCacheBuster = Date.now()

/**
 * Internal namespace data structure.
 * Maps route names to handler records.
 */
type NamespaceData = Map<string, Record<string, HandlerRecord | HandlerRecord[]>>

interface RouteSnapshot {
	namespace: string
	route: string
	handlers: Record<string, HandlerRecord | HandlerRecord[]>
	controllerFactory?: ControllerFactory
}

/**
 * Implementation of the Portal API.
 */
class PortalImpl implements PortalAPI {
	private _namespaces: Map<string, NamespaceData> = new Map()
	private _namespaceRoutes: Map<string, string[]> = new Map() // Track route names per namespace
	private _singularNames: Map<string, Map<string, string>> = new Map() // namespace -> route -> singular
	private _controllers: Map<string, Map<string, ControllerFactory>> = new Map()
	private _pluginStates: Map<string, unknown> = new Map()
	private _modules: Map<string, ModuleState> = new Map()
	private _namespaceProxies: Map<string, unknown> = new Map()
	private _mode: string = 'production'
	private _initialized = false
	private _routeLoads: Map<string, Promise<void>> = new Map()
	private _initializedControllers: Set<string> = new Set()

	get mode(): string {
		return this._mode
	}

	get isInitialized(): boolean {
		return this._initialized
	}

	/**
	 * Initialize the portal.
	 * Called during Robo.start() after manifest is initialized.
	 */
	async initialize(mode: string): Promise<void> {
		this._mode = mode
		this._initialized = true
		logger.debug(`Portal initialized in ${mode} mode`)
	}

	/**
	 * Register a namespace with its route names.
	 * Called during portal population.
	 */
	registerNamespace(namespace: string, routes: string[]): void {
		this._namespaceRoutes.set(namespace, routes)
		if (!this._namespaces.has(namespace)) {
			this._namespaces.set(namespace, new Map())
		}
		logger.debug(`Registered namespace: ${namespace} with routes: ${routes.join(', ')}`)
	}

	/**
	 * Get a namespace proxy that provides access to routes.
	 * Implements singular/plural convention:
	 * - `commands` (plural) → returns Record of handlers
	 * - `command` (singular) → returns controller factory function
	 *
	 * Note: This is public because it's accessed dynamically via the Proxy handler.
	 */
	getNamespace(name: string): unknown {
		// Return cached proxy if exists
		if (this._namespaceProxies.has(name)) {
			return this._namespaceProxies.get(name)
		}

		// Ensure namespace data exists
		if (!this._namespaces.has(name)) {
			this._namespaces.set(name, new Map())
		}

		const namespaceData = this._namespaces.get(name)!
		const controllers = this._controllers.get(name) ?? new Map()
		const pluginState = this._pluginStates.get(name)
		const singularMap = this._singularNames.get(name) ?? new Map()

		// Build reverse mapping: singular name -> plural (route) name
		const singularToPlural = new Map<string, string>()
		for (const [routeName, singularName] of singularMap.entries()) {
			singularToPlural.set(singularName, routeName)
		}

		// Create proxy for namespace access
		const proxy = new Proxy(
			{},
			{
				get: (_target, prop: string) => {
					// Data access (plural/route name) - return the Record directly
					if (namespaceData.has(prop)) {
						return namespaceData.get(prop)
					}

					// Controller access (singular) - return factory wrapper
					// First check if this is a registered singular name
					let routeName = singularToPlural.get(prop)

					// Fallback: try simple +s pluralization
					if (!routeName && namespaceData.has(prop + 's')) {
						routeName = prop + 's'
					}

					if (routeName && controllers.has(routeName)) {
						const factory = controllers.get(routeName)!
						const data = namespaceData.get(routeName)!

						// Return a function that creates controllers
						return (key: string) => {
							const recordOrArray = data[key]
							if (!recordOrArray) {
								throw new Error(`Handler not found: ${name}.${routeName}['${key}']`)
							}

							// For multiple handlers (like events), return first record
							const record = Array.isArray(recordOrArray) ? recordOrArray[0] : recordOrArray
							return factory(key, record, pluginState)
						}
					}

					return undefined
				},

				has: (_target, prop: string) => {
					if (namespaceData.has(prop)) return true
					if (singularToPlural.has(prop)) return true
					if (namespaceData.has(prop + 's')) return true
					return false
				},

				ownKeys: () => {
					// Return both route names and their singular accessors
					const keys = Array.from(namespaceData.keys())
					for (const singular of singularToPlural.keys()) {
						if (!keys.includes(singular)) {
							keys.push(singular)
						}
					}
					return keys
				},

				getOwnPropertyDescriptor: (_target, prop: string) => {
					if (namespaceData.has(prop)) {
						return {
							configurable: true,
							enumerable: true,
							value: namespaceData.get(prop)
						}
					}
					return undefined
				}
			}
		)

		this._namespaceProxies.set(name, proxy)
		return proxy
	}

	/**
	 * Register the singular accessor name for a route.
	 * Called during portal population from route config.
	 */
	registerSingularName(namespace: string, routeName: string, singularName: string): void {
		if (!this._singularNames.has(namespace)) {
			this._singularNames.set(namespace, new Map())
		}
		this._singularNames.get(namespace)!.set(routeName, singularName)
	}

	/**
	 * Register handlers for a route.
	 * Called during portal population.
	 */
	registerRoute(
		namespace: string,
		routeName: string,
		handlers: Record<string, HandlerRecord | HandlerRecord[]>
	): void {
		if (!this._namespaces.has(namespace)) {
			this._namespaces.set(namespace, new Map())
		}

		this._namespaces.get(namespace)!.set(routeName, handlers)

		// Clear cached proxy so it picks up new data
		this._namespaceProxies.delete(namespace)

		logger.debug(`Registered route: ${namespace}.${routeName} (${Object.keys(handlers).length} handlers)`)
	}

	/**
	 * Register a controller factory for a route.
	 * Called during plugin initialization from route's exported controller.
	 */
	registerController(namespace: string, routeName: string, factory: ControllerFactory): void {
		if (!this._controllers.has(namespace)) {
			this._controllers.set(namespace, new Map())
		}

		this._controllers.get(namespace)!.set(routeName, factory)

		// Clear cached proxy so it picks up new controller
		this._namespaceProxies.delete(namespace)

		logger.debug(`Registered controller: ${namespace}.${routeName}`)
	}

	/**
	 * Register plugin state for controller access.
	 */
	registerPluginState(namespace: string, state: unknown): void {
		this._pluginStates.set(namespace, state)
	}

	/**
	 * Import a handler if not already imported.
	 * Called automatically by getHandler(), or manually for eager loading.
	 *
	 * @param namespace - Namespace (e.g., 'discord')
	 * @param route - Route name (e.g., 'commands')
	 * @param key - Handler key (e.g., 'ping')
	 * @param bustCache - Use cache-busting URL for HMR reloads
	 */
	async importHandler(namespace: string, route: string, key: string, bustCache = false): Promise<void> {
		await this.ensureRoute(namespace, route)

		const record = this.getRecord(namespace, route, key)
		if (!record) {
			throw new Error(`Handler not found: ${namespace}.${route}['${key}']`)
		}

		if (record.handler !== null) {
			return // Already imported
		}

		const importPath = this.getImportPath(record, bustCache)

		try {
			const module = await import(importPath)

			// Build handler module with all exports
			const handlerModule: HandlerModule = {
				default: module.default,
				config: module.config,
				module: record.module
			}

			// Add named exports from manifest
			if (record.exports?.named) {
				for (const exportName of record.exports.named) {
					handlerModule[exportName] = module[exportName]
				}
			}

			// Also add any other exports not already included
			for (const [exportKey, value] of Object.entries(module)) {
				if (!(exportKey in handlerModule)) {
					handlerModule[exportKey] = value
				}
			}

			record.handler = handlerModule
			logger.debug(`Imported handler: ${namespace}.${route}['${key}']`)
		} catch (error) {
			logger.error(`Failed to import handler ${namespace}.${route}['${key}']:`, error)
			throw error
		}
	}

	/**
	 * Import a handler directly from its record.
	 * Use this when you already have a HandlerRecord reference
	 * (e.g., iterating over multiple handlers for the same event).
	 *
	 * @param record - The handler record to import
	 * @param bustCache - Use cache-busting URL for HMR reloads
	 */
	async importRecord(record: HandlerRecord, bustCache = false): Promise<void> {
		if (record.handler !== null) {
			return // Already imported
		}

		const importPath = this.getImportPath(record, bustCache)

		try {
			const module = await import(importPath)

			// Build handler module with all exports
			const handlerModule: HandlerModule = {
				default: module.default,
				config: module.config,
				module: record.module
			}

			// Add named exports from manifest
			if (record.exports?.named) {
				for (const exportName of record.exports.named) {
					handlerModule[exportName] = module[exportName]
				}
			}

			// Also add any other exports not already included
			for (const [exportKey, value] of Object.entries(module)) {
				if (!(exportKey in handlerModule)) {
					handlerModule[exportKey] = value
				}
			}

			record.handler = handlerModule
			logger.debug(`Imported handler record: ${record.type}['${record.key}']`)
		} catch (error) {
			logger.error(`Failed to import handler record ${record.type}['${record.key}']:`, error)
			throw error
		}
	}

	/**
	 * Get a handler, importing if needed.
	 * This is the primary way plugins should access handlers.
	 */
	async getHandler<T = unknown>(namespace: string, route: string, key: string): Promise<HandlerModule<T>> {
		await this.importHandler(namespace, route, key)

		const record = this.getRecord(namespace, route, key)
		return record!.handler as HandlerModule<T>
	}

	/**
	 * Get controller for a handler.
	 * Uses the registered controller factory for the route.
	 */
	getController<C = unknown>(namespace: string, route: string, key: string): C {
		const controllers = this._controllers.get(namespace)
		const factory = controllers?.get(route)

		if (!factory) {
			throw new Error(`No controller factory registered for ${namespace}.${route}`)
		}

		const record = this.getRecord(namespace, route, key)
		if (!record) {
			throw new Error(`Handler not found: ${namespace}.${route}['${key}']`)
		}

		const pluginState = this._pluginStates.get(namespace)
		return factory(key, record, pluginState) as C
	}

	/**
	 * Get record metadata without importing handler.
	 * Useful for checking enabled state, exports, metadata, etc.
	 */
	getRecord(namespace: string, route: string, key: string): HandlerRecord | undefined {
		const namespaceData = this._namespaces.get(namespace)
		if (!namespaceData) return undefined

		const routeData = namespaceData.get(route)
		if (!routeData) return undefined

		const recordOrArray = routeData[key]
		if (!recordOrArray) return undefined

		// For multiple handlers, return first
		return Array.isArray(recordOrArray) ? recordOrArray[0] : recordOrArray
	}

	/**
	 * Ensure a route's manifest is loaded.
	 * No-op if already loaded.
	 */
	async ensureRoute(namespace: string, route: string): Promise<void> {
		const routeKey = this.getRouteKey(namespace, route)
		const namespaceData = this._namespaces.get(namespace)
		if (namespaceData?.has(route)) {
			return // Already loaded
		}

		const inFlight = this._routeLoads.get(routeKey)
		if (inFlight) {
			return inFlight
		}

		const loadPromise = (async () => {
			const entries = await Manifest.load(namespace, route)
			const routeDefs = Manifest.routeDefinitions()
			const routeConfig = routeDefs[namespace]?.routes[route]

			if (!routeConfig) {
				logger.warn(`Route config not found for ${namespace}.${route}`)
				return
			}

			const handlers = this.createHandlerRecords(entries, namespace, route, routeConfig)
			this.registerRoute(namespace, route, handlers)
			await this.ensureControllerFactory(namespace, route, routeConfig)
		})()

		this._routeLoads.set(routeKey, loadPromise)

		try {
			await loadPromise
		} finally {
			this._routeLoads.delete(routeKey)
		}
	}

	/**
	 * Module enable/disable management.
	 * Cross-cutting - affects handlers across all namespaces.
	 */
	module(name: string): ModuleController {
		if (!this._modules.has(name)) {
			this._modules.set(name, { enabled: true })
		}

		const state = this._modules.get(name)!
		const namespaces = this._namespaces

		return {
			isEnabled: () => state.enabled,

			setEnabled: (value: boolean) => {
				state.enabled = value

				// Update all handlers belonging to this module
				for (const namespaceData of namespaces.values()) {
					for (const routeData of namespaceData.values()) {
						for (const recordOrArray of Object.values(routeData)) {
							const records = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray]
							for (const record of records) {
								if (record.module === name) {
									record.enabled = value
								}
							}
						}
					}
				}
			}
		}
	}

	/**
	 * Get all handlers across all namespaces.
	 */
	all(): HandlerRecord[] {
		const result: HandlerRecord[] = []

		for (const namespaceData of this._namespaces.values()) {
			for (const routeData of namespaceData.values()) {
				for (const recordOrArray of Object.values(routeData)) {
					if (Array.isArray(recordOrArray)) {
						result.push(...recordOrArray)
					} else {
						result.push(recordOrArray)
					}
				}
			}
		}

		return result
	}

	/**
	 * Get handlers by type string.
	 * @example portal.getByType('discord:commands')
	 */
	getByType(type: string): Record<string, HandlerRecord | HandlerRecord[]> {
		const [namespace, routeName] = type.split(':')
		return this._namespaces.get(namespace)?.get(routeName) ?? {}
	}

	/**
	 * Reload a handler (for HMR).
	 * Uses atomic swap: keeps old handler if import fails.
	 */
	async reloadHandler(namespace: string, route: string, key: string): Promise<void> {
		const record = this.getRecord(namespace, route, key)
		if (record) {
			await this.atomicReloadRecord(record)
			logger.debug(`Reloaded handler: ${namespace}.${route}['${key}']`)
		}
	}

	/**
	 * Reload a handler by its file path (for HMR).
	 * More reliable than reloadHandler for events where multiple handlers share the same key.
	 * Uses atomic swap: keeps old handler if import fails.
	 */
	async reloadHandlerByPath(namespace: string, route: string, handlerPath: string): Promise<boolean> {
		logger.debug(`[HMR] reloadHandlerByPath called: namespace=${namespace}, route=${route}, handlerPath=${handlerPath}`)

		const namespaceData = this._namespaces.get(namespace)
		if (!namespaceData) {
			logger.debug(`[HMR] Namespace not found: ${namespace}. Available: ${[...this._namespaces.keys()].join(', ')}`)
			return false
		}

		const routeData = namespaceData.get(route)
		if (!routeData) {
			logger.debug(`[HMR] Route not found: ${route}. Available: ${[...namespaceData.keys()].join(', ')}`)
			return false
		}

		// Log all paths in the route for debugging
		const allPaths: string[] = []
		for (const recordOrArray of Object.values(routeData)) {
			const records = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray]
			for (const record of records) {
				allPaths.push(record.path)
			}
		}
		logger.debug(`[HMR] Looking for path: ${handlerPath}. Available paths: ${allPaths.join(', ')}`)

		// Search all handlers in the route for matching path
		for (const recordOrArray of Object.values(routeData)) {
			const records = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray]
			for (const record of records) {
				if (record.path === handlerPath) {
					logger.debug(`[HMR] Found matching record, reloading atomically...`)

					await this.atomicReloadRecord(record)

					logger.debug(`[HMR] Reloaded handler by path: ${namespace}.${route} [${handlerPath}]`)
					return true
				}
			}
		}

		logger.debug(`[HMR] Path not found in any records`)
		return false
	}

	/**
	 * Reload all handlers in a route (for HMR).
	 */
	async reloadRoute(namespace: string, route: string): Promise<void> {
		const snapshot = await this.buildRouteSnapshot(namespace, route)
		this.swapRouteSnapshot(snapshot)

		logger.debug(`Reloaded route: ${namespace}.${route}`)
	}

	/**
	 * Clear all cached data.
	 */
	clearCache(): void {
		this._namespaces.clear()
		this._namespaceRoutes.clear()
		this._singularNames.clear()
		this._controllers.clear()
		this._pluginStates.clear()
		this._modules.clear()
		this._namespaceProxies.clear()
		this._routeLoads.clear()
		this._initializedControllers.clear()
		this._initialized = false
	}

	// =========================================================================
	// Private helpers
	// =========================================================================

	private getRouteKey(namespace: string, route: string): string {
		return `${namespace}.${route}`
	}

	private async ensureControllerFactory(namespace: string, route: string, routeConfig: RouteDefinition): Promise<void> {
		const routeKey = this.getRouteKey(namespace, route)
		if (!routeConfig.controller?.factory || this._initializedControllers.has(routeKey)) {
			return
		}

		let factory: ControllerFactory | undefined
		try {
			factory = await this.loadControllerFactory(namespace, route, routeConfig)
		} catch {
			return
		}

		if (!factory) {
			return
		}

		this.registerController(namespace, route, factory)
		this._initializedControllers.add(routeKey)
		logger.debug(`Registered controller factory: ${namespace}.${route}`)
	}

	private async loadControllerFactory(
		namespace: string,
		route: string,
		routeConfig: RouteDefinition
	): Promise<ControllerFactory | undefined> {
		try {
			const [modulePath, exportName] = routeConfig.controller.factory.split('#')

			if (!modulePath || !exportName) {
				logger.warn(`Invalid controller factory path: ${routeConfig.controller.factory}`)
				return undefined
			}

			let importPath = modulePath
			if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
				const plugins = Manifest.plugins()
				const plugin = plugins.find((item) => item.namespace === namespace)

				let basePath: string
				if (plugin) {
					basePath = path.resolve(process.cwd(), plugin.path)
					logger.debug(`Resolving controller factory from plugin: ${plugin.name} at ${basePath}`)
				} else {
					basePath = process.cwd()
				}

				importPath = pathToFileURL(path.resolve(basePath, modulePath)).toString()
			}

			const factoryModule = await import(importPath)
			const factory = factoryModule[exportName]

			if (typeof factory !== 'function') {
				logger.warn(`Controller factory not found or not a function: ${routeConfig.controller.factory}`)
				return undefined
			}

			return factory as ControllerFactory
		} catch (error) {
			logger.error(`Failed to load controller factory ${routeConfig.controller.factory}:`, error)
			throw error
		}
	}

	private async buildRouteSnapshot(namespace: string, route: string): Promise<RouteSnapshot> {
		await Promise.all([
			Manifest.reload(namespace, route),
			Manifest.reloadRouteSummaries(namespace, route)
		])

		const entries = await Manifest.load(namespace, route)
		const routeDefs = Manifest.routeDefinitions()
		const routeConfig = routeDefs[namespace]?.routes[route]

		if (!routeConfig) {
			throw new Error(`Route config not found for ${namespace}.${route}`)
		}

		const handlers = this.createHandlerRecords(entries, namespace, route, routeConfig)
		const controllerFactory = routeConfig.controller?.factory
			? await this.loadControllerFactory(namespace, route, routeConfig)
			: undefined

		if (routeConfig.controller?.factory && !controllerFactory) {
			throw new Error(`Controller factory could not be resolved for ${namespace}.${route}`)
		}

		return { namespace, route, handlers, controllerFactory }
	}

	private swapRouteSnapshot(snapshot: RouteSnapshot): void {
		// Save old route data for rollback
		const namespaceData = this._namespaces.get(snapshot.namespace)
		const oldHandlers = namespaceData?.get(snapshot.route)
		const oldController = this._controllers.get(snapshot.namespace)?.get(snapshot.route)
		const routeKey = this.getRouteKey(snapshot.namespace, snapshot.route)
		const hadInitializedController = this._initializedControllers.has(routeKey)

		this.clearRoute(snapshot.namespace, snapshot.route)

		try {
			this.registerRoute(snapshot.namespace, snapshot.route, snapshot.handlers)

			if (snapshot.controllerFactory) {
				this.registerController(snapshot.namespace, snapshot.route, snapshot.controllerFactory)
				this._initializedControllers.add(routeKey)
			}
		} catch (error) {
			// Rollback: restore old route data
			if (oldHandlers) {
				this.registerRoute(snapshot.namespace, snapshot.route, oldHandlers)
			}
			if (oldController) {
				this.registerController(snapshot.namespace, snapshot.route, oldController)
			}
			if (hadInitializedController) {
				this._initializedControllers.add(routeKey)
			}
			throw error
		}
	}

	private clearRoute(namespace: string, route: string): void {
		const routeKey = this.getRouteKey(namespace, route)
		const namespaceData = this._namespaces.get(namespace)
		const routeData = namespaceData?.get(route)

		if (routeData) {
			for (const recordOrArray of Object.values(routeData)) {
				const records = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray]
				for (const record of records) {
					if (record.handler !== null) {
						this.bustImportCache(this.getImportPath(record))
					}
					record.handler = null
				}
			}

			namespaceData.delete(route)
			this._namespaceProxies.delete(namespace)
		}

		const singularMap = this._singularNames.get(namespace)
		if (singularMap) {
			singularMap.delete(route)
		}

		this._routeLoads.delete(routeKey)
		this._initializedControllers.delete(routeKey)
		this._controllers.get(namespace)?.delete(route)
	}

	/**
	 * Get the import path for a handler record.
	 * Includes cache buster for HMR support.
	 *
	 * Uses mode-specific build directory for project handlers,
	 * and standard .robo/build for plugin handlers (plugins don't have mode-specific builds).
	 */
	private getImportPath(record: HandlerRecord, bustCache = false): string {
		// Plugins don't use mode-specific builds - they're pre-built
		// Project handlers use mode-specific build directory
		const basePath = record.plugin
			? RoboPaths.pluginBuild(record.plugin.name)
			: RoboPaths.build(this._mode)

		let url = pathToFileURL(path.join(basePath, record.path)).toString()

		// Add cache buster for HMR
		if (bustCache) {
			url += `?v=${importCacheBuster}`
		}

		return url
	}

	/**
	 * Bust the import cache for a module.
	 * Increments the cache buster so next import gets fresh module.
	 */
	private bustImportCache(_importPath: string): void {
		// Increment the cache buster timestamp
		// This causes subsequent imports to use a different URL
		importCacheBuster = Date.now()
		logger.debug(`Import cache busted, next import will use v=${importCacheBuster}`)
	}

	/**
	 * Atomically reload a handler record.
	 *
	 * This method ensures that if the import fails, the old handler is preserved.
	 * This is critical for HMR resilience - a syntax error shouldn't break the handler
	 * until the developer fixes it.
	 *
	 * @param record - The handler record to reload
	 * @throws If import fails (but old handler is preserved)
	 */
	private async atomicReloadRecord(record: HandlerRecord): Promise<void> {
		// Store references for rollback on failure
		const oldHandler = record.handler
		const oldMetadata = record.metadata

		// Bust import cache so we get fresh code
		this.bustImportCache(this.getImportPath(record))

		try {
			// Import with cache busting
			const importPath = this.getImportPath(record, true)
			const module = await import(importPath)

			// Build new handler module with all exports
			const newHandler: HandlerModule = {
				default: module.default,
				config: module.config,
				module: record.module
			}

			// Add named exports from manifest
			if (record.exports?.named) {
				for (const exportName of record.exports.named) {
					newHandler[exportName] = module[exportName]
				}
			}

			// Also add any other exports not already included
			for (const [exportKey, value] of Object.entries(module)) {
				if (!(exportKey in newHandler)) {
					newHandler[exportKey] = value
				}
			}

			// Atomic swap: only update handler and metadata on success
			// Merge with existing metadata to preserve build-time fields (e.g., contextType)
			// that aren't part of the handler's config export
			record.handler = newHandler
			record.metadata = { ...record.metadata, ...(module.config ?? {}) }
		} catch (error) {
			// Preserve old handler and metadata on failure
			record.handler = oldHandler
			record.metadata = oldMetadata
			logger.error(`Failed to reload handler, keeping previous version:`, error)
			throw error
		}
	}

	/**
	 * Create handler records from manifest entries.
	 */
	private createHandlerRecords(
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
}

// Create the portal implementation instance
const portalImpl = new PortalImpl()

/**
 * The portal singleton with typed namespace access.
 * Uses Proxy to intercept property access and route to namespaces.
 */
export const portal = new Proxy(portalImpl, {
	get(target, prop: string) {
		// Forward known methods to implementation
		if (typeof prop === 'string') {
			const knownMethods = [
				'module',
				'all',
				'getByType',
				'registerNamespace',
				'registerRoute',
				'registerController',
				'registerPluginState',
				'registerSingularName',
				'importHandler',
				'importRecord',
				'getHandler',
				'getRecord',
				'getController',
				'ensureRoute',
				'reloadHandler',
				'reloadHandlerByPath',
				'reloadRoute',
				'clearCache',
				'initialize',
				'mode',
				'isInitialized'
			]

			if (knownMethods.includes(prop)) {
				const value = (target as unknown as Record<string, unknown>)[prop]
				if (typeof value === 'function') {
					return value.bind(target)
				}
				return value
			}

			// Treat unknown props as namespace access
			return (target as unknown as { getNamespace: (name: string) => unknown }).getNamespace(prop)
		}

		return undefined
	},

	has(_target, prop) {
		return typeof prop === 'string'
	}
}) as PortalImpl & PortalNamespaces

export type Portal = typeof portal

/**
 * Export the implementation class for testing
 */
export { PortalImpl }

/**
 * Create a scoped portal for a plugin.
 * Only includes routes defined by that plugin.
 * Includes both data access (plural) and controller access (singular).
 *
 * @param pluginName - The plugin package name
 * @param routes - Route definitions with name and optional singular accessor
 * @param namespace - The plugin's namespace
 */
export function createScopedPortal(
	_pluginName: string,
	routes: Array<{ name: string; singular?: string }>,
	namespace: string
): ScopedPortal {
	const ns = (portal as unknown as Record<string, unknown>)[namespace]

	if (!ns) {
		return {} as ScopedPortal
	}

	// Build scoped object with only this plugin's routes
	const scoped: Record<string, unknown> = {}

	for (const route of routes) {
		const routeName = route.name

		// Data access (plural/route name)
		scoped[routeName] = (ns as Record<string, unknown>)[routeName] ?? {}

		// Controller access (singular)
		const singularName = route.singular ?? (routeName.endsWith('s') ? routeName.slice(0, -1) : routeName)
		const singularAccessor = (ns as Record<string, unknown>)[singularName]
		if (typeof singularAccessor === 'function') {
			scoped[singularName] = singularAccessor
		}
	}

	return scoped as ScopedPortal
}
