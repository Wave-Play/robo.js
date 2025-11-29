import { getConfig } from './config.js'
import { logger } from './logger.js'
import { Env } from './env.js'
import type { InitContext } from '../types/lifecycle.js'
import type { PluginData } from '../types/common.js'
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
 * Runs sequentially: project first, then plugins in registration order.
 * Respects failSafe meta option for error handling.
 */
export async function executeInitHooks(
	plugins: Map<string, PluginData>,
	mode: 'development' | 'production'
): Promise<void> {
	const config = getConfig()

	// Get the logger instance for use in hooks
	const loggerInstance = logger()

	// 1. Execute project's init hook first (if exists)
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

	// 2. Execute plugin init hooks in registration order
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
}
