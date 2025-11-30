import { logger } from '../../core/logger.js'
import { Env } from '../../core/env.js'
import { inferNamespace } from '../../core/hooks.js'
import type { BuildContext, BuildTransformContext, BuildCompleteContext } from '../../types/lifecycle.js'
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
 * Resolve the build hook path for a plugin (compiled JS only).
 */
export async function resolvePluginBuildHookPath(
	pluginName: string,
	hookName: 'start' | 'transform' | 'complete'
): Promise<string | null> {
	const possiblePaths = [
		// Plugin package: node_modules/@robojs/discord/.robo/build/robo/build/start.js
		path.join(process.cwd(), 'node_modules', pluginName, '.robo', 'build', 'robo', 'build', `${hookName}.js`),
		// Alternative: node_modules/@robojs/discord/dist/robo/build/start.js
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
 */
export async function resolveProjectBuildHookPath(
	hookName: 'start' | 'transform' | 'complete'
): Promise<string | null> {
	const hookPath = path.join(process.cwd(), '.robo', 'build', 'robo', 'build', `${hookName}.js`)

	if (await fileExists(hookPath)) {
		return hookPath
	}

	return null
}

/**
 * Execute build/start hooks for project and all registered plugins.
 * Project hook runs first, then all plugin hooks run in parallel.
 */
export async function executeBuildStartHooks(
	plugins: Map<string, PluginData>,
	config: Config,
	mode: 'development' | 'production'
): Promise<void> {
	const loggerInstance = logger()

	// Create base context
	const baseContext: BuildContext = {
		mode,
		env: Env,
		logger: loggerInstance,
		paths: {
			root: process.cwd(),
			src: path.join(process.cwd(), 'src'),
			output: path.join(process.cwd(), '.robo', 'build')
		},
		config
	}

	// 1. Execute project's build/start hook first (if exists)
	const projectHookPath = await resolveProjectBuildHookPath('start')
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
}

/**
 * Execute build/transform hooks for project and all registered plugins.
 * Runs SEQUENTIALLY (project first, then plugins in order) because each hook
 * can modify entries and pass them to the next hook in the chain.
 */
export async function executeBuildTransformHooks(
	plugins: Map<string, PluginData>,
	config: Config,
	mode: 'development' | 'production',
	entries: BuildTransformContext['entries']
): Promise<BuildTransformContext['entries']> {
	const loggerInstance = logger()
	let currentEntries = entries

	// Create base context
	const baseContext: Omit<BuildTransformContext, 'entries'> = {
		mode,
		env: Env,
		logger: loggerInstance,
		paths: {
			root: process.cwd(),
			src: path.join(process.cwd(), 'src'),
			output: path.join(process.cwd(), '.robo', 'build')
		},
		config
	}

	// 1. Execute project's build/transform hook first (if exists)
	const projectHookPath = await resolveProjectBuildHookPath('transform')
	if (projectHookPath) {
		try {
			loggerInstance.debug('Executing project build/transform hook...')
			const hookModule = await import(pathToFileURL(projectHookPath).href)

			if (typeof hookModule.default === 'function') {
				const context: BuildTransformContext = {
					...baseContext,
					entries: currentEntries
				}
				const result = await hookModule.default(context)
				// Transform hooks must return entries
				if (result) {
					currentEntries = result
				}
			}
		} catch (error) {
			// Project build hook failure is always fatal
			loggerInstance.error('Project build/transform hook failed:', error)
			throw error
		}
	}

	// 2. Execute plugin build/transform hooks in registration order
	for (const [pluginName, pluginData] of plugins) {
		const hookPath = await resolvePluginBuildHookPath(pluginName, 'transform')

		if (!hookPath) {
			continue // Plugin doesn't have a build/transform hook
		}

		const context: BuildTransformContext = {
			...baseContext,
			logger: loggerInstance.fork(inferNamespace(pluginName)),
			entries: currentEntries
		}

		try {
			loggerInstance.debug(`Executing build/transform hook for ${pluginName}...`)
			const hookModule = await import(pathToFileURL(hookPath).href)

			if (typeof hookModule.default === 'function') {
				const result = await hookModule.default(context)
				// Transform hooks must return entries
				if (result) {
					currentEntries = result
				}
			}
		} catch (error) {
			// Check failSafe meta option
			const failSafe = pluginData.metaOptions?.failSafe ?? false

			if (failSafe) {
				loggerInstance.warn(`Build/transform hook for ${pluginName} failed (failSafe enabled):`, error)
				// Continue with other plugins
			} else {
				loggerInstance.error(`Build/transform hook for ${pluginName} failed:`, error)
				throw error
			}
		}
	}

	return currentEntries
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
 */
export async function executeBuildCompleteHooks(
	plugins: Map<string, PluginData>,
	config: Config,
	mode: 'development' | 'production',
	manifest: BuildCompleteContext['manifest'],
	routeEntries?: RouteEntries
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

	// Create base context with entries accessor and metadata methods
	const baseContext: BuildCompleteContext = {
		mode,
		env: Env,
		logger: loggerInstance,
		paths: {
			root: process.cwd(),
			src: path.join(process.cwd(), 'src'),
			output: path.join(process.cwd(), '.robo', 'build')
		},
		config,
		manifest,
		entries: entriesAccessor,
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
	const projectHookPath = await resolveProjectBuildHookPath('complete')
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
 */
export async function hasBuildHooks(plugins: Map<string, PluginData>): Promise<boolean> {
	// Check project hooks
	for (const hookName of ['start', 'transform', 'complete'] as const) {
		if (await resolveProjectBuildHookPath(hookName)) {
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
