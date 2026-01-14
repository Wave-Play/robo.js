import { logger } from '../../core/logger.js'
import { Env } from '../../core/env.js'
import { inferNamespace } from '../../core/hooks.js'
import { RoboPaths } from '../../core/paths.js'
import type { BuildContext, BuildCompleteContext, BuildTransformContext, BuildStore, EntriesAccessor } from '../../types/lifecycle.js'
import type { PluginData } from '../../types/common.js'
import type { Config } from '../../types/config.js'
import type { ProcessedEntry, RouteEntries } from '../../types/routes.js'
import type { AggregatedMetadata, HandlerEntry, MetadataAggregator, MetadataAggregatorRegistry } from '../../types/manifest-v1.js'
import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

/**
 * Create a new BuildStore instance.
 * Used for passing data between build hooks within the same build session.
 */
export function createBuildStore(): BuildStore {
	const data = new Map<string, unknown>()

	return {
		get<T>(key: string): T | undefined {
			return data.get(key) as T | undefined
		},
		set<T>(key: string, value: T): void {
			data.set(key, value)
		},
		has(key: string): boolean {
			return data.has(key)
		},
		delete(key: string): boolean {
			return data.delete(key)
		},
		clear(): void {
			data.clear()
		}
	}
}

/**
 * Options for build hook execution.
 * Used to pass additional context about the build type.
 */
export interface BuildHookOptions {
	/** Type of build being performed */
	buildType?: 'robo' | 'plugin'
	/** Name of the plugin being built (only set when buildType is 'plugin') */
	pluginName?: string
}

/**
 * Resolve the build hook path for a plugin (compiled JS only).
 * Plugins don't use mode-specific builds - they're pre-built.
 */
export async function resolvePluginBuildHookPath(
	pluginName: string,
	hookName: 'start' | 'transform' | 'complete'
): Promise<string | null> {
	const possiblePaths = [
		// Plugin package: node_modules/@robojs/discord/.robo/build/robo/build/start.js
		RoboPaths.pluginBuildHook(pluginName, hookName),
		// Alternative: node_modules/@robojs/discord/dist/robo/build/start.js (legacy)
		path.join(process.cwd(), 'node_modules', pluginName, 'dist', 'robo', 'build', `${hookName}.js`)
	]

	for (const hookPath of possiblePaths) {
		if (await fileExists(hookPath)) {
			return hookPath
		}
	}

	return null
}

/**
 * Resolve the build hook path for the current project (compiled JS only).
 * Uses mode-specific build directory: .robo/build/{mode}/robo/build/{hookName}.js
 *
 * @param hookName - The build hook to resolve
 * @param mode - Build mode for mode-specific path resolution
 */
export async function resolveProjectBuildHookPath(
	hookName: 'start' | 'transform' | 'complete',
	mode?: string
): Promise<string | null> {
	const hookPath = RoboPaths.buildHook(mode ?? 'production', hookName)

	if (await fileExists(hookPath)) {
		return hookPath
	}

	return null
}

/**
 * Execute build/start hooks for project and all registered plugins.
 * Project hook runs first, then all plugin hooks run in parallel.
 *
 * @param plugins - Plugin data map
 * @param config - Project configuration
 * @param mode - Build mode (supports custom modes like 'beta', 'staging', etc.)
 * @param store - Optional existing store (creates new one if not provided)
 * @param options - Optional build hook options (buildType, pluginName)
 * @returns The BuildStore for use in subsequent hooks
 */
export async function executeBuildStartHooks(
	plugins: Map<string, PluginData>,
	config: Config,
	mode: string,
	store?: BuildStore,
	options?: BuildHookOptions
): Promise<BuildStore> {
	const loggerInstance = logger()

	// Create or use existing store
	const buildStore = store ?? createBuildStore()

	// Create base context with mode-specific output path
	const baseContext: BuildContext = {
		mode,
		env: Env,
		logger: loggerInstance,
		paths: {
			root: process.cwd(),
			src: path.join(process.cwd(), 'src'),
			output: RoboPaths.build(mode)
		},
		config,
		store: buildStore,
		buildType: options?.buildType,
		pluginName: options?.pluginName
	}

	// 1. Execute project's build/start hook first (if exists)
	const projectHookPath = await resolveProjectBuildHookPath('start', mode)
	if (projectHookPath) {
		try {
			loggerInstance.debug('Executing project build/start hook...')
			const hookModule = await import(pathToFileURL(projectHookPath).href)

			if (typeof hookModule.default === 'function') {
				await hookModule.default(baseContext)
			}
		} catch (error) {
			// Project build hook failure is always fatal
			loggerInstance.error('Project build/start hook failed:', error)
			throw error
		}
	}

	// 2. Execute plugin build/start hooks in parallel
	const hookPromises: Promise<void>[] = []

	for (const [pluginName, pluginData] of plugins) {
		const hookPromise = (async () => {
			const hookPath = await resolvePluginBuildHookPath(pluginName, 'start')

			if (!hookPath) {
				return // Plugin doesn't have a build/start hook
			}

			const context: BuildContext = {
				...baseContext,
				logger: loggerInstance.fork(inferNamespace(pluginName))
			}

			try {
				loggerInstance.debug(`Executing build/start hook for ${pluginName}...`)
				const hookModule = await import(pathToFileURL(hookPath).href)

				if (typeof hookModule.default === 'function') {
					await hookModule.default(context)
				}
			} catch (error) {
				// Check failSafe meta option
				const failSafe = pluginData.metaOptions?.failSafe ?? false

				if (failSafe) {
					loggerInstance.warn(`Build/start hook for ${pluginName} failed (failSafe enabled):`, error)
				} else {
					loggerInstance.error(`Build/start hook for ${pluginName} failed:`, error)
					throw error
				}
			}
		})()

		hookPromises.push(hookPromise)
	}

	await Promise.all(hookPromises)

	return buildStore
}

/**
 * Execute build/transform hooks for project and all registered plugins.
 * Project hook runs first, then all plugin hooks run in parallel.
 * Each hook can filter/transform the entries array.
 *
 * @param plugins - Plugin data map
 * @param config - Project configuration
 * @param mode - Build mode
 * @param store - BuildStore from previous hooks
 * @param entries - Route entries to transform
 * @param options - Optional build hook options (buildType, pluginName)
 * @returns Transformed route entries
 */
export async function executeBuildTransformHooks(
	plugins: Map<string, PluginData>,
	config: Config,
	mode: string,
	store: BuildStore,
	entries: RouteEntries,
	options?: BuildHookOptions
): Promise<RouteEntries> {
	const loggerInstance = logger()

	// Create entries accessor for read-only inspection via context
	const entriesAccessor: EntriesAccessor = {
		get(namespace: string, route: string): ProcessedEntry[] {
			return entries?.[namespace]?.[route] ?? []
		},
		all(): RouteEntries {
			return entries ?? {}
		},
		handlers(namespace: string, route: string): HandlerEntry[] {
			const routeEntries = entries?.[namespace]?.[route] ?? []
			return routeEntries.map((entry, index) => {
				const plugin =
					entry.module?.startsWith('@') || entry.module?.startsWith('robo-plugin-') ? entry.module : null
				let id = entry.key
				if (plugin) {
					id = `${plugin}:${entry.key}`
				}
				if (routeEntries.filter((e) => e.key === entry.key).length > 1) {
					id = `${id}:${index}`
				}

				return {
					...entry,
					id,
					source: plugin ? 'plugin' : 'project',
					plugin,
					index: routeEntries.filter((e) => e.key === entry.key).length > 1 ? index : undefined
				} as HandlerEntry
			})
		}
	}

	// Create base context with entries accessor (using mode-specific output path)
	const baseContext: BuildTransformContext = {
		mode,
		env: Env,
		logger: loggerInstance,
		paths: {
			root: process.cwd(),
			src: path.join(process.cwd(), 'src'),
			output: RoboPaths.build(mode)
		},
		config,
		store,
		entries: entriesAccessor,
		buildType: options?.buildType,
		pluginName: options?.pluginName
	}

	// Flatten entries for transform hooks
	// Transform hooks receive ProcessedEntry[] as first argument
	let flatEntries = flattenRouteEntries(entries)

	// 1. Execute project's build/transform hook first (if exists)
	const projectHookPath = await resolveProjectBuildHookPath('transform', mode)
	if (projectHookPath) {
		try {
			loggerInstance.debug('Executing project build/transform hook...')
			const hookModule = await import(pathToFileURL(projectHookPath).href)

			if (typeof hookModule.default === 'function') {
				const result = await hookModule.default(flatEntries, baseContext)
				if (Array.isArray(result)) {
					flatEntries = result
				}
			}
		} catch (error) {
			loggerInstance.error('Project build/transform hook failed:', error)
			throw error
		}
	}

	// 2. Execute plugin build/transform hooks in parallel
	// Note: Per architecture doc, these run in parallel
	// Each plugin sees the same entries (after project transform)
	const hookPromises: Promise<ProcessedEntry[]>[] = []

	for (const [pluginName, pluginData] of plugins) {
		const hookPromise = (async () => {
			const hookPath = await resolvePluginBuildHookPath(pluginName, 'transform')

			if (!hookPath) {
				return flatEntries // Plugin doesn't have a build/transform hook
			}

			const context: BuildTransformContext = {
				...baseContext,
				logger: loggerInstance.fork(inferNamespace(pluginName))
			}

			try {
				loggerInstance.debug(`Executing build/transform hook for ${pluginName}...`)
				const hookModule = await import(pathToFileURL(hookPath).href)

				if (typeof hookModule.default === 'function') {
					const result = await hookModule.default(flatEntries, context)
					if (Array.isArray(result)) {
						return result
					}
				}
				return flatEntries
			} catch (error) {
				const failSafe = pluginData.metaOptions?.failSafe ?? false

				if (failSafe) {
					loggerInstance.warn(`Build/transform hook for ${pluginName} failed (failSafe enabled):`, error)
					return flatEntries
				} else {
					loggerInstance.error(`Build/transform hook for ${pluginName} failed:`, error)
					throw error
				}
			}
		})()

		hookPromises.push(hookPromise)
	}

	// Wait for all plugin transforms
	const results = await Promise.all(hookPromises)

	// Merge results - intersection of all transforms
	// Entries that any plugin removed are removed from final result
	if (results.length > 0) {
		const entryKeys = new Set(flatEntries.map((e) => `${e.key}:${e.path}`))
		for (const result of results) {
			const resultKeys = new Set(result.map((e) => `${e.key}:${e.path}`))
			for (const key of entryKeys) {
				if (!resultKeys.has(key)) {
					entryKeys.delete(key)
				}
			}
		}
		flatEntries = flatEntries.filter((e) => entryKeys.has(`${e.key}:${e.path}`))
	}

	// Reconstruct RouteEntries structure
	return unflattenRouteEntries(flatEntries)
}

/**
 * Flatten RouteEntries into ProcessedEntry[] array.
 */
function flattenRouteEntries(entries: RouteEntries): ProcessedEntry[] {
	const result: ProcessedEntry[] = []

	for (const [namespace, routes] of Object.entries(entries)) {
		for (const [route, entryList] of Object.entries(routes)) {
			for (const entry of entryList) {
				result.push({
					...entry,
					// Store namespace:route in a way we can reconstruct
					_routeType: `${namespace}:${route}`
				} as ProcessedEntry & { _routeType: string })
			}
		}
	}

	return result
}

/**
 * Reconstruct RouteEntries from flattened ProcessedEntry[].
 */
function unflattenRouteEntries(entries: ProcessedEntry[]): RouteEntries {
	const result: RouteEntries = {}

	for (const entry of entries) {
		const routeType = (entry as ProcessedEntry & { _routeType?: string })._routeType
		if (!routeType) continue

		const [namespace, route] = routeType.split(':')

		if (!result[namespace]) {
			result[namespace] = {}
		}
		if (!result[namespace][route]) {
			result[namespace][route] = []
		}

		// Remove internal _routeType field
		const cleanEntry = { ...entry }
		delete (cleanEntry as Record<string, unknown>)._routeType

		result[namespace][route].push(cleanEntry)
	}

	return result
}

/**
 * Result of executing build/complete hooks.
 */
export interface BuildCompleteResult {
	/** Metadata aggregators registered by plugins */
	metadataRegistry: MetadataAggregatorRegistry
	/** Metadata updates from plugins */
	metadataUpdates: Map<string, Record<string, unknown>>
}

/**
 * Execute build/complete hooks for project and all registered plugins.
 * Project hook runs first, then all plugin hooks run in parallel.
 * Returns metadata aggregators for granular manifest generation.
 *
 * @param plugins - Plugin data map
 * @param config - Project configuration
 * @param mode - Build mode (supports custom modes like 'beta', 'staging', etc.)
 * @param store - BuildStore from previous hooks
 * @param routeEntries - Optional route entries for metadata aggregation
 * @param options - Optional build hook options (buildType, pluginName)
 */
export async function executeBuildCompleteHooks(
	plugins: Map<string, PluginData>,
	config: Config,
	mode: string,
	store: BuildStore,
	routeEntries?: RouteEntries,
	options?: BuildHookOptions
): Promise<BuildCompleteResult> {
	const loggerInstance = logger()

	// Initialize registries for metadata aggregation
	const metadataRegistry: MetadataAggregatorRegistry = new Map()
	const metadataUpdates = new Map<string, Record<string, unknown>>()

	// Create entries accessor
	const entriesAccessor: BuildCompleteContext['entries'] = {
		get(namespace: string, route: string): ProcessedEntry[] {
			return routeEntries?.[namespace]?.[route] ?? []
		},
		all(): RouteEntries {
			return routeEntries ?? {}
		},
		handlers(namespace: string, route: string): HandlerEntry[] {
			const entries = routeEntries?.[namespace]?.[route] ?? []
			return entries.map((entry, index) => {
				const plugin = entry.module?.startsWith('@') || entry.module?.startsWith('robo-plugin-')
					? entry.module
					: null
				let id = entry.key
				if (plugin) {
					id = `${plugin}:${entry.key}`
				}
				if (entries.filter((e) => e.key === entry.key).length > 1) {
					id = `${id}:${index}`
				}

				return {
					...entry,
					id,
					source: plugin ? 'plugin' : 'project',
					plugin,
					index: entries.filter((e) => e.key === entry.key).length > 1 ? index : undefined
				} as HandlerEntry
			})
		}
	}

	// Create base context with entries accessor and metadata methods (using mode-specific output path)
	const baseContext: BuildCompleteContext = {
		mode,
		env: Env,
		logger: loggerInstance,
		paths: {
			root: process.cwd(),
			src: path.join(process.cwd(), 'src'),
			output: RoboPaths.build(mode)
		},
		config,
		store,
		entries: entriesAccessor,
		buildType: options?.buildType,
		pluginName: options?.pluginName,
		registerMetadataAggregator<T extends AggregatedMetadata>(
			namespace: string,
			aggregator: MetadataAggregator<T>
		): void {
			metadataRegistry.set(namespace, aggregator as MetadataAggregator)
		},
		updateMetadata(namespace: string, updates: Record<string, unknown>): void {
			const existing = metadataUpdates.get(namespace) ?? {}
			metadataUpdates.set(namespace, { ...existing, ...updates })
		}
	}

	// 1. Execute project's build/complete hook first (if exists)
	const projectHookPath = await resolveProjectBuildHookPath('complete', mode)
	if (projectHookPath) {
		try {
			loggerInstance.debug('Executing project build/complete hook...')
			const hookModule = await import(pathToFileURL(projectHookPath).href)

			if (typeof hookModule.default === 'function') {
				await hookModule.default(baseContext)
			}
		} catch (error) {
			// Project build hook failure is always fatal
			loggerInstance.error('Project build/complete hook failed:', error)
			throw error
		}
	}

	// 2. Execute plugin build/complete hooks in parallel
	const hookPromises: Promise<void>[] = []

	for (const [pluginName, pluginData] of plugins) {
		const hookPromise = (async () => {
			const hookPath = await resolvePluginBuildHookPath(pluginName, 'complete')

			if (!hookPath) {
				return // Plugin doesn't have a build/complete hook
			}

			const context: BuildCompleteContext = {
				...baseContext,
				logger: loggerInstance.fork(inferNamespace(pluginName))
			}

			try {
				loggerInstance.debug(`Executing build/complete hook for ${pluginName}...`)
				const hookModule = await import(pathToFileURL(hookPath).href)

				if (typeof hookModule.default === 'function') {
					await hookModule.default(context)
				}
			} catch (error) {
				// Check failSafe meta option
				const failSafe = pluginData.metaOptions?.failSafe ?? false

				if (failSafe) {
					loggerInstance.warn(`Build/complete hook for ${pluginName} failed (failSafe enabled):`, error)
				} else {
					loggerInstance.error(`Build/complete hook for ${pluginName} failed:`, error)
					throw error
				}
			}
		})()

		hookPromises.push(hookPromise)
	}

	await Promise.all(hookPromises)

	return { metadataRegistry, metadataUpdates }
}

/**
 * Check if any build hooks exist for the project or plugins.
 * Used to determine if we need to load plugin data early.
 *
 * @param plugins - Plugin data map
 * @param mode - Build mode for mode-specific path resolution (defaults to 'production')
 */
export async function hasBuildHooks(plugins: Map<string, PluginData>, mode?: string): Promise<boolean> {
	// Check project hooks
	for (const hookName of ['start', 'transform', 'complete'] as const) {
		if (await resolveProjectBuildHookPath(hookName, mode)) {
			return true
		}
	}

	// Check plugin hooks
	for (const [pluginName] of plugins) {
		for (const hookName of ['start', 'transform', 'complete'] as const) {
			if (await resolvePluginBuildHookPath(pluginName, hookName)) {
				return true
			}
		}
	}

	return false
}

/**
 * Load plugin data from the configuration.
 * Similar to the function in robo.ts but accepts config directly.
 */
export function loadPluginData(config: Config | null): Map<string, PluginData> {
	const collection = new Map<string, PluginData>()
	if (!config?.plugins) {
		return collection
	}

	for (const plugin of config.plugins) {
		if (typeof plugin === 'string') {
			collection.set(plugin, { name: plugin })
		} else if (Array.isArray(plugin)) {
			const [name, options, metaOptions] = plugin
			collection.set(name, { name, options, metaOptions })
		}
	}

	return collection
}
