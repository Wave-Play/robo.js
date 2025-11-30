/**
 * Hook Discovery Utility
 *
 * Discovers lifecycle and build hooks from plugins and the project at build time.
 * Creates HookEntry objects for the manifest system, enabling faster runtime startup
 * by pre-indexing available hooks.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { logger } from '../../core/logger.js'
import type { HookEntry, HooksManifest } from '../../types/manifest-v1.js'
import type { PluginData } from '../../types/common.js'

/**
 * Lifecycle hook types that can be discovered.
 */
export type LifecycleHookType = 'init' | 'start' | 'stop' | 'setup'

/**
 * Build hook types that can be discovered.
 */
export type BuildHookType = 'build/start' | 'build/transform' | 'build/complete'

/**
 * All hook types.
 */
export type HookType = LifecycleHookType | BuildHookType

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
 * Get possible paths for a plugin hook.
 */
function getPluginHookPaths(pluginName: string, hookType: HookType): string[] {
	const hookPath = hookType.includes('/') ? hookType : `robo/${hookType}`

	return [
		// Plugin package: node_modules/@robojs/discord/.robo/build/robo/init.js
		path.join(process.cwd(), 'node_modules', pluginName, '.robo', 'build', hookPath + '.js'),
		// Alternative: node_modules/@robojs/discord/dist/robo/init.js
		path.join(process.cwd(), 'node_modules', pluginName, 'dist', hookPath + '.js')
	]
}

/**
 * Get the path for a project hook.
 */
function getProjectHookPath(hookType: HookType): string {
	const hookPath = hookType.includes('/') ? hookType : `robo/${hookType}`
	return path.join(process.cwd(), '.robo', 'build', hookPath + '.js')
}

/**
 * Discover a single hook for a plugin.
 */
async function discoverPluginHook(
	pluginName: string,
	hookType: HookType,
	priority: number
): Promise<HookEntry | null> {
	const possiblePaths = getPluginHookPaths(pluginName, hookType)

	for (const hookPath of possiblePaths) {
		if (await fileExists(hookPath)) {
			const phase = hookType.startsWith('build/') ? hookType.split('/')[1] as 'start' | 'transform' | 'complete' : undefined

			return {
				id: `${pluginName}:${hookType}`,
				source: 'plugin',
				plugin: pluginName,
				path: hookPath,
				priority,
				phase
			}
		}
	}

	return null
}

/**
 * Discover a single hook for the project.
 */
async function discoverProjectHook(hookType: HookType, priority: number): Promise<HookEntry | null> {
	const hookPath = getProjectHookPath(hookType)

	if (await fileExists(hookPath)) {
		const phase = hookType.startsWith('build/') ? hookType.split('/')[1] as 'start' | 'transform' | 'complete' : undefined

		return {
			id: `project:${hookType}`,
			source: 'project',
			plugin: null,
			path: hookPath,
			priority,
			phase
		}
	}

	return null
}

/**
 * Discover all hooks of a specific type from plugins and project.
 *
 * Order:
 * - For lifecycle hooks (init, start): plugins first (by registration order), then project
 * - For stop hooks: project first, then plugins in reverse order
 * - For build hooks: project first, then plugins in parallel
 */
async function discoverHooksOfType(
	plugins: Map<string, PluginData>,
	hookType: HookType
): Promise<HookEntry[]> {
	const entries: HookEntry[] = []
	let priority = 0

	const isStopHook = hookType === 'stop'
	const isBuildHook = hookType.startsWith('build/')

	if (isBuildHook) {
		// Build hooks: project first
		const projectHook = await discoverProjectHook(hookType, priority++)
		if (projectHook) {
			entries.push(projectHook)
		}

		// Then plugins (can be parallel at runtime, but ordered here)
		for (const [pluginName] of plugins) {
			const pluginHook = await discoverPluginHook(pluginName, hookType, priority++)
			if (pluginHook) {
				entries.push(pluginHook)
			}
		}
	} else if (isStopHook) {
		// Stop hooks: project first, then plugins in reverse
		const projectHook = await discoverProjectHook(hookType, priority++)
		if (projectHook) {
			entries.push(projectHook)
		}

		const pluginEntries = Array.from(plugins.entries()).reverse()
		for (const [pluginName] of pluginEntries) {
			const pluginHook = await discoverPluginHook(pluginName, hookType, priority++)
			if (pluginHook) {
				entries.push(pluginHook)
			}
		}
	} else {
		// Lifecycle hooks (init, start, setup): plugins first, then project
		for (const [pluginName] of plugins) {
			const pluginHook = await discoverPluginHook(pluginName, hookType, priority++)
			if (pluginHook) {
				entries.push(pluginHook)
			}
		}

		const projectHook = await discoverProjectHook(hookType, priority++)
		if (projectHook) {
			entries.push(projectHook)
		}
	}

	return entries
}

/**
 * Discover all hooks from plugins and project.
 * Returns a HooksManifest organized by hook type.
 */
export async function discoverAllHooks(plugins: Map<string, PluginData>): Promise<HooksManifest> {
	const loggerInstance = logger()
	const manifest: HooksManifest = {}

	// All hook types to discover
	const hookTypes: HookType[] = [
		// Lifecycle hooks
		'init',
		'start',
		'stop',
		'setup',
		// Build hooks
		'build/start',
		'build/transform',
		'build/complete'
	]

	loggerInstance.debug('Discovering hooks...')

	for (const hookType of hookTypes) {
		const entries = await discoverHooksOfType(plugins, hookType)

		if (entries.length > 0) {
			// Normalize hook type for manifest key (build/start -> build.start)
			const manifestKey = hookType.replace('/', '.')
			manifest[manifestKey] = entries
			loggerInstance.debug(`Discovered ${entries.length} ${hookType} hook(s)`)
		}
	}

	const totalHooks = Object.values(manifest).reduce((sum, entries) => sum + entries.length, 0)
	loggerInstance.debug(`Discovered ${totalHooks} total hook(s)`)

	return manifest
}

/**
 * Get execution order for hooks at runtime.
 * Returns entries sorted by priority (lower = runs first).
 */
export function getHookExecutionOrder(entries: HookEntry[]): HookEntry[] {
	return [...entries].sort((a, b) => a.priority - b.priority)
}
