import { getConfig } from './config.js'
import { logger } from './logger.js'
import { Env } from './env.js'
import { state } from './state.js'
import { DEFAULT_CONFIG, TIMEOUT } from './constants.js'
import { timeout } from '../cli/utils/utils.js'
import type { InitContext, PluginContext, PluginState, StopContext } from '../types/lifecycle.js'
import type { PluginData } from '../types/common.js'
import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Cache for plugin versions to avoid repeated package.json reads
const pluginVersionCache = new Map<string, string>()

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
 */
export async function resolvePluginHookPath(
	pluginName: string,
	hookName: 'init' | 'start' | 'stop' | 'setup'
): Promise<string | null> {
	const possiblePaths = [
		// Plugin package: node_modules/@robojs/discord/.robo/build/robo/init.js
		path.join(process.cwd(), 'node_modules', pluginName, '.robo', 'build', 'robo', `${hookName}.js`),
		// Alternative: node_modules/@robojs/discord/dist/robo/init.js
		path.join(process.cwd(), 'node_modules', pluginName, 'dist', 'robo', `${hookName}.js`)
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
 *
 * TODO: The `mode` parameter is currently unused. When mode-specific builds are
 * implemented, this function should resolve to `.robo/build/{mode}/robo/{hookName}.js`
 * instead of the current `.robo/build/robo/{hookName}.js` path.
 * See: packages/robo/docs/future-mode-specific-builds.md
 */
export async function resolveProjectHookPath(
	hookName: 'init' | 'start' | 'stop',
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	mode: 'development' | 'production'
): Promise<string | null> {
	// Note: mode parameter is kept for future use when mode-specific builds are implemented
	logger().debug(`[hooks] resolveProjectHookPath called with mode '${mode}' (currently unused - builds output to .robo/build/ directly)`)

	const hookPath = path.join(process.cwd(), '.robo', 'build', 'robo', `${hookName}.js`)

	if (await fileExists(hookPath)) {
		return hookPath
	}

	return null
}

/**
 * Infer namespace from package name.
 */
export function inferNamespace(packageName: string): string {
	// @robojs/discord → discord
	if (packageName.startsWith('@')) {
		const parts = packageName.split('/')
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
 * Runs sequentially: plugins FIRST (in registration order), then project LAST.
 * Respects failSafe meta option for error handling.
 */
export async function executeInitHooks(
	plugins: Map<string, PluginData>,
	mode: 'development' | 'production'
): Promise<void> {
	const config = getConfig()

	// Get the logger instance for use in hooks
	const loggerInstance = logger()

	// 1. Execute plugin init hooks FIRST (in registration order)
	for (const [pluginName, pluginData] of plugins) {
		const hookPath = await resolvePluginHookPath(pluginName, 'init')

		if (!hookPath) {
			continue // Plugin doesn't have an init hook
		}

		const context: InitContext = {
			config,
			logger: loggerInstance.fork(inferNamespace(pluginName)),
			env: Env,
			mode
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

	// 2. Execute project's init hook LAST (if exists)
	const projectHookPath = await resolveProjectHookPath('init', mode)
	if (projectHookPath) {
		const context: InitContext = {
			config,
			logger: loggerInstance,
			env: Env,
			mode
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
 * Runs sequentially: plugins FIRST (in registration order), then project LAST.
 *
 * This runs AFTER portal is populated but BEFORE Discord login.
 */
export async function executeStartHooks(
	plugins: Map<string, PluginData>,
	mode: 'development' | 'production'
): Promise<void> {
	const config = getConfig()
	const loggerInstance = logger()
	const timeoutDuration = config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle

	// 1. Execute plugin start hooks FIRST (in registration order)
	for (const [pluginName, pluginData] of plugins) {
		const hookPath = await resolvePluginHookPath(pluginName, 'start')

		if (!hookPath) {
			continue // Plugin doesn't have a start hook
		}

		// Get plugin version from package.json (cached)
		const pluginVersion = await getPluginVersion(pluginName)

		// Create plugin-scoped context
		const context: PluginContext = {
			mode,
			config: pluginData.options,
			state: createPluginState(pluginName),
			logger: loggerInstance.fork(inferNamespace(pluginName)),
			env: Env,
			meta: {
				name: pluginName,
				version: pluginVersion
			}
		}

		try {
			loggerInstance.debug(`Executing start hook for ${pluginName}...`)
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

	// 2. Execute project's start hook LAST (if exists)
	const projectHookPath = await resolveProjectHookPath('start', mode)
	if (projectHookPath) {
		try {
			loggerInstance.debug('Executing project start hook...')
			const hookModule = await import(pathToFileURL(projectHookPath).href)

			if (typeof hookModule.default === 'function') {
				const hookPromise = hookModule.default({
					config,
					logger: loggerInstance,
					env: Env,
					mode
				})

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
 * Execute stop hooks for all registered plugins and project.
 * Runs sequentially: project FIRST, then plugins in REVERSE registration order.
 *
 * This runs when shutdown signal is received.
 */
export async function executeStopHooks(
	plugins: Map<string, PluginData>,
	mode: 'development' | 'production',
	reason: 'signal' | 'error' | 'restart' = 'signal'
): Promise<void> {
	const config = getConfig()
	const loggerInstance = logger()
	const timeoutDuration = config?.timeouts?.lifecycle ?? DEFAULT_CONFIG.timeouts.lifecycle

	// 1. Execute project's stop hook FIRST (if exists)
	const projectHookPath = await resolveProjectHookPath('stop', mode)
	if (projectHookPath) {
		try {
			loggerInstance.debug('Executing project stop hook...')
			const hookModule = await import(pathToFileURL(projectHookPath).href)

			if (typeof hookModule.default === 'function') {
				const hookPromise = hookModule.default({
					config,
					logger: loggerInstance,
					env: Env,
					mode,
					reason
				})

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

	// 2. Execute plugin stop hooks in REVERSE registration order
	const pluginEntries = Array.from(plugins.entries()).reverse()

	for (const [pluginName, pluginData] of pluginEntries) {
		const hookPath = await resolvePluginHookPath(pluginName, 'stop')

		if (!hookPath) {
			continue // Plugin doesn't have a stop hook
		}

		// Get plugin version from cache
		const pluginVersion = await getPluginVersion(pluginName)

		// Create plugin-scoped context with StopContext
		const context: StopContext = {
			mode,
			reason,
			config: pluginData.options,
			state: createPluginState(pluginName),
			logger: loggerInstance.fork(inferNamespace(pluginName)),
			env: Env,
			meta: {
				name: pluginName,
				version: pluginVersion
			}
		}

		try {
			loggerInstance.debug(`Executing stop hook for ${pluginName}...`)
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
}
