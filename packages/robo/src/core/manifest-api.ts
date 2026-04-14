/**
 * Manifest API Singleton
 *
 * Provides lazy-loaded, type-safe access to manifest data at runtime.
 * Supports efficient loading, caching, and HMR updates.
 */

import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { logger } from './logger.js'
import type { Config } from '../types/config.js'
import type {
	AggregatedMetadata,
	EnvMetadata,
	HandlerEntry,
	HandlerSummary,
	HookEntry,
	ManifestAPI,
	ManifestOptions,
	NamespaceRouteDefinitions,
	PluginInfo,
	PluginRegistry,
	ProjectMetadata,
	RouteDefinitions,
	SeedConfig,
	SeedsIndex
} from '../types/manifest-v1.js'

/**
 * Internal cache structure for manifest data.
 */
interface ManifestCache {
	project?: ProjectMetadata
	config?: Config
	env?: EnvMetadata
	plugins?: PluginRegistry
	routeDefinitions?: RouteDefinitions
	seedsIndex?: SeedsIndex
	routes: Map<string, HandlerEntry[]>
	routeSummaries: Map<string, HandlerSummary[]>
	hooks: Map<string, HookEntry[]>
	metadata: Map<string, AggregatedMetadata>
	pluginConfigs: Map<string, Record<string, unknown>>
	seeds: Map<string, SeedConfig>
}

/**
 * Implementation of the Manifest API.
 */
class ManifestLoader implements ManifestAPI {
	private _mode: string = 'production'
	private _initialized = false
	private _cache: ManifestCache = {
		routes: new Map(),
		routeSummaries: new Map(),
		hooks: new Map(),
		metadata: new Map(),
		pluginConfigs: new Map(),
		seeds: new Map()
	}

	get mode(): string {
		return this._mode
	}

	get isInitialized(): boolean {
		return this._initialized
	}

	/**
	 * Initialize the manifest loader.
	 * Called during Robo.start() to set the mode and preload core files.
	 * @param mode - Runtime mode (supports custom modes like 'beta', 'staging', etc.)
	 */
	async initialize(mode: string): Promise<void> {
		this._mode = mode
		this._initialized = true

		// Preload core files for fast access
		try {
			await Promise.all([
				this.loadProjectMetadata(),
				this.loadRouteDefinitions(),
				this.loadPluginRegistry(),
				this._loadConfig(),
				this._loadEnvMetadata()
			])
			logger.debug(`Manifest API initialized in ${mode} mode`)
		} catch (error) {
			// Graceful fallback if granular manifest doesn't exist
			logger.debug('Granular manifest not found, falling back to legacy')
			this._initialized = false
		}
	}

	/**
	 * Get route handler entries.
	 */
	async routes(namespace: string, route: string, _options?: ManifestOptions): Promise<HandlerEntry[]> {
		return this.load(namespace, route)
	}

	/**
	 * Get route handler entries synchronously.
	 * Throws if not pre-loaded.
	 */
	routesSync(namespace: string, route: string, _options?: ManifestOptions): HandlerEntry[] {
		const key = this.routeKey(namespace, route)
		const cached = this._cache.routes.get(key)

		if (!cached) {
			throw new Error(`Route ${namespace}:${route} not loaded. Call load() first or use routes() for async access.`)
		}

		return cached
	}

	/**
	 * Get lightweight route summaries.
	 */
	async routeSummaries(namespace: string, route: string): Promise<HandlerSummary[]> {
		return this.loadRouteSummaries(namespace, route)
	}

	/**
	 * Get lightweight route summaries synchronously.
	 * Falls back to disk when not cached.
	 */
	routeSummariesSync(namespace: string, route: string): HandlerSummary[] {
		const key = this.routeKey(namespace, route)
		const cached = this._cache.routeSummaries.get(key)

		if (cached) {
			return cached
		}

		try {
			const filePath = this.manifestPath(`summaries/${namespace}.${route}.json`)
			const content = fsSync.readFileSync(filePath, 'utf-8')
			const summaries = JSON.parse(content) as HandlerSummary[]
			this._cache.routeSummaries.set(key, summaries)
			return summaries
		} catch {
			this._cache.routeSummaries.set(key, [])
			return []
		}
	}

	/**
	 * Get all route definitions.
	 */
	routeDefinitions(_options?: ManifestOptions): RouteDefinitions {
		if (!this._cache.routeDefinitions) {
			throw new Error('Route definitions not loaded. Call initialize() first.')
		}
		return this._cache.routeDefinitions
	}

	/**
	 * Get route definitions for a specific namespace.
	 */
	routeDefinitionsForNamespace(namespace: string, _options?: ManifestOptions): NamespaceRouteDefinitions | undefined {
		if (!this._cache.routeDefinitions) {
			throw new Error('Route definitions not loaded. Call initialize() first.')
		}
		return this._cache.routeDefinitions[namespace]
	}

	/**
	 * Get lifecycle hook entries.
	 * If not cached, attempts synchronous load from disk.
	 */
	hooks(hook: string, _options?: ManifestOptions): HookEntry[] {
		const cached = this._cache.hooks.get(hook)
		if (cached) {
			return cached
		}

		// Attempt synchronous load (blocking but acceptable for small hook files)
		try {
			const filePath = this.manifestPath(`hooks/${hook}.json`)
			const content = fsSync.readFileSync(filePath, 'utf-8')
			const entries = JSON.parse(content) as HookEntry[]
			this._cache.hooks.set(hook, entries)
			return entries
		} catch {
			// Hook file doesn't exist or failed to load
			return []
		}
	}

	/**
	 * Get merged config.
	 */
	config(_options?: ManifestOptions): Config {
		if (!this._cache.config) {
			throw new Error('Config not loaded. Call initialize() first.')
		}
		return this._cache.config
	}

	/**
	 * Get config for a specific plugin.
	 * Lazy loads from config/{plugin}.json if not cached.
	 */
	pluginConfig(plugin: string, _options?: ManifestOptions): Record<string, unknown> {
		const cached = this._cache.pluginConfigs.get(plugin)
		if (cached) {
			return cached
		}

		// Attempt synchronous load from individual plugin config file
		try {
			const fileName = plugin.replace(/\//g, '__')
			const filePath = this.manifestPath(`config/${fileName}.json`)
			const content = fsSync.readFileSync(filePath, 'utf-8')
			const config = JSON.parse(content) as Record<string, unknown>
			this._cache.pluginConfigs.set(plugin, config)
			return config
		} catch {
			// Plugin config file doesn't exist (plugin has no config or empty config)
			return {}
		}
	}

	/**
	 * Get environment variable status.
	 */
	env(_options?: ManifestOptions): EnvMetadata {
		if (!this._cache.env) {
			throw new Error('Environment metadata not loaded. Call initialize() first.')
		}
		return this._cache.env
	}

	/**
	 * Get all plugin info.
	 */
	plugins(_options?: ManifestOptions): PluginInfo[] {
		if (!this._cache.plugins) {
			return []
		}
		return Object.values(this._cache.plugins)
	}

	/**
	 * Get info for a specific plugin.
	 */
	plugin(name: string, _options?: ManifestOptions): PluginInfo | undefined {
		return this._cache.plugins?.[name]
	}

	/**
	 * Get aggregated metadata for a namespace.
	 * If not cached, attempts synchronous load from disk.
	 */
	metadata<T extends AggregatedMetadata = AggregatedMetadata>(
		namespace: string,
		options?: ManifestOptions
	): T | undefined
	/**
	 * Get metadata for a specific source within a namespace.
	 * Loads from metadata/raw/{namespace}.{source}.json
	 */
	metadata<T extends AggregatedMetadata = AggregatedMetadata>(
		namespace: string,
		source: string,
		options?: ManifestOptions
	): Partial<T> | undefined
	metadata<T extends AggregatedMetadata = AggregatedMetadata>(
		namespace: string,
		sourceOrOptions?: string | ManifestOptions,
		_options?: ManifestOptions
	): T | Partial<T> | undefined {
		// Determine if second param is source or options
		const isSourceOverload = typeof sourceOrOptions === 'string'
		const source = isSourceOverload ? sourceOrOptions : undefined

		if (source) {
			// Load per-source metadata from raw/ directory
			return this.loadSourceMetadata<T>(namespace, source)
		}

		// Load aggregated metadata
		const cached = this._cache.metadata.get(namespace)
		if (cached) {
			return cached as T
		}

		// Attempt synchronous load
		try {
			const filePath = this.manifestPath(`metadata/${namespace}.json`)
			const content = fsSync.readFileSync(filePath, 'utf-8')
			const metadata = JSON.parse(content) as T
			this._cache.metadata.set(namespace, metadata)
			return metadata
		} catch {
			return undefined
		}
	}

	/**
	 * Load metadata for a specific source from the raw/ directory.
	 */
	private loadSourceMetadata<T extends AggregatedMetadata = AggregatedMetadata>(
		namespace: string,
		source: string
	): Partial<T> | undefined {
		// Sanitize source name for filename (same logic as generator)
		const safeSource = source === 'project' ? 'project' : source.replace(/@/g, '').replace(/\//g, '+')
		const cacheKey = `${namespace}:${source}`

		// Check cache (using a separate key pattern for source-specific metadata)
		const cached = this._cache.metadata.get(cacheKey)
		if (cached) {
			return cached as Partial<T>
		}

		try {
			const filePath = this.manifestPath(`metadata/raw/${namespace}.${safeSource}.json`)
			const content = fsSync.readFileSync(filePath, 'utf-8')
			const metadata = JSON.parse(content) as Partial<T>
			this._cache.metadata.set(cacheKey, metadata as AggregatedMetadata)
			return metadata
		} catch {
			return undefined
		}
	}

	/**
	 * Get seed configuration for a plugin.
	 * If not cached, attempts synchronous load from disk.
	 */
	seeds(pluginName: string, _options?: ManifestOptions): SeedConfig | undefined {
		const cached = this._cache.seeds.get(pluginName)
		if (cached) {
			return cached
		}

		// Sanitize plugin name for filename (same logic as generator)
		const fileName = pluginName.replace(/@/g, '').replace(/\//g, '__')

		try {
			const filePath = this.manifestPath(`seeds/${fileName}.json`)
			const content = fsSync.readFileSync(filePath, 'utf-8')
			const seedConfig = JSON.parse(content) as SeedConfig
			this._cache.seeds.set(pluginName, seedConfig)
			return seedConfig
		} catch {
			return undefined
		}
	}

	/**
	 * Get the seeds index (map of plugin names to boolean indicating they have seeds).
	 */
	seedsIndex(_options?: ManifestOptions): SeedsIndex {
		if (this._cache.seedsIndex) {
			return this._cache.seedsIndex
		}

		try {
			const filePath = this.manifestPath('seeds/@.json')
			const content = fsSync.readFileSync(filePath, 'utf-8')
			const index = JSON.parse(content) as SeedsIndex
			this._cache.seedsIndex = index
			return index
		} catch {
			return {}
		}
	}

	/**
	 * Get project metadata.
	 */
	project(_options?: ManifestOptions): ProjectMetadata {
		if (!this._cache.project) {
			throw new Error('Project metadata not loaded. Call initialize() first.')
		}
		return this._cache.project
	}

	/**
	 * Check if a route is loaded into memory.
	 */
	isLoaded(namespace: string, route: string): boolean {
		return this._cache.routes.has(this.routeKey(namespace, route))
	}

	/**
	 * Load a route manifest into memory.
	 * Loads from the project's granular manifest which already includes merged plugin entries.
	 * Plugin entries are merged during build by mergePluginManifests().
	 */
	async load(namespace: string, route: string): Promise<HandlerEntry[]> {
		const key = this.routeKey(namespace, route)

		if (this._cache.routes.has(key)) {
			return this._cache.routes.get(key)!
		}

		const routeFile = `routes/${namespace}.${route}.json`

		// Load from project manifest (which includes merged plugin entries from build)
		const projectPath = this.manifestPath(routeFile)
		try {
			const content = await fs.readFile(projectPath, 'utf-8')
			const entries = JSON.parse(content) as HandlerEntry[]
			this._cache.routes.set(key, entries)
			return entries
		} catch {
			// Route file doesn't exist
			this._cache.routes.set(key, [])
			return []
		}
	}

	/**
	 * Reload a route manifest (for HMR).
	 */
	async reload(namespace: string, route: string): Promise<HandlerEntry[]> {
		const key = this.routeKey(namespace, route)
		this._cache.routes.delete(key)
		return this.load(namespace, route)
	}

	/**
	 * Reload a route summary manifest (for HMR).
	 */
	async reloadRouteSummaries(namespace: string, route: string): Promise<HandlerSummary[]> {
		const key = this.routeKey(namespace, route)
		this._cache.routeSummaries.delete(key)
		return this.loadRouteSummaries(namespace, route)
	}

	/**
	 * Unload a route manifest (free memory).
	 */
	unload(namespace: string, route: string): void {
		const key = this.routeKey(namespace, route)
		this._cache.routes.delete(key)
		this._cache.routeSummaries.delete(key)
	}

	/**
	 * Clear all cached data.
	 */
	clearCache(): void {
		this._cache = {
			routes: new Map(),
			routeSummaries: new Map(),
			hooks: new Map(),
			metadata: new Map(),
			pluginConfigs: new Map(),
			seeds: new Map()
		}
		this._initialized = false
	}

	// =========================================================================
	// Private helpers
	// =========================================================================

	private routeKey(namespace: string, route: string): string {
		return `${namespace}.${route}`
	}

	private manifestPath(relativePath: string): string {
		return path.join(process.cwd(), '.robo', 'manifest', this._mode, relativePath)
	}

	private async loadProjectMetadata(): Promise<void> {
		const filePath = this.manifestPath('robo.json')
		const content = await fs.readFile(filePath, 'utf-8')
		this._cache.project = JSON.parse(content)
	}

	private async loadRouteDefinitions(): Promise<void> {
		const filePath = this.manifestPath('routes/@.json')
		const content = await fs.readFile(filePath, 'utf-8')
		this._cache.routeDefinitions = JSON.parse(content)
	}

	private async loadPluginRegistry(): Promise<void> {
		const filePath = this.manifestPath('plugins.json')
		try {
			const content = await fs.readFile(filePath, 'utf-8')
			this._cache.plugins = JSON.parse(content)
		} catch {
			this._cache.plugins = {}
		}
	}

	// The following methods are for lazy loading and can be called when needed
	// They're prefixed with underscore to indicate they're internal helpers

	async _loadConfig(): Promise<void> {
		const filePath = this.manifestPath('config/@.json')
		try {
			const content = await fs.readFile(filePath, 'utf-8')
			this._cache.config = JSON.parse(content)
		} catch {
			this._cache.config = {} as Config
		}
	}

	async _loadEnvMetadata(): Promise<void> {
		const filePath = this.manifestPath('env.json')
		try {
			const content = await fs.readFile(filePath, 'utf-8')
			this._cache.env = JSON.parse(content)
		} catch {
			this._cache.env = {
				variables: {},
				summary: { total: 0, set: 0, empty: 0, missing: 0 },
				required: { satisfied: [], missing: [] }
			}
		}
	}

	async _loadHooks(hookType: string): Promise<HookEntry[]> {
		const filePath = this.manifestPath(`hooks/${hookType}.json`)
		try {
			const content = await fs.readFile(filePath, 'utf-8')
			const entries = JSON.parse(content) as HookEntry[]
			this._cache.hooks.set(hookType, entries)
			return entries
		} catch {
			return []
		}
	}

	async _loadMetadata(namespace: string): Promise<AggregatedMetadata | undefined> {
		const filePath = this.manifestPath(`metadata/${namespace}.json`)
		try {
			const content = await fs.readFile(filePath, 'utf-8')
			const metadata = JSON.parse(content) as AggregatedMetadata
			this._cache.metadata.set(namespace, metadata)
			return metadata
		} catch {
			return undefined
		}
	}

	private async loadRouteSummaries(namespace: string, route: string): Promise<HandlerSummary[]> {
		const key = this.routeKey(namespace, route)

		if (this._cache.routeSummaries.has(key)) {
			return this._cache.routeSummaries.get(key)!
		}

		const summaryFile = `summaries/${namespace}.${route}.json`
		const summaryPath = this.manifestPath(summaryFile)
		try {
			const content = await fs.readFile(summaryPath, 'utf-8')
			const summaries = JSON.parse(content) as HandlerSummary[]
			this._cache.routeSummaries.set(key, summaries)
			return summaries
		} catch {
			this._cache.routeSummaries.set(key, [])
			return []
		}
	}
}

/**
 * The Manifest API singleton.
 * Provides lazy-loaded, type-safe access to manifest data.
 */
export const Manifest: ManifestAPI = new ManifestLoader()
