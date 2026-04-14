/**
 * Plugin Manifest Merger
 *
 * Reads plugin manifests from the granular format and merges their entries
 * into the route entries for the consuming project. This enables seamless
 * plugin integration where plugin commands, events, etc. are automatically discovered.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { logger } from '../../core/logger.js'
import { findPackagePath } from './utils.js'
import type { HandlerEntry, PluginRegistry, RouteDefinitions } from '../../types/manifest-v1.js'
import type { ProcessedEntry, RouteEntries } from '../../types/routes.js'
import type { PluginData } from '../../types/common.js'

/**
 * Plugin manifest file structure.
 */
interface PluginManifestData {
	routeDefinitions: RouteDefinitions
	plugins: PluginRegistry
	routes: Record<string, Record<string, HandlerEntry[]>>
}

/**
 * Read the plugin's granular manifest files.
 * Plugins typically ship with production manifests, so falls back to production if current mode doesn't exist.
 * @param packagePath - Path to the plugin's package directory
 * @param mode - Build mode to read from
 */
async function readPluginManifest(packagePath: string, mode: string): Promise<PluginManifestData | null> {
	const loggerInstance = logger()

	// Try current mode first, then fall back to production
	const modesToTry = mode === 'production' ? ['production'] : [mode, 'production']
	let manifestBase: string | null = null

	for (const modeToTry of modesToTry) {
		const candidatePath = path.join(packagePath, '.robo', 'manifest', modeToTry)
		try {
			await fs.readdir(candidatePath)
			manifestBase = candidatePath
			if (modeToTry !== mode) {
				loggerInstance.debug(`Falling back to ${modeToTry} manifest for ${packagePath}`)
			}
			break
		} catch {
			// Try next mode
		}
	}

	if (!manifestBase) {
		loggerInstance.debug(`No granular manifest found at ${packagePath}/.robo/manifest/{${modesToTry.join(',')}}`)
		return null
	}

	// Read route definitions
	let routeDefinitions: RouteDefinitions = {}
	try {
		const routesIndexPath = path.join(manifestBase, 'routes', '@.json')
		const content = await fs.readFile(routesIndexPath, 'utf-8')
		routeDefinitions = JSON.parse(content)
	} catch {
		loggerInstance.debug(`No routes/@.json found in plugin manifest`)
	}

	// Read plugins registry
	let plugins: PluginRegistry = {}
	try {
		const pluginsPath = path.join(manifestBase, 'plugins.json')
		const content = await fs.readFile(pluginsPath, 'utf-8')
		plugins = JSON.parse(content)
	} catch {
		loggerInstance.debug(`No plugins.json found in plugin manifest`)
	}

	// Read all route files
	const routes: Record<string, Record<string, HandlerEntry[]>> = {}

	for (const [namespace, nsData] of Object.entries(routeDefinitions)) {
		routes[namespace] = {}

		for (const routeName of Object.keys(nsData.routes)) {
			try {
				const routeFilePath = path.join(manifestBase, 'routes', `${namespace}.${routeName}.json`)
				const content = await fs.readFile(routeFilePath, 'utf-8')
				const entries = JSON.parse(content) as HandlerEntry[]

				// Only include entries that are not empty
				if (entries.length > 0) {
					routes[namespace][routeName] = entries
				}
			} catch {
				loggerInstance.debug(`No route file for ${namespace}.${routeName}`)
			}
		}
	}

	return { routeDefinitions, plugins, routes }
}

/**
 * Convert HandlerEntry to ProcessedEntry format.
 */
function convertHandlerToProcessed(entry: HandlerEntry, pluginName: string, packagePath: string): ProcessedEntry {
	return {
		key: entry.key,
		path: entry.path,
		exports: entry.exports ?? { default: true, config: false, named: [] },
		metadata: {
			...entry.metadata,
			__plugin: {
				name: pluginName,
				path: packagePath
			}
		},
		module: pluginName,
		extra: entry.extra
	}
}

/**
 * Merge plugin manifests into route entries.
 * This reads each plugin's granular manifest and merges their entries
 * into the consuming project's route entries.
 *
 * @param plugins - Map of plugin names to plugin data
 * @param routeEntries - Existing route entries to merge into
 * @param mode - Build mode (development, production, etc.)
 * @returns Updated route entries with plugin entries merged in
 */
export async function mergePluginManifests(
	plugins: Map<string, PluginData>,
	routeEntries: RouteEntries,
	mode = 'production'
): Promise<RouteEntries> {
	const loggerInstance = logger()
	const mergedEntries = { ...routeEntries }

	if (plugins.size === 0) {
		return mergedEntries
	}

	loggerInstance.debug(`Merging manifests from ${plugins.size} plugin(s) using mode: ${mode}...`)

	for (const [pluginName] of plugins) {
		// Find the plugin's package path
		const packagePath = await findPackagePath(pluginName, process.cwd())
		if (!packagePath) {
			loggerInstance.debug(`Plugin ${pluginName} is not installed. Skipping...`)
			continue
		}

		// Read the plugin's granular manifest
		const manifestData = await readPluginManifest(packagePath, mode)

		if (!manifestData) {
			loggerInstance.debug(`No manifest found for ${pluginName}. Skipping...`)
			continue
		}

		loggerInstance.debug(`Loading granular manifest from ${pluginName}...`)

		// Merge route entries from the plugin
		for (const [namespace, routes] of Object.entries(manifestData.routes)) {
			if (!mergedEntries[namespace]) {
				mergedEntries[namespace] = {}
			}

			for (const [routeName, entries] of Object.entries(routes)) {
				if (!mergedEntries[namespace][routeName]) {
					mergedEntries[namespace][routeName] = []
				}

				// Convert HandlerEntry to ProcessedEntry and add to merged entries
				const processedEntries = entries.map((entry) =>
					convertHandlerToProcessed(entry, pluginName, packagePath)
				)

				mergedEntries[namespace][routeName].push(...processedEntries)
				loggerInstance.debug(
					`Merged ${processedEntries.length} ${routeName} entries from ${pluginName} into ${namespace}`
				)
			}
		}
	}

	return mergedEntries
}
