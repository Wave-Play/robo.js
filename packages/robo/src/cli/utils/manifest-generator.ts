/**
 * Manifest Generator
 *
 * Generates the granular manifest system with mode-separated directories.
 * Creates individual JSON files for efficient lazy loading and debugging.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { logger } from '../../core/logger.js'
import { packageJson } from './utils.js'
import { generateEnvMetadata, extractEnvVarsFromConfig } from './env-manifest.js'
import { Compiler } from './compiler.js'
import type { Config } from '../../types/config.js'
import type { Manifest } from '../../types/manifest.js'
import type { DiscoveredRoute, ProcessedEntry, RouteEntries } from '../../types/routes.js'
import type { PluginData } from '../../types/common.js'
import type {
	AggregatedMetadata,
	HandlerEntry,
	HookEntry,
	HooksManifest,
	MetadataAggregatorRegistry,
	MetadataIndex,
	NamespaceRouteDefinitions,
	PluginInfo,
	PluginRegistry,
	ProjectMetadata,
	RouteDefinition,
	RouteDefinitionConfig,
	RouteDefinitions
} from '../../types/manifest-v1.js'

export interface ManifestGeneratorOptions {
	/** Build mode */
	mode: 'development' | 'production'
	/** Project configuration */
	config: Config
	/** Discovered route definitions */
	routes: DiscoveredRoute[]
	/** Processed route entries */
	routeEntries: RouteEntries
	/** Plugin data map */
	plugins: Map<string, PluginData>
	/** Legacy manifest for backward compatibility data */
	legacyManifest?: Manifest
	/** Hook entries discovered during build */
	hookEntries?: HooksManifest
}

/**
 * Generates the granular manifest directory structure.
 */
export class ManifestGenerator {
	private mode: 'development' | 'production'
	private config: Config
	private routes: DiscoveredRoute[]
	private routeEntries: RouteEntries
	private plugins: Map<string, PluginData>
	private legacyManifest?: Manifest
	private hookEntries: HooksManifest
	private basePath: string

	constructor(options: ManifestGeneratorOptions) {
		this.mode = options.mode
		this.config = options.config
		this.routes = options.routes
		this.routeEntries = options.routeEntries
		this.plugins = options.plugins
		this.legacyManifest = options.legacyManifest
		this.hookEntries = options.hookEntries ?? {}
		this.basePath = path.join(process.cwd(), '.robo', 'manifest', this.mode)
	}

	/**
	 * Clean and recreate the manifest directory structure.
	 * Ensures no stale files remain from previous builds.
	 */
	async ensureDirectories(): Promise<void> {
		// Clean existing manifest directory for this mode
		try {
			await fs.rm(this.basePath, { recursive: true, force: true })
		} catch {
			// Directory might not exist, that's fine
		}

		// Create fresh directory structure
		const dirs = [
			this.basePath,
			path.join(this.basePath, 'config'),
			path.join(this.basePath, 'routes'),
			path.join(this.basePath, 'hooks'),
			path.join(this.basePath, 'metadata')
		]

		for (const dir of dirs) {
			await fs.mkdir(dir, { recursive: true })
		}
	}

	/**
	 * Generate all manifest files.
	 */
	async generateAll(metadataRegistry?: MetadataAggregatorRegistry): Promise<void> {
		await this.ensureDirectories()

		// Generate core files in parallel
		await Promise.all([
			this.generateRoboJson(),
			this.generateConfigFiles(),
			this.generateEnvJson(),
			this.generatePluginsJson(),
			this.generateRoutesIndex(),
			this.generateRouteFiles(),
			this.generateHooksFiles()
		])

		// Generate metadata files (depends on route entries being available)
		await this.generateMetadataFiles(metadataRegistry)

		logger.debug(`Generated granular manifest at ${this.basePath}`)
	}

	/**
	 * Generate robo.json with project metadata.
	 */
	async generateRoboJson(): Promise<void> {
		const { isTypeScript } = Compiler.isTypescriptProject()
		const pkg = await this.readPackageJson()

		const metadata: ProjectMetadata = {
			name: pkg.name ?? 'unnamed-robo',
			version: pkg.version ?? '0.0.0',
			language: isTypeScript ? 'typescript' : 'javascript',
			roboVersion: packageJson.version,
			mode: this.mode,
			buildTime: new Date().toISOString(),
			buildHash: this.generateBuildHash()
		}

		await this.writeJson('robo.json', metadata)
	}

	/**
	 * Generate config files in the config/ directory.
	 * - config/@.json: Core robo config (without plugin options, just names)
	 * - config/{plugin}.json: Individual plugin configurations
	 */
	async generateConfigFiles(): Promise<void> {
		const writes: Promise<void>[] = []

		// Generate core robo config (strip plugin options, keep just names)
		const coreConfig = this.redactSensitiveConfig(this.config)
		if (coreConfig.plugins && Array.isArray(coreConfig.plugins)) {
			// Replace plugin entries with just names for reference
			coreConfig.plugins = coreConfig.plugins.map((plugin: unknown) => {
				if (Array.isArray(plugin)) {
					return plugin[0] // Just the plugin name
				}
				return plugin
			})
		}
		writes.push(this.writeJson('config/@.json', coreConfig))

		// Generate individual plugin config files (including empty ones for consistency)
		if (this.config.plugins) {
			for (const plugin of this.config.plugins) {
				const [name, options] = Array.isArray(plugin) ? plugin : [plugin, {}]
				const fileName = this.sanitizePluginName(name)
				const redactedOptions =
					typeof options === 'object' ? this.redactSensitiveConfig(options as Record<string, unknown>) : {}
				writes.push(this.writeJson(`config/${fileName}.json`, redactedOptions))
			}
		}

		await Promise.all(writes)
	}

	/**
	 * Sanitize plugin name for use as filename.
	 * Replaces / with __ (e.g., @robojs/ai → @robojs__ai)
	 */
	private sanitizePluginName(name: string): string {
		return name.replace(/\//g, '__')
	}

	/**
	 * Generate env.json with environment variable status.
	 */
	async generateEnvJson(): Promise<void> {
		// Collect all environment variables from config
		const configVars = extractEnvVarsFromConfig(this.config as Record<string, unknown>)

		// Add common variables
		const commonVars = [
			'NODE_ENV',
			'DISCORD_TOKEN',
			'DISCORD_CLIENT_ID',
			'DISCORD_CLIENT_SECRET',
			'PORT',
			'DATABASE_URL'
		]

		const allVars = [...new Set([...configVars, ...commonVars])]

		// Generate metadata
		const envMetadata = generateEnvMetadata(
			allVars,
			['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'] // Required for most bots
		)

		await this.writeJson('env.json', envMetadata)
	}

	/**
	 * Generate plugins.json with plugin registry.
	 */
	async generatePluginsJson(): Promise<void> {
		const registry: PluginRegistry = {}

		for (const [name, data] of this.plugins) {
			const pluginRoutes = this.routes
				.filter((r) => r.namespace === data.namespace)
				.map((r) => r.name)

			const pluginHooks = Object.keys(this.hookEntries).filter((hookType) =>
				this.hookEntries[hookType].some((h) => h.plugin === name)
			)

			registry[name] = {
				name,
				version: data.version ?? '0.0.0',
				path: data.path ?? `node_modules/${name}`,
				namespace: data.namespace ?? this.inferNamespace(name),
				routes: pluginRoutes,
				hooks: pluginHooks
			}
		}

		await this.writeJson('plugins.json', registry)
	}

	/**
	 * Generate routes/@.json with route definitions.
	 */
	async generateRoutesIndex(): Promise<void> {
		const definitions: RouteDefinitions = {}

		for (const route of this.routes) {
			if (!definitions[route.namespace]) {
				const pluginName = this.findPluginForNamespace(route.namespace)

				definitions[route.namespace] = {
					plugin: pluginName ?? 'project',
					namespace: route.namespace,
					routes: {}
				}
			}

			definitions[route.namespace].routes[route.name] = this.serializeRouteDefinition(route)
		}

		await this.writeJson('routes/@.json', definitions)
	}

	/**
	 * Generate individual route entry files.
	 */
	async generateRouteFiles(): Promise<void> {
		const writes: Promise<void>[] = []

		for (const [namespace, routes] of Object.entries(this.routeEntries)) {
			for (const [routeName, entries] of Object.entries(routes)) {
				const handlerEntries = this.processEntriesToHandlers(entries, namespace)
				const fileName = `${namespace}.${routeName}.json`

				writes.push(this.writeJson(`routes/${fileName}`, handlerEntries))
			}
		}

		await Promise.all(writes)
	}

	/**
	 * Generate hook files for each hook type.
	 */
	async generateHooksFiles(): Promise<void> {
		const writes: Promise<void>[] = []

		for (const [hookType, entries] of Object.entries(this.hookEntries)) {
			writes.push(this.writeJson(`hooks/${hookType}.json`, entries))
		}

		await Promise.all(writes)
	}

	/**
	 * Generate metadata files using registered aggregators.
	 */
	async generateMetadataFiles(registry?: MetadataAggregatorRegistry): Promise<void> {
		if (!registry || registry.size === 0) {
			return
		}

		const metadataIndex: MetadataIndex = {}
		const writes: Promise<void>[] = []

		for (const [namespace, aggregator] of registry) {
			// Collect all entries for this namespace
			const namespaceEntries = this.routeEntries[namespace]
			if (!namespaceEntries) {
				continue
			}

			const allEntries: HandlerEntry[] = []
			for (const entries of Object.values(namespaceEntries)) {
				allEntries.push(...this.processEntriesToHandlers(entries, namespace))
			}

			// Get plugin defaults
			const pluginName = this.findPluginForNamespace(namespace)
			const pluginDefaults = pluginName ? this.getPluginDefaults(pluginName) : {}

			// Run aggregator
			const aggregated = aggregator(allEntries, pluginDefaults)

			// Update index
			metadataIndex[namespace] = {
				sources: aggregated.sources,
				aggregatedFile: `${namespace}.json`,
				lastAggregated: new Date().toISOString()
			}

			// Write aggregated metadata
			writes.push(this.writeJson(`metadata/${namespace}.json`, aggregated))
		}

		// Write index
		writes.push(this.writeJson('metadata/@.json', metadataIndex))

		await Promise.all(writes)
	}

	// =========================================================================
	// Private helpers
	// =========================================================================

	private async writeJson(relativePath: string, data: unknown): Promise<void> {
		const fullPath = path.join(this.basePath, relativePath)
		await fs.writeFile(fullPath, this.safeStringify(data))
	}

	/**
	 * Safely stringify data, handling circular references and non-serializable values.
	 */
	private safeStringify(data: unknown): string {
		const seen = new WeakSet<object>()

		return JSON.stringify(
			data,
			(_key, value) => {
				// Handle non-object primitives
				if (value === null || typeof value !== 'object') {
					// Handle functions
					if (typeof value === 'function') {
						return '[Function]'
					}
					return value
				}

				// Handle special object types that can't be serialized
				if (value instanceof RegExp) {
					return value.toString()
				}
				if (value instanceof Date) {
					return value.toISOString()
				}
				if (value instanceof Map) {
					return { '[Map]': Array.from(value.entries()) }
				}
				if (value instanceof Set) {
					return { '[Set]': Array.from(value) }
				}

				// Check if it's a class instance (not a plain object or array)
				// Do this BEFORE circular check - class instances are always placeholders
				const proto = Object.getPrototypeOf(value)
				if (proto && proto !== Object.prototype && proto !== Array.prototype) {
					const constructorName = value.constructor?.name || 'Unknown'
					return `[${constructorName}]`
				}

				// Check for circular reference (only for plain objects/arrays)
				if (seen.has(value)) {
					return '[Circular]'
				}
				seen.add(value)

				return value
			},
			2
		)
	}

	private async readPackageJson(): Promise<Record<string, unknown>> {
		try {
			const content = await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf-8')
			return JSON.parse(content)
		} catch {
			return {}
		}
	}

	private generateBuildHash(): string {
		const content = JSON.stringify({
			mode: this.mode,
			routes: Object.keys(this.routeEntries),
			time: Date.now()
		})
		return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8)
	}

	private redactSensitiveConfig(
		config: Record<string, unknown>,
		seen: WeakSet<object> = new WeakSet()
	): Record<string, unknown> {
		// Guard against circular references
		if (seen.has(config)) {
			return { '[Circular]': true }
		}
		seen.add(config)

		const sensitiveKeys = ['token', 'secret', 'password', 'key', 'apiKey', 'api_key']
		const result: Record<string, unknown> = {}

		for (const [key, value] of Object.entries(config)) {
			const isSecret = sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))

			if (isSecret && typeof value === 'string') {
				// Reference environment variable
				const envKey = key.toUpperCase().replace(/([a-z])([A-Z])/g, '$1_$2')
				result[key] = `{{${envKey}}}`
			} else if (value && typeof value === 'object' && !Array.isArray(value)) {
				// Check if it's a class instance (not a plain object)
				const proto = Object.getPrototypeOf(value)
				if (proto && proto !== Object.prototype) {
					// Class instance - let safeStringify handle it
					result[key] = value
				} else {
					result[key] = this.redactSensitiveConfig(value as Record<string, unknown>, seen)
				}
			} else {
				result[key] = value
			}
		}

		return result
	}

	private serializeRouteDefinition(route: DiscoveredRoute): RouteDefinition {
		const config: RouteDefinitionConfig = {
			key: {
				style: route.config.key.style,
				separator: route.config.key.separator,
				nested: route.config.key.nested
			}
		}

		if (route.config.nesting) {
			config.nesting = {
				maxDepth: route.config.nesting.maxDepth,
				allowIndex: route.config.nesting.allowIndex,
				dynamicSegment: route.config.nesting.dynamicSegment?.source,
				catchAllSegment: route.config.nesting.catchAllSegment?.source,
				optionalCatchAll: route.config.nesting.optionalCatchAll?.source
			}
		}

		if (route.config.exports) {
			config.exports = route.config.exports
		}

		if (route.config.multiple !== undefined) {
			config.multiple = route.config.multiple
		}

		if (route.config.filter) {
			config.filter = route.config.filter.source
		}

		if (route.config.description) {
			config.description = route.config.description
		}

		const definition: RouteDefinition = {
			directory: route.directory,
			config
		}

		// Add type info if available
		if (route.typeInfo?.handlerType) {
			definition.handler = {
				type: route.typeInfo.handlerType,
				import: this.findPluginForNamespace(route.namespace) ?? 'robo.js'
			}
		}

		if (route.controller) {
			const pluginName = this.findPluginForNamespace(route.namespace)
			definition.controller = {
				type: route.typeInfo?.controllerType ?? 'unknown',
				import: pluginName ?? 'robo.js',
				factory: `${pluginName}/controllers#create${route.name.charAt(0).toUpperCase() + route.name.slice(1)}Controller`
			}
		}

		return definition
	}

	private processEntriesToHandlers(entries: ProcessedEntry[], namespace: string): HandlerEntry[] {
		return entries.map((entry, index) => {
			// Determine source
			const isPlugin = entry.module?.startsWith('@') || entry.module?.startsWith('robo-plugin-')
			const plugin = isPlugin ? entry.module : null

			// Generate ID
			let id = entry.key
			if (plugin) {
				id = `${plugin}:${entry.key}`
			}
			if (entries.filter((e) => e.key === entry.key).length > 1) {
				id = `${id}:${index}`
			}

			const handlerEntry: HandlerEntry = {
				...entry,
				id,
				source: plugin ? 'plugin' : 'project',
				plugin
			}

			// Add index for multiple handlers
			if (entries.filter((e) => e.key === entry.key).length > 1) {
				handlerEntry.index = index
			}

			return handlerEntry
		})
	}

	private findPluginForNamespace(namespace: string): string | null {
		for (const [name, data] of this.plugins) {
			if (data.namespace === namespace) {
				return name
			}
		}
		return null
	}

	private inferNamespace(pluginName: string): string {
		// @robojs/discord → discord
		// @robojs/server → server
		// robo-plugin-analytics → analytics
		if (pluginName.startsWith('@robojs/')) {
			return pluginName.replace('@robojs/', '')
		}
		if (pluginName.startsWith('robo-plugin-')) {
			return pluginName.replace('robo-plugin-', '')
		}
		return pluginName
	}

	private getPluginDefaults(pluginName: string): Record<string, unknown> {
		// Extract defaults from plugin config if available
		if (!this.config.plugins) {
			return {}
		}

		for (const plugin of this.config.plugins) {
			const [name, options] = Array.isArray(plugin) ? plugin : [plugin, {}]
			if (name === pluginName && typeof options === 'object') {
				return options as Record<string, unknown>
			}
		}

		return {}
	}
}

/**
 * Discover project hooks from the built .robo/build/robo/ directory.
 * Returns a Map of hook type to relative path.
 */
export async function discoverProjectHooks(buildDir?: string): Promise<Map<string, string>> {
	const projectHooks = new Map<string, string>()
	const roboDir = path.join(buildDir ?? path.join(process.cwd(), '.robo', 'build'), 'robo')

	// Standard lifecycle hooks
	const lifecycleHooks = ['setup', 'init', 'start', 'stop']
	for (const hook of lifecycleHooks) {
		const hookPath = path.join(roboDir, `${hook}.js`)
		try {
			await fs.access(hookPath)
			projectHooks.set(hook, `robo/${hook}.js`)
		} catch {
			// Hook doesn't exist
		}
	}

	// Build hooks in robo/build/ subdirectory
	const buildHooksDir = path.join(roboDir, 'build')
	const buildPhases = ['start', 'transform', 'complete'] as const
	for (const phase of buildPhases) {
		const hookPath = path.join(buildHooksDir, `${phase}.js`)
		try {
			await fs.access(hookPath)
			projectHooks.set(`build:${phase}`, `robo/build/${phase}.js`)
		} catch {
			// Hook doesn't exist
		}
	}

	return projectHooks
}

/**
 * Create hook entries from discovered hooks during build.
 */
export function createHookEntries(
	plugins: Map<string, PluginData>,
	projectHooks: Map<string, string>
): HooksManifest {
	const hooks: HooksManifest = {}

	// Add plugin hooks
	for (const [pluginName, data] of plugins) {
		const pluginHooks = data.hooks ?? []

		for (const hook of pluginHooks) {
			if (!hooks[hook.type]) {
				hooks[hook.type] = []
			}

			const entry: HookEntry = {
				id: `${pluginName}:${hook.type}`,
				source: 'plugin',
				plugin: pluginName,
				path: hook.path,
				priority: hook.priority ?? 10
			}

			if (hook.phase) {
				entry.phase = hook.phase
			}

			hooks[hook.type].push(entry)
		}
	}

	// Add project hooks
	for (const [hookType, hookPath] of projectHooks) {
		// Determine the canonical hook type (handle build:phase format)
		let canonicalType = hookType
		let phase: 'start' | 'transform' | 'complete' | undefined

		if (hookType.startsWith('build:')) {
			canonicalType = 'build'
			phase = hookType.split(':')[1] as 'start' | 'transform' | 'complete'
		}

		if (!hooks[canonicalType]) {
			hooks[canonicalType] = []
		}

		const entry: HookEntry = {
			id: `project:${hookType}`,
			source: 'project',
			plugin: null,
			path: hookPath,
			priority: 0
		}

		if (phase) {
			entry.phase = phase
		}

		hooks[canonicalType].push(entry)
	}

	// Sort hooks by priority
	for (const hookType of Object.keys(hooks)) {
		hooks[hookType].sort((a, b) => a.priority - b.priority)
	}

	return hooks
}
