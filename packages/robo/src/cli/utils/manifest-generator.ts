/**
 * Manifest Generator
 *
 * Generates the granular manifest system with mode-separated directories.
 * Creates individual JSON files for efficient lazy loading and debugging.
 */

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { logger } from '../../core/logger.js'
import { packageJson } from './utils.js'
import { generateEnvMetadata, extractEnvVarsFromConfig } from './env-manifest.js'
import { Compiler } from './compiler.js'
import { discoverAllCli } from './cli-discovery.js'
import type { Config } from '../../types/config.js'
import type { DiscoveredRoute, ProcessedEntry, RouteEntries } from '../../types/routes.js'
import type { PluginData } from '../../types/common.js'
import type {
	HandlerEntry,
	HookEntry,
	HooksManifest,
	MetadataAggregatorRegistry,
	MetadataIndex,
	PluginRegistry,
	ProjectMetadata,
	RouteDefinition,
	RouteDefinitions,
	SeedConfig,
	SeedsIndex
} from '../../types/manifest-v1.js'

export interface ManifestGeneratorOptions {
	/** Build mode (supports custom modes like 'beta', 'staging', etc.) */
	mode: string
	/** Project configuration */
	config: Config
	/** Discovered route definitions */
	routes: DiscoveredRoute[]
	/** Processed route entries */
	routeEntries: RouteEntries
	/** Plugin data map */
	plugins: Map<string, PluginData>
	/** Hook entries discovered during build */
	hookEntries?: HooksManifest
	/** Build type: 'robo' for projects, 'plugin' for plugin builds */
	buildType?: 'robo' | 'plugin'
	/** For plugin builds: the name of the plugin being built */
	pluginName?: string
}

/**
 * Generates the granular manifest directory structure.
 */
export class ManifestGenerator {
	private mode: string
	private config: Config
	private routes: DiscoveredRoute[]
	private routeEntries: RouteEntries
	private plugins: Map<string, PluginData>
	private hookEntries: HooksManifest
	private basePath: string
	private buildType: 'robo' | 'plugin'
	private pluginName?: string

	constructor(options: ManifestGeneratorOptions) {
		this.mode = options.mode
		this.config = options.config
		this.routes = options.routes
		this.routeEntries = options.routeEntries
		this.plugins = options.plugins
		this.hookEntries = options.hookEntries ?? {}
		this.basePath = path.join(process.cwd(), '.robo', 'manifest', this.mode)
		this.buildType = options.buildType ?? 'robo'
		this.pluginName = options.pluginName
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
			path.join(this.basePath, 'metadata'),
			path.join(this.basePath, 'metadata', 'raw'),
			path.join(this.basePath, 'seeds'),
			path.join(this.basePath, 'cli')
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
			this.generateHooksFiles(),
			this.generateSeedsFiles(),
			this.generateCliFiles()
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
			'PORT',
			'DATABASE_URL'
		]

		const allVars = [...new Set([...configVars, ...commonVars])]

		// Generate metadata (no required vars by default - plugins can register their own)
		const envMetadata = generateEnvMetadata(allVars, [])

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

			// Extract prefix from plugin's server config (if any)
			const prefix = await this.extractPluginPrefix(name)

			registry[name] = {
				name,
				version: data.version ?? '0.0.0',
				path: data.path ?? `node_modules/${name}`,
				namespace: data.namespace ?? this.inferNamespace(name),
				routes: pluginRoutes,
				hooks: pluginHooks,
				...(prefix && { prefix })
			}
		}

		await this.writeJson('plugins.json', registry)
	}

	/**
	 * Extract prefix from a plugin's server config.
	 * Checks multiple locations where plugins may store their @robojs/server config.
	 *
	 * @param pluginName - The plugin package name
	 * @returns The prefix (normalized, without leading slash) or undefined
	 */
	private async extractPluginPrefix(pluginName: string): Promise<string | undefined> {
		const pluginPath = path.join(process.cwd(), 'node_modules', pluginName)

		// Possible locations for the server config (in order of preference)
		const configPaths = [
			// Built plugin config (from robo build plugin)
			path.join(pluginPath, '.robo', 'config', 'config', 'plugins', 'robojs', 'server.mjs'),
			path.join(pluginPath, '.robo', 'config', 'config', 'plugins', 'robojs', 'server.js'),
			// Alternative build location
			path.join(pluginPath, '.robo', 'build', 'config', 'plugins', 'robojs', 'server.js'),
			// Source files (development/monorepo)
			path.join(pluginPath, 'config', 'plugins', 'robojs', 'server.mjs'),
			path.join(pluginPath, 'config', 'plugins', 'robojs', 'server.js'),
			path.join(pluginPath, 'config', 'plugins', 'robojs', 'server.ts')
		]

		for (const configPath of configPaths) {
			if (!existsSync(configPath)) {
				continue
			}

			try {
				// Dynamic import of the config file
				const configUrl = pathToFileURL(configPath).href
				const configModule = await import(configUrl)
				const serverConfig = configModule.default ?? configModule

				if (serverConfig?.prefix) {
					// Normalize: remove leading slash if present
					return serverConfig.prefix.replace(/^\//, '')
				}
			} catch (error) {
				logger.debug(`Failed to load server config for ${pluginName}:`, error)
			}
		}

		return undefined
	}

	/**
	 * Generate routes/@.json with route definitions.
	 */
	async generateRoutesIndex(): Promise<void> {
		const definitions: RouteDefinitions = {}

		for (const route of this.routes) {
			// For plugin builds, remap "project" namespace to the plugin's namespace
			const namespace = this.buildType === 'plugin' && route.namespace === 'project' && this.pluginName
				? this.inferNamespace(this.pluginName)
				: route.namespace

			if (!definitions[namespace]) {
				const pluginName = this.buildType === 'plugin' && this.pluginName
					? this.pluginName
					: this.findPluginForNamespace(namespace)

				definitions[namespace] = {
					plugin: pluginName ?? 'project',
					namespace: namespace,
					routes: {}
				}
			}

			definitions[namespace].routes[route.name] = this.serializeRouteDefinition(route)
		}

		await this.writeJson('routes/@.json', definitions)
	}

	/**
	 * Generate individual route entry files.
	 */
	async generateRouteFiles(): Promise<void> {
		const writes: Promise<void>[] = []

		for (const [originalNamespace, routes] of Object.entries(this.routeEntries)) {
			// For plugin builds, remap "project" namespace to the plugin's namespace
			const namespace = this.buildType === 'plugin' && originalNamespace === 'project' && this.pluginName
				? this.inferNamespace(this.pluginName)
				: originalNamespace

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
	 * Generate seeds files for plugins with seed configuration.
	 * Creates:
	 * - seeds/@.json: Index listing plugins with seeds
	 * - seeds/{pluginName}.json: Individual seed config per plugin
	 */
	async generateSeedsFiles(): Promise<void> {
		const seedsIndex: SeedsIndex = {}
		const writes: Promise<void>[] = []

		// Check each plugin for seed configuration
		for (const [pluginName, pluginData] of this.plugins) {
			if (pluginData.seed) {
				const seedConfig: SeedConfig = {
					description: pluginData.seed.description,
					env: pluginData.seed.env,
					hook: pluginData.seed.hook
				}

				// Sanitize plugin name for filename
				const fileName = this.sanitizePluginName(pluginName)
				writes.push(this.writeJson(`seeds/${fileName}.json`, seedConfig))
				seedsIndex[pluginName] = true
			}
		}

		// Only write index if there are seeds
		if (Object.keys(seedsIndex).length > 0) {
			writes.push(this.writeJson('seeds/@.json', seedsIndex))
		}

		await Promise.all(writes)
	}

	/**
	 * Generate CLI manifest files.
	 * Discovers CLI commands and extensions from plugins and project.
	 * Creates:
	 * - .robo/manifest/cli/@.json: Mode-agnostic CLI manifest
	 */
	async generateCliFiles(): Promise<void> {
		// Skip CLI discovery for plugin builds (plugins don't aggregate other plugins' CLI)
		if (this.buildType === 'plugin') {
			return
		}

		try {
			// Discover CLI commands and extensions (pass mode for correct path resolution)
			const cliManifest = await discoverAllCli(this.plugins, this.mode)

			// Only write if there are commands or extensions
			const hasContent =
				Object.keys(cliManifest.commands).length > 0 ||
				Object.keys(cliManifest.extensions).length > 0

			if (hasContent) {
				// Write to mode-agnostic location (outside the mode folder)
				const cliManifestPath = path.join(process.cwd(), '.robo', 'manifest', 'cli', '@.json')
				await fs.mkdir(path.dirname(cliManifestPath), { recursive: true })
				await fs.writeFile(cliManifestPath, this.safeStringify(cliManifest))
				logger.debug(
					`Discovered ${Object.keys(cliManifest.commands).length} CLI commands and ` +
					`${Object.keys(cliManifest.extensions).length} command extensions`
				)
			}
		} catch (error) {
			// CLI discovery is optional - don't fail the build if it errors
			logger.debug('CLI discovery failed:', error)
		}
	}

	/**
	 * Generate metadata files using registered aggregators.
	 * Creates both aggregated metadata and per-source raw breakdowns.
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

			// Write per-source raw metadata breakdowns
			const entriesBySource = this.groupEntriesBySource(allEntries)
			for (const [source, sourceEntries] of Object.entries(entriesBySource)) {
				const sourceDefaults = source === pluginName ? pluginDefaults : {}
				const sourceMetadata = aggregator(sourceEntries, sourceDefaults)
				// Sanitize source name for filename (@ → +)
				const safeSource = source === 'project' ? 'project' : source.replace(/@/g, '').replace(/\//g, '+')
				writes.push(this.writeJson(`metadata/raw/${namespace}.${safeSource}.json`, sourceMetadata))
			}
		}

		// Write index
		writes.push(this.writeJson('metadata/@.json', metadataIndex))

		await Promise.all(writes)
	}

	/**
	 * Group handler entries by their source (project or plugin name).
	 */
	private groupEntriesBySource(entries: HandlerEntry[]): Record<string, HandlerEntry[]> {
		const grouped: Record<string, HandlerEntry[]> = {}

		for (const entry of entries) {
			const source = entry.source === 'plugin' && entry.plugin ? entry.plugin : 'project'
			if (!grouped[source]) {
				grouped[source] = []
			}
			grouped[source].push(entry)
		}

		return grouped
	}

	// =========================================================================
	// Private helpers
	// =========================================================================

	private async writeJson(relativePath: string, data: unknown): Promise<void> {
		const fullPath = path.join(this.basePath, relativePath)
		await fs.mkdir(path.dirname(fullPath), { recursive: true })
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
				// Handle BigInt (must be checked before other type checks)
				if (typeof value === 'bigint') {
					return value.toString() + 'n'
				}

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
		// Build definition with properties at the route level (not nested under config)
		const definition: RouteDefinition = {
			directory: route.directory,
			key: {
				style: route.config.key.style,
				separator: route.config.key.separator,
				nested: route.config.key.nested
			}
		}

		if (route.config.nesting) {
			definition.nesting = {
				maxDepth: route.config.nesting.maxDepth,
				allowIndex: route.config.nesting.allowIndex,
				dynamicSegment: route.config.nesting.dynamicSegment?.source,
				catchAllSegment: route.config.nesting.catchAllSegment?.source,
				optionalCatchAll: route.config.nesting.optionalCatchAll?.source
			}
		}

		if (route.config.exports) {
			definition.exports = route.config.exports
		}

		if (route.config.multiple !== undefined) {
			definition.multiple = route.config.multiple
		}

		if (route.config.filter) {
			definition.filter = route.config.filter.source
		}

		if (route.config.description) {
			definition.description = route.config.description
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
			// Determine the factory path based on whether this is a plugin route or project route
			let factoryPath: string
			if (pluginName) {
				// Plugin route: use package name + dist path
				// e.g., @robojs/discordjs/dist/robo/routes/commands.js#controller
				factoryPath = `${pluginName}/dist/robo/routes/${route.name}.js#controller`
			} else {
				// Project route: use relative path from .robo/build
				// e.g., ./robo/routes/commands.js#controller
				factoryPath = `./.robo/build/robo/routes/${route.name}.js#controller`
			}
			definition.controller = {
				type: route.typeInfo?.controllerType ?? 'unknown',
				import: pluginName ?? 'robo.js',
				factory: factoryPath
			}
		}

		return definition
	}

	private processEntriesToHandlers(entries: ProcessedEntry[], namespace: string): HandlerEntry[] {
		return entries.map((entry, index) => {
			// Determine source based on build type and entry module
			let isPlugin = entry.module?.startsWith('@') || entry.module?.startsWith('robo-plugin-')
			let plugin = isPlugin ? entry.module : null

			// For plugin builds, all entries are from the plugin being built
			if (this.buildType === 'plugin' && this.pluginName) {
				isPlugin = true
				plugin = this.pluginName
			}

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
				source: isPlugin ? 'plugin' : 'project',
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
		// Normalize path separators to forward slashes for Windows compatibility
		const normalizedName = pluginName.split(path.sep).join('/')

		// @robojs/discord → discord
		// @robojs/server → server
		// robo-plugin-analytics → analytics
		if (normalizedName.startsWith('@robojs/')) {
			return normalizedName.replace('@robojs/', '')
		}
		if (normalizedName.startsWith('robo-plugin-')) {
			return normalizedName.replace('robo-plugin-', '')
		}
		return normalizedName
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
 *
 * @param plugins - Plugin data map
 * @param projectHooks - Discovered hooks from project/plugin build
 * @param buildPluginName - For plugin builds, the name of the plugin being built.
 *                          When provided, discovered hooks are attributed to this plugin.
 */
export function createHookEntries(
	plugins: Map<string, PluginData>,
	projectHooks: Map<string, string>,
	buildPluginName?: string
): HooksManifest {
	const hooks: HooksManifest = {}

	// Add plugin hooks (from already-registered plugins)
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

	// Add project/plugin hooks (discovered from build directory)
	// For plugin builds, attribute these to the plugin being built
	const isPluginBuild = !!buildPluginName
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
			id: isPluginBuild ? `${buildPluginName}:${hookType}` : `project:${hookType}`,
			source: isPluginBuild ? 'plugin' : 'project',
			plugin: isPluginBuild ? buildPluginName : null,
			path: hookPath,
			priority: isPluginBuild ? 10 : 0
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
