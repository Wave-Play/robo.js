import { getConfig } from './config.js'
import { logger } from './logger.js'
import { Env } from './env.js'
import { state } from './state.js'
import { DEFAULT_CONFIG, TIMEOUT } from './constants.js'
import { timeout } from '../cli/utils/utils.js'
import { RoboPaths } from './paths.js'
import type { ErrorContext, HmrContext, HmrHookConfig, HmrRouteInfo, InitContext, PrepareContext, StartContext, PluginState, StopContext } from '../types/lifecycle.js'
import type { LifecycleHookType, PluginData } from '../types/common.js'
import { dispatchHmrEvent, type HmrEventContext } from './hmr.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Cache for plugin versions to avoid repeated package.json reads
const pluginVersionCache = new Map<string, string>()

/**
 * Default hook priority. Hooks with the same priority run in parallel.
 */
export const DEFAULT_HOOK_PRIORITY = 100

/**
 * Runtime priority overrides for hooks.
 * Map of hookType -> Map of pluginName -> priority
 */
const _hookPriorityOverrides = new Map<string, Map<string, number>>()

/**
 * Set the execution priority for a specific plugin's hook.
 * Lower numbers run first. Default priority is 100.
 * Hooks with the same priority run in parallel.
 *
 * @param hookType - The lifecycle hook type ('init', 'prepare', 'start', 'stop', 'setup')
 * @param pluginName - The plugin package name (e.g., '@robojs/server')
 * @param priority - The priority value (lower runs first)
 *
 * @example
 * ```typescript
 * import { setHookPriority } from 'robo.js'
 *
 * // Run server before other plugins (default is 100)
 * setHookPriority('start', '@robojs/server', 50)
 * ```
 */
export function setHookPriority(hookType: LifecycleHookType, pluginName: string, priority: number): void {
	if (!_hookPriorityOverrides.has(hookType)) {
		_hookPriorityOverrides.set(hookType, new Map())
	}
	_hookPriorityOverrides.get(hookType)!.set(pluginName, priority)
}

/**
 * Get the effective priority for a plugin's hook.
 * Checks: 1) runtime override, 2) metaOptions.hookPriority, 3) default (100)
 */
export function getHookPriority(hookType: LifecycleHookType, pluginName: string, pluginData: PluginData): number {
	// 1. Check runtime override first
	const override = _hookPriorityOverrides.get(hookType)?.get(pluginName)
	if (override !== undefined) return override

	// 2. Check metaOptions.hookPriority
	const metaPriority = pluginData.metaOptions?.hookPriority?.[hookType]
	if (metaPriority !== undefined) return metaPriority

	// 3. Default
	return DEFAULT_HOOK_PRIORITY
}

/**
 * Set a plugin's hook to run before another plugin's hook.
 * Adjusts the priority to be 10 less than the target plugin's priority.
 *
 * @param hookType - The lifecycle hook type
 * @param pluginName - The plugin to prioritize
 * @param beforePlugin - The plugin that should run after
 *
 * @example
 * ```typescript
 * import { prioritizeHookBefore } from 'robo.js'
 *
 * // Ensure server starts before discordjs
 * prioritizeHookBefore('start', '@robojs/server', '@robojs/discordjs')
 * ```
 */
export function prioritizeHookBefore(hookType: LifecycleHookType, pluginName: string, beforePlugin: string): void {
	const currentPriority = _hookPriorityOverrides.get(hookType)?.get(beforePlugin) ?? DEFAULT_HOOK_PRIORITY
	setHookPriority(hookType, pluginName, currentPriority - 10)
}

/**
 * Set a plugin's hook to run after another plugin's hook.
 * Adjusts the priority to be 10 more than the target plugin's priority.
 *
 * @param hookType - The lifecycle hook type
 * @param pluginName - The plugin to deprioritize
 * @param afterPlugin - The plugin that should run before
 *
 * @example
 * ```typescript
 * import { prioritizeHookAfter } from 'robo.js'
 *
 * // Ensure mock runs after server
 * prioritizeHookAfter('start', '@robojs/mock', '@robojs/server')
 * ```
 */
export function prioritizeHookAfter(hookType: LifecycleHookType, pluginName: string, afterPlugin: string): void {
	const currentPriority = _hookPriorityOverrides.get(hookType)?.get(afterPlugin) ?? DEFAULT_HOOK_PRIORITY
	setHookPriority(hookType, pluginName, currentPriority + 10)
}

/**
 * Clear all hook priority overrides. Useful for testing.
 * @internal
 */
export function clearHookPriorityOverrides(): void {
	_hookPriorityOverrides.clear()
}

/**
 * Result of grouping plugins by priority.
 * Contains the grouped plugins and sorted priority order.
 */
export interface PriorityGroupResult {
	/** Map of priority -> array of [pluginName, pluginData] tuples */
	groups: Map<number, Array<[string, PluginData]>>
	/** Sorted priorities (lower first for start hooks, higher first for stop hooks) */
	sortedPriorities: number[]
}

/**
 * Group plugins by their hook priority.
 * This is a pure function that can be tested without filesystem dependencies.
 *
 * @param plugins - Plugin data map
 * @param hookType - The lifecycle hook type
 * @param hasHook - Predicate to check if a plugin has the specified hook
 * @param reverse - If true, sort priorities in reverse order (higher first, for stop hooks)
 * @returns Grouped plugins and sorted priority order
 *
 * @example
 * ```typescript
 * const result = groupPluginsByPriority(
 *   plugins,
 *   'start',
 *   (name) => pluginsWithStartHook.has(name),
 *   false // lower priorities first
 * )
 *
 * for (const priority of result.sortedPriorities) {
 *   const group = result.groups.get(priority)!
 *   // Execute hooks in this group...
 * }
 * ```
 */
export function groupPluginsByPriority(
	plugins: Map<string, PluginData>,
	hookType: LifecycleHookType,
	hasHook: (pluginName: string) => boolean,
	reverse = false
): PriorityGroupResult {
	const groups = new Map<number, Array<[string, PluginData]>>()

	for (const [pluginName, pluginData] of plugins) {
		if (!hasHook(pluginName)) continue

		const priority = getHookPriority(hookType, pluginName, pluginData)
		if (!groups.has(priority)) {
			groups.set(priority, [])
		}
		groups.get(priority)!.push([pluginName, pluginData])
	}

	// Sort priorities: lower first normally, higher first for reverse (stop hooks)
	const sortedPriorities = [...groups.keys()].sort((a, b) => (reverse ? b - a : a - b))

	return { groups, sortedPriorities }
}

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
 * Resolve the hook path for a plugin (compiled JS only).
 * Plugins don't use mode-specific builds - they're pre-built.
 */
export async function resolvePluginHookPath(
	pluginName: string,
	hookName: 'init' | 'prepare' | 'start' | 'stop' | 'setup' | 'error' | 'hmr'
): Promise<string | null> {
	const possiblePaths = [
		// Plugin package: node_modules/@robojs/discord/.robo/build/robo/init.js
		RoboPaths.pluginHook(pluginName, hookName),
		// Alternative: node_modules/@robojs/discord/dist/robo/init.js (legacy)
		`${process.cwd()}/node_modules/${pluginName}/dist/robo/${hookName}.js`
	]

	for (const hookPath of possiblePaths) {
		if (await fileExists(hookPath)) {
			return hookPath
		}
	}

	return null
}

/**
 * Resolve the hook path for the current project (compiled JS only).
 * Uses mode-specific build directory: .robo/build/{mode}/robo/{hookName}.js
 *
 * @param hookName - The hook to resolve
 * @param mode - Runtime mode (supports custom modes like 'beta', 'staging', etc.)
 */
export async function resolveProjectHookPath(
	hookName: 'init' | 'prepare' | 'start' | 'stop' | 'error' | 'hmr',
	mode: string
): Promise<string | null> {
	const hookPath = RoboPaths.hook(mode, hookName)

	if (await fileExists(hookPath)) {
		return hookPath
	}

	return null
}

/**
 * Infer namespace from package name.
 */
export function inferNamespace(packageName: string): string {
	// Normalize path separators to forward slashes for Windows compatibility
	const normalizedName = packageName.split(path.sep).join('/')

	// @robojs/discord → discord
	if (normalizedName.startsWith('@')) {
		const parts = normalizedName.split('/')
		return parts[parts.length - 1]
	}

	// robo-plugin-analytics → analytics
	if (packageName.startsWith('robo-plugin-')) {
		return packageName.replace('robo-plugin-', '')
	}

	// plugin-analytics → analytics
	if (packageName.startsWith('plugin-')) {
		return packageName.replace('plugin-', '')
	}

	return packageName
}

/**
 * Execute init hooks for project and all registered plugins.
 * Hooks are grouped by priority and executed in priority order (lower first).
 * Hooks with the same priority run in parallel via Promise.all().
 * Respects failSafe meta option for error handling.
 *
 * @param plugins - Plugin data map
 * @param mode - Runtime mode (supports custom modes like 'beta', 'staging', etc.)
 */
export async function executeInitHooks(
	plugins: Map<string, PluginData>,
	mode: string
): Promise<void> {
	const config = getConfig()
	const loggerInstance = logger()

	// Group plugins by priority
	const priorityGroups = new Map<number, Array<[string, PluginData]>>()

	for (const [pluginName, pluginData] of plugins) {
		const hookPath = await resolvePluginHookPath(pluginName, 'init')
		if (!hookPath) continue // Plugin doesn't have an init hook

		const priority = getHookPriority('init', pluginName, pluginData)
		if (!priorityGroups.has(priority)) {
			priorityGroups.set(priority, [])
		}
		priorityGroups.get(priority)!.push([pluginName, pluginData])
	}

	// Sort priority groups (lower numbers first)
	const sortedPriorities = [...priorityGroups.keys()].sort((a, b) => a - b)

	// Execute each priority group sequentially, but hooks within a group run in parallel
	for (const priority of sortedPriorities) {
		const group = priorityGroups.get(priority)!
		const hookCount = group.length

		if (hookCount === 1) {
			// Single hook - run directly
			const [pluginName, pluginData] = group[0]
			await executePluginInitHook(pluginName, pluginData, mode, config, loggerInstance)
		} else {
			// Multiple hooks at same priority - run in parallel
			loggerInstance.debug(`Executing ${hookCount} init hooks in parallel (priority ${priority}): ${group.map(([n]) => n).join(', ')}`)
			await Promise.all(
				group.map(([pluginName, pluginData]) =>
					executePluginInitHook(pluginName, pluginData, mode, config, loggerInstance)
				)
			)
		}
	}

	// Project hook always runs last (after all plugin hooks)
	const projectHookPath = await resolveProjectHookPath('init', mode)
	if (projectHookPath) {
		const context: InitContext = {
			mode,
			projectConfig: config,
			logger: loggerInstance,
			env: Env
		}

		try {
			const hookModule = await import(pathToFileURL(projectHookPath).href)
			if (typeof hookModule.default === 'function') {
				await hookModule.default(context)
			}
		} catch (error) {
			// Project init hook failure is always fatal
			loggerInstance.error('Project init hook failed:', error)
			throw error
		}
	}
}

/**
 * Execute a single plugin's init hook with error handling.
 * @internal
 */
async function executePluginInitHook(
	pluginName: string,
	pluginData: PluginData,
	mode: string,
	config: ReturnType<typeof getConfig>,
	loggerInstance: ReturnType<typeof logger>
): Promise<void> {
	const hookPath = await resolvePluginHookPath(pluginName, 'init')
	if (!hookPath) return

	const context: InitContext = {
		mode,
		projectConfig: config,
		logger: loggerInstance.fork(inferNamespace(pluginName)),
		env: Env
	}

	try {
		const hookModule = await import(pathToFileURL(hookPath).href)
		if (typeof hookModule.default === 'function') {
			await hookModule.default(context)
		}
	} catch (error) {
		// Check failSafe meta option
		const failSafe = pluginData.metaOptions?.failSafe ?? false

		if (failSafe) {
			loggerInstance.warn(`Init hook for ${pluginName} failed (failSafe enabled):`, error)
			// Continue with other plugins
		} else {
			loggerInstance.error(`Init hook for ${pluginName} failed:`, error)
			throw error
		}
	}
}

/**
 * Create a plugin-scoped state instance.
 * Uses namespaced keys to isolate plugin data.
 */
export function createPluginState(pluginName: string): PluginState {
	const namespace = `__plugin_${pluginName}__`

	return {
		get<T>(key: string): T | undefined {
			return state[`${namespace}${key}`] as T | undefined
		},

		set<T>(key: string, value: T): void {
			state[`${namespace}${key}`] = value
		},

		has(key: string): boolean {
			return `${namespace}${key}` in state
		},

		delete(key: string): boolean {
			const fullKey = `${namespace}${key}`
			if (fullKey in state) {
				delete state[fullKey]
				return true
			}
			return false
		},

		clear(): void {
			for (const key of Object.keys(state)) {
				if (key.startsWith(namespace)) {
					delete state[key]
				}
			}
		}
	}
}

/**
 * Get plugin version from its package.json.
 * Uses a cache to avoid repeated file reads.
 */
async function getPluginVersion(pluginName: string): Promise<string> {
	if (pluginVersionCache.has(pluginName)) {
		return pluginVersionCache.get(pluginName)!
	}

	try {
		const packageJsonPath = path.join(process.cwd(), 'node_modules', pluginName, 'package.json')
		const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
		const packageJson = JSON.parse(packageJsonContent)
		const version = packageJson.version ?? '0.0.0'
		pluginVersionCache.set(pluginName, version)
		return version
	} catch {
		pluginVersionCache.set(pluginName, '0.0.0')
		return '0.0.0'
	}
}

/**
 * Execute start hooks for project and all registered plugins.
 * Hooks are grouped by priority and executed in priority order (lower first).
 * Hooks with the same priority run in parallel via Promise.all().
 *
 * This runs AFTER portal is populated but BEFORE plugin connections are established.
 *
 * @param plugins - Plugin data map
 * @param mode - Runtime mode (supports custom modes like 'beta', 'staging', etc.)
 */
export async function executeStartHooks(
	plugins: Map<string, PluginData>,
	mode: string
): Promise<void> {
	const config = getConfig()
	const loggerInstance = logger()
	const timeoutDuration = config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle

	// Group plugins by priority
	const priorityGroups = new Map<number, Array<[string, PluginData]>>()

	for (const [pluginName, pluginData] of plugins) {
		const hookPath = await resolvePluginHookPath(pluginName, 'start')
		if (!hookPath) continue // Plugin doesn't have a start hook

		const priority = getHookPriority('start', pluginName, pluginData)
		if (!priorityGroups.has(priority)) {
			priorityGroups.set(priority, [])
		}
		priorityGroups.get(priority)!.push([pluginName, pluginData])
	}

	// Sort priority groups (lower numbers first)
	const sortedPriorities = [...priorityGroups.keys()].sort((a, b) => a - b)

	// Execute each priority group sequentially, but hooks within a group run in parallel
	for (const priority of sortedPriorities) {
		const group = priorityGroups.get(priority)!
		const hookCount = group.length

		if (hookCount === 1) {
			// Single hook - run directly
			const [pluginName, pluginData] = group[0]
			loggerInstance.debug(`Executing start hook for ${pluginName} (priority ${priority})...`)
			await executePluginStartHook(pluginName, pluginData, mode, timeoutDuration, config, loggerInstance)
		} else {
			// Multiple hooks at same priority - run in parallel
			loggerInstance.debug(`Executing ${hookCount} start hooks in parallel (priority ${priority}): ${group.map(([n]) => n).join(', ')}`)
			await Promise.all(
				group.map(([pluginName, pluginData]) =>
					executePluginStartHook(pluginName, pluginData, mode, timeoutDuration, config, loggerInstance)
				)
			)
		}
	}

	// Project hook always runs last (after all plugin hooks)
	const projectHookPath = await resolveProjectHookPath('start', mode)
	if (projectHookPath) {
		try {
			loggerInstance.debug('Executing project start hook...')
			const hookModule = await import(pathToFileURL(projectHookPath).href)

			if (typeof hookModule.default === 'function') {
				const hookPromise = hookModule.default({
					mode,
					projectConfig: config,
					pluginConfig: {},
					state: createPluginState('project'),
					logger: loggerInstance,
					env: Env,
					meta: {
						name: 'project',
						version: '0.0.0'
					}
				} as StartContext)

				if (hookPromise instanceof Promise) {
					const timeoutPromise = timeout(() => TIMEOUT, timeoutDuration)
					const result = await Promise.race([hookPromise, timeoutPromise])

					if (result === TIMEOUT) {
						loggerInstance.warn('Project start hook timed out')
					}
				}
			}
		} catch (error) {
			// Project start hook failure is always fatal
			loggerInstance.error('Project start hook failed:', error)
			throw error
		}
	}
}

/**
 * Execute a single plugin's start hook with timeout and error handling.
 * @internal
 */
async function executePluginStartHook(
	pluginName: string,
	pluginData: PluginData,
	mode: string,
	timeoutDuration: number,
	config: ReturnType<typeof getConfig>,
	loggerInstance: ReturnType<typeof logger>
): Promise<void> {
	const hookPath = await resolvePluginHookPath(pluginName, 'start')
	if (!hookPath) return

	// Get plugin version from package.json (cached)
	const pluginVersion = await getPluginVersion(pluginName)

	// Create plugin-scoped context
	const context: StartContext = {
		mode,
		projectConfig: config,
		pluginConfig: pluginData.options,
		state: createPluginState(pluginName),
		logger: loggerInstance.fork(inferNamespace(pluginName)),
		env: Env,
		meta: {
			name: pluginName,
			version: pluginVersion
		}
	}

	try {
		const hookModule = await import(pathToFileURL(hookPath).href)

		if (typeof hookModule.default === 'function') {
			const hookPromise = hookModule.default(context)

			if (hookPromise instanceof Promise) {
				const timeoutPromise = timeout(() => TIMEOUT, timeoutDuration)
				const result = await Promise.race([hookPromise, timeoutPromise])

				if (result === TIMEOUT) {
					loggerInstance.warn(`Start hook for ${pluginName} timed out`)
				}
			}
		}
	} catch (error) {
		// Check failSafe meta option
		const failSafe = pluginData.metaOptions?.failSafe ?? false

		if (failSafe) {
			loggerInstance.warn(`Start hook for ${pluginName} failed (failSafe enabled):`, error)
			// Continue with other plugins
		} else {
			loggerInstance.error(`Start hook for ${pluginName} failed:`, error)
			throw error
		}
	}
}

/**
 * Execute prepare hooks for project and all registered plugins.
 * Hooks are grouped by priority and executed in priority order (lower first).
 * Hooks with the same priority run in parallel via Promise.all().
 *
 * This runs AFTER portal is populated but BEFORE start hooks.
 * Use for initializing resources like Discord client, HTTP servers.
 *
 * @param plugins - Plugin data map
 * @param mode - Runtime mode (supports custom modes like 'beta', 'staging', etc.)
 */
export async function executePrepareHooks(
	plugins: Map<string, PluginData>,
	mode: string
): Promise<void> {
	const config = getConfig()
	const loggerInstance = logger()
	const timeoutDuration = config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle

	// Group plugins by priority
	const priorityGroups = new Map<number, Array<[string, PluginData]>>()

	for (const [pluginName, pluginData] of plugins) {
		const hookPath = await resolvePluginHookPath(pluginName, 'prepare')
		if (!hookPath) continue // Plugin doesn't have a prepare hook

		const priority = getHookPriority('prepare', pluginName, pluginData)
		if (!priorityGroups.has(priority)) {
			priorityGroups.set(priority, [])
		}
		priorityGroups.get(priority)!.push([pluginName, pluginData])
	}

	// Sort priority groups (lower numbers first)
	const sortedPriorities = [...priorityGroups.keys()].sort((a, b) => a - b)

	// Execute each priority group sequentially, but hooks within a group run in parallel
	for (const priority of sortedPriorities) {
		const group = priorityGroups.get(priority)!
		const hookCount = group.length

		if (hookCount === 1) {
			// Single hook - run directly
			const [pluginName, pluginData] = group[0]
			loggerInstance.debug(`Executing prepare hook for ${pluginName} (priority ${priority})...`)
			await executePluginPrepareHook(pluginName, pluginData, mode, timeoutDuration, config, loggerInstance)
		} else {
			// Multiple hooks at same priority - run in parallel
			loggerInstance.debug(`Executing ${hookCount} prepare hooks in parallel (priority ${priority}): ${group.map(([n]) => n).join(', ')}`)
			await Promise.all(
				group.map(([pluginName, pluginData]) =>
					executePluginPrepareHook(pluginName, pluginData, mode, timeoutDuration, config, loggerInstance)
				)
			)
		}
	}

	// Project hook always runs last (after all plugin hooks)
	const projectHookPath = await resolveProjectHookPath('prepare', mode)
	if (projectHookPath) {
		try {
			loggerInstance.debug('Executing project prepare hook...')
			const hookModule = await import(pathToFileURL(projectHookPath).href)

			if (typeof hookModule.default === 'function') {
				const hookPromise = hookModule.default({
					mode,
					projectConfig: config,
					pluginConfig: {},
					state: createPluginState('project'),
					logger: loggerInstance,
					env: Env,
					meta: {
						name: 'project',
						version: '0.0.0'
					}
				} as PrepareContext)

				if (hookPromise instanceof Promise) {
					const timeoutPromise = timeout(() => TIMEOUT, timeoutDuration)
					const result = await Promise.race([hookPromise, timeoutPromise])

					if (result === TIMEOUT) {
						loggerInstance.warn('Project prepare hook timed out')
					}
				}
			}
		} catch (error) {
			// Project prepare hook failure is always fatal
			loggerInstance.error('Project prepare hook failed:', error)
			throw error
		}
	}
}

/**
 * Execute a single plugin's prepare hook with timeout and error handling.
 * @internal
 */
async function executePluginPrepareHook(
	pluginName: string,
	pluginData: PluginData,
	mode: string,
	timeoutDuration: number,
	config: ReturnType<typeof getConfig>,
	loggerInstance: ReturnType<typeof logger>
): Promise<void> {
	const hookPath = await resolvePluginHookPath(pluginName, 'prepare')
	if (!hookPath) return

	// Get plugin version from package.json (cached)
	const pluginVersion = await getPluginVersion(pluginName)

	// Create plugin-scoped context
	const context: PrepareContext = {
		mode,
		projectConfig: config,
		pluginConfig: pluginData.options,
		state: createPluginState(pluginName),
		logger: loggerInstance.fork(inferNamespace(pluginName)),
		env: Env,
		meta: {
			name: pluginName,
			version: pluginVersion
		}
	}

	try {
		const hookModule = await import(pathToFileURL(hookPath).href)

		if (typeof hookModule.default === 'function') {
			const hookPromise = hookModule.default(context)

			if (hookPromise instanceof Promise) {
				const timeoutPromise = timeout(() => TIMEOUT, timeoutDuration)
				const result = await Promise.race([hookPromise, timeoutPromise])

				if (result === TIMEOUT) {
					loggerInstance.warn(`Prepare hook for ${pluginName} timed out`)
				}
			}
		}
	} catch (error) {
		// Check failSafe meta option
		const failSafe = pluginData.metaOptions?.failSafe ?? false

		if (failSafe) {
			loggerInstance.warn(`Prepare hook for ${pluginName} failed (failSafe enabled):`, error)
			// Continue with other plugins
		} else {
			loggerInstance.error(`Prepare hook for ${pluginName} failed:`, error)
			throw error
		}
	}
}

/**
 * Execute stop hooks for all registered plugins and project.
 * Hooks are grouped by priority and executed in REVERSE priority order (higher first).
 * Hooks with the same priority run in parallel via Promise.all().
 * This ensures things that started first (lower priority) stop last.
 *
 * Project hook runs FIRST, then plugins in reverse priority order.
 *
 * @param plugins - Plugin data map
 * @param mode - Runtime mode (supports custom modes like 'beta', 'staging', etc.)
 * @param reason - Reason for stopping
 */
export async function executeStopHooks(
	plugins: Map<string, PluginData>,
	mode: string,
	reason: 'signal' | 'error' | 'restart' = 'signal'
): Promise<void> {
	const config = getConfig()
	const loggerInstance = logger()
	const timeoutDuration = config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle

	// Project hook runs FIRST (before plugin hooks)
	const projectHookPath = await resolveProjectHookPath('stop', mode)
	if (projectHookPath) {
		try {
			loggerInstance.debug('Executing project stop hook...')
			const hookModule = await import(pathToFileURL(projectHookPath).href)

			if (typeof hookModule.default === 'function') {
				const hookPromise = hookModule.default({
					mode,
					reason,
					projectConfig: config,
					pluginConfig: {},
					state: createPluginState('project'),
					logger: loggerInstance,
					env: Env,
					meta: {
						name: 'project',
						version: '0.0.0'
					}
				} as StopContext)

				if (hookPromise instanceof Promise) {
					const timeoutPromise = timeout(() => TIMEOUT, timeoutDuration)
					const result = await Promise.race([hookPromise, timeoutPromise])

					if (result === TIMEOUT) {
						loggerInstance.warn('Project stop hook timed out')
					}
				}
			}
		} catch (error) {
			// Project stop hook failure - log but don't throw (shutdown should complete)
			loggerInstance.error('Project stop hook failed:', error)
		}
	}

	// Group plugins by priority
	const priorityGroups = new Map<number, Array<[string, PluginData]>>()

	for (const [pluginName, pluginData] of plugins) {
		const hookPath = await resolvePluginHookPath(pluginName, 'stop')
		if (!hookPath) continue // Plugin doesn't have a stop hook

		const priority = getHookPriority('stop', pluginName, pluginData)
		if (!priorityGroups.has(priority)) {
			priorityGroups.set(priority, [])
		}
		priorityGroups.get(priority)!.push([pluginName, pluginData])
	}

	// Sort priority groups in REVERSE order (higher numbers first for cleanup)
	const sortedPriorities = [...priorityGroups.keys()].sort((a, b) => b - a)

	// Execute each priority group sequentially, but hooks within a group run in parallel
	for (const priority of sortedPriorities) {
		const group = priorityGroups.get(priority)!
		const hookCount = group.length

		if (hookCount === 1) {
			// Single hook - run directly
			const [pluginName, pluginData] = group[0]
			loggerInstance.debug(`Executing stop hook for ${pluginName} (priority ${priority})...`)
			await executePluginStopHook(pluginName, pluginData, mode, reason, timeoutDuration, config, loggerInstance)
		} else {
			// Multiple hooks at same priority - run in parallel
			loggerInstance.debug(`Executing ${hookCount} stop hooks in parallel (priority ${priority}): ${group.map(([n]) => n).join(', ')}`)
			await Promise.all(
				group.map(([pluginName, pluginData]) =>
					executePluginStopHook(pluginName, pluginData, mode, reason, timeoutDuration, config, loggerInstance)
				)
			)
		}
	}
}

/**
 * Execute a single plugin's stop hook with timeout and error handling.
 * @internal
 */
async function executePluginStopHook(
	pluginName: string,
	pluginData: PluginData,
	mode: string,
	reason: 'signal' | 'error' | 'restart',
	timeoutDuration: number,
	config: ReturnType<typeof getConfig>,
	loggerInstance: ReturnType<typeof logger>
): Promise<void> {
	const hookPath = await resolvePluginHookPath(pluginName, 'stop')
	if (!hookPath) return

	// Get plugin version from cache
	const pluginVersion = await getPluginVersion(pluginName)

	// Create plugin-scoped context with StopContext
	const context: StopContext = {
		mode,
		reason,
		projectConfig: config,
		pluginConfig: pluginData.options,
		state: createPluginState(pluginName),
		logger: loggerInstance.fork(inferNamespace(pluginName)),
		env: Env,
		meta: {
			name: pluginName,
			version: pluginVersion
		}
	}

	try {
		const hookModule = await import(pathToFileURL(hookPath).href)

		if (typeof hookModule.default === 'function') {
			const hookPromise = hookModule.default(context)

			if (hookPromise instanceof Promise) {
				const timeoutPromise = timeout(() => TIMEOUT, timeoutDuration)
				const result = await Promise.race([hookPromise, timeoutPromise])

				if (result === TIMEOUT) {
					loggerInstance.warn(`Stop hook for ${pluginName} timed out`)
				}
			}
		}
	} catch (error) {
		// On stop, log errors but continue to ensure cleanup happens
		const failSafe = pluginData.metaOptions?.failSafe ?? false

		if (failSafe) {
			loggerInstance.warn(`Stop hook for ${pluginName} failed (failSafe enabled):`, error)
		} else {
			loggerInstance.error(`Stop hook for ${pluginName} failed:`, error)
		}
		// Continue with other plugins regardless - graceful shutdown should complete
	}
}

/**
 * Error hook timeout in milliseconds.
 * Short timeout since we need to complete before process exits.
 */
const ERROR_HOOK_TIMEOUT = 5000

/**
 * Execute error hooks for all plugins and project.
 * Runs in PARALLEL with a short timeout - must complete before process exits.
 * Errors in hooks are logged but don't propagate (error hooks should never crash the process).
 *
 * @param plugins - Plugin data map
 * @param mode - Runtime mode
 * @param error - The error that occurred
 * @param type - Type of error: 'unhandledRejection' or 'uncaughtException'
 */
export async function executeErrorHooks(
	plugins: Map<string, PluginData>,
	mode: string,
	error: unknown,
	type: 'unhandledRejection' | 'uncaughtException'
): Promise<void> {
	const loggerInstance = logger()

	// Build base context (without logger - added per-hook)
	const baseContext = {
		error,
		type,
		mode,
		env: Env
	}

	const hookPromises: Promise<void>[] = []

	// Execute plugin error hooks in parallel
	for (const [pluginName] of plugins) {
		const hookPath = await resolvePluginHookPath(pluginName, 'error')

		if (!hookPath) {
			continue // Plugin doesn't have an error hook
		}

		hookPromises.push(
			(async () => {
				try {
					const hookModule = await import(pathToFileURL(hookPath).href)
					if (typeof hookModule.default === 'function') {
						const context: ErrorContext = {
							...baseContext,
							logger: loggerInstance.fork(inferNamespace(pluginName))
						}
						await hookModule.default(context)
					}
				} catch (e) {
					// Log but don't propagate - error hooks should never crash the process
					loggerInstance.warn(`Error hook for ${pluginName} failed:`, e)
				}
			})()
		)
	}

	// Execute project error hook
	const projectHookPath = await resolveProjectHookPath('error', mode)
	if (projectHookPath) {
		hookPromises.push(
			(async () => {
				try {
					const hookModule = await import(pathToFileURL(projectHookPath).href)
					if (typeof hookModule.default === 'function') {
						const context: ErrorContext = {
							...baseContext,
							logger: loggerInstance
						}
						await hookModule.default(context)
					}
				} catch (e) {
					loggerInstance.warn('Project error hook failed:', e)
				}
			})()
		)
	}

	// Wait for all hooks to complete with timeout (blocking)
	if (hookPromises.length > 0) {
		const timeoutPromise = timeout(() => TIMEOUT, ERROR_HOOK_TIMEOUT)
		const result = await Promise.race([Promise.allSettled(hookPromises), timeoutPromise])

		if (result === TIMEOUT) {
			loggerInstance.warn('Error hooks timed out')
		}
	}
}

/**
 * HMR hook timeout in milliseconds.
 * Short timeout since HMR should be responsive.
 */
const HMR_HOOK_TIMEOUT = 5000

/**
 * Payload for HMR notification events.
 */
export interface HmrNotifyPayload {
	changeType: 'change' | 'add' | 'remove'
	files: string[]
	routes: HmrRouteInfo[]
}

/**
 * Filter HmrContext for a hook based on its config.
 * Returns null if no routes match the filter (hook should be skipped).
 */
function filterHmrContextForHook(
	context: HmrContext,
	config?: HmrHookConfig
): HmrContext | null {
	if (!config) {
		return context
	}

	let filteredRoutes = context.routes

	if (config.namespaces) {
		filteredRoutes = filteredRoutes.filter((r) => config.namespaces!.includes(r.namespace))
	}

	if (config.routes) {
		filteredRoutes = filteredRoutes.filter((r) => config.routes!.includes(r.route))
	}

	// If no routes match, skip this hook
	if (filteredRoutes.length === 0) {
		return null
	}

	return {
		...context,
		routes: filteredRoutes
	}
}

/**
 * Build HmrContext from payload.
 */
function buildHmrContext(payload: HmrNotifyPayload, mode: string, loggerInstance: ReturnType<typeof logger>): HmrContext {
	return {
		changeType: payload.changeType,
		files: payload.files,
		routes: payload.routes,
		mode,
		logger: loggerInstance,
		env: Env
	}
}

/**
 * Execute HMR hooks for all plugins and project.
 * Runs in PARALLEL with a 5-second timeout.
 * Also dispatches to imperative subscribers via hmr.subscribe().
 * Errors in hooks are logged but never propagate (HMR hooks should never crash the server).
 *
 * @param plugins - Plugin data map
 * @param mode - Runtime mode
 * @param payload - HMR notification payload with change info
 */
export async function executeHmrHooks(
	plugins: Map<string, PluginData>,
	mode: string,
	payload: HmrNotifyPayload
): Promise<void> {
	const loggerInstance = logger()
	const baseContext = buildHmrContext(payload, mode, loggerInstance)

	// First, dispatch to imperative subscribers
	const subscriberContext: HmrEventContext = {
		changeType: payload.changeType,
		files: payload.files,
		routes: payload.routes,
		mode
	}

	try {
		await dispatchHmrEvent(subscriberContext)
	} catch (e) {
		loggerInstance.warn('[HMR] Error dispatching to subscribers:', e)
	}

	const hookPromises: Promise<void>[] = []

	// Execute plugin HMR hooks in parallel
	for (const [pluginName] of plugins) {
		const hookPath = await resolvePluginHookPath(pluginName, 'hmr')

		if (!hookPath) {
			continue // Plugin doesn't have an HMR hook
		}

		hookPromises.push(
			(async () => {
				try {
					const hookModule = await import(pathToFileURL(hookPath).href)

					if (typeof hookModule.default !== 'function') {
						return
					}

					// Get hook config for filtering
					const hookConfig: HmrHookConfig | undefined = hookModule.config

					// Create plugin-scoped context
					const pluginContext: HmrContext = {
						...baseContext,
						logger: loggerInstance.fork(inferNamespace(pluginName))
					}

					// Filter context based on hook config
					const filteredContext = filterHmrContextForHook(pluginContext, hookConfig)
					if (!filteredContext) {
						return // No routes match this hook's filter
					}

					await hookModule.default(filteredContext)
				} catch (e) {
					// Log but don't propagate - HMR hooks should never crash the server
					loggerInstance.warn(`[HMR] Hook for ${pluginName} failed:`, e)
				}
			})()
		)
	}

	// Execute project HMR hook
	const projectHookPath = await resolveProjectHookPath('hmr', mode)
	if (projectHookPath) {
		hookPromises.push(
			(async () => {
				try {
					const hookModule = await import(pathToFileURL(projectHookPath).href)

					if (typeof hookModule.default !== 'function') {
						return
					}

					// Get hook config for filtering
					const hookConfig: HmrHookConfig | undefined = hookModule.config

					// Filter context based on hook config
					const filteredContext = filterHmrContextForHook(baseContext, hookConfig)
					if (!filteredContext) {
						return // No routes match this hook's filter
					}

					await hookModule.default(filteredContext)
				} catch (e) {
					loggerInstance.warn('[HMR] Project hook failed:', e)
				}
			})()
		)
	}

	// Wait for all hooks to complete with timeout
	if (hookPromises.length > 0) {
		const timeoutPromise = timeout(() => TIMEOUT, HMR_HOOK_TIMEOUT)
		const result = await Promise.race([Promise.allSettled(hookPromises), timeoutPromise])

		if (result === TIMEOUT) {
			loggerInstance.warn('[HMR] Some hooks timed out')
		}
	}
}
