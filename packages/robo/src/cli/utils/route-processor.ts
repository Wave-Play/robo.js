/**
 * Route Processor Utility
 *
 * Processes ScannedEntry objects through route processors to create ProcessedEntry objects.
 * Handles default processing when no custom processor is defined by the route.
 */

import { logger } from '../../core/logger.js'
import type {
	DiscoveredRoute,
	ScannedEntry,
	ProcessedEntry,
	RouteEntries,
	ExportsConfig
} from '../../types/routes.js'

/**
 * Extract export information from a module.
 */
function extractExports(
	exports: Record<string, unknown>,
	exportsConfig?: ExportsConfig
): ProcessedEntry['exports'] {
	const result: ProcessedEntry['exports'] = {
		default: false,
		config: false,
		named: []
	}

	// Check default export
	if ('default' in exports && exports.default !== undefined) {
		result.default = true
	}

	// Check config export
	if ('config' in exports && exports.config !== undefined) {
		result.config = true
	}

	// Check named exports
	if (exportsConfig?.named) {
		for (const namedExport of exportsConfig.named) {
			if (namedExport in exports && exports[namedExport] !== undefined) {
				result.named.push(namedExport)
			}
		}
	}

	return result
}

/**
 * Default processor for entries when no custom processor is provided.
 * Extracts basic metadata from the config export.
 */
function defaultProcessor(entry: ScannedEntry, route: DiscoveredRoute): ProcessedEntry {
	const config = entry.exports.config as Record<string, unknown> | undefined

	const processed: ProcessedEntry = {
		key: entry.key,
		path: entry.filePath,
		exports: extractExports(entry.exports, route.config.exports),
		metadata: config ?? {},
		module: (entry as ScannedEntry & { module?: string }).module
	}

	// Add dynamic segment info to extra if present
	if (entry.dynamicSegments) {
		processed.extra = {
			params: entry.dynamicSegments.params,
			...(entry.dynamicSegments.catchAll && { catchAll: entry.dynamicSegments.catchAll })
		}
	}

	return processed
}

/**
 * Process a single scanned entry through the route's processor.
 */
async function processEntry(entry: ScannedEntry, route: DiscoveredRoute): Promise<ProcessedEntry> {
	const loggerInstance = logger()

	try {
		// Use custom processor if provided, otherwise use default
		if (route.processor) {
			const result = await route.processor(entry)
			return result
		}

		return defaultProcessor(entry, route)
	} catch (error) {
		loggerInstance.error(`Failed to process entry ${entry.key}:`, error)

		// Return a minimal entry on error
		return {
			key: entry.key,
			path: entry.filePath,
			exports: extractExports(entry.exports, route.config.exports),
			metadata: {},
			extra: { error: String(error) }
		}
	}
}

/**
 * Process all scanned entries for a route.
 */
export async function processRouteEntries(
	route: DiscoveredRoute,
	entries: ScannedEntry[]
): Promise<ProcessedEntry[]> {
	const loggerInstance = logger()
	const processedEntries: ProcessedEntry[] = []

	loggerInstance.debug(`Processing ${entries.length} entries for ${route.namespace}:${route.name}`)

	// Process entries in parallel
	const results = await Promise.all(entries.map((entry) => processEntry(entry, route)))

	for (const result of results) {
		processedEntries.push(result)
	}

	return processedEntries
}

/**
 * Process all routes and their entries.
 * Returns entries organized by namespace and route name.
 */
export async function processAllRoutes(
	scannedResults: Map<DiscoveredRoute, ScannedEntry[]>
): Promise<RouteEntries> {
	const loggerInstance = logger()
	const routeEntries: RouteEntries = {}

	loggerInstance.debug(`Processing entries for ${scannedResults.size} routes...`)

	// Process each route's entries
	for (const [route, entries] of scannedResults) {
		const processedEntries = await processRouteEntries(route, entries)

		// Initialize namespace if needed
		if (!routeEntries[route.namespace]) {
			routeEntries[route.namespace] = {}
		}

		// Store entries under namespace.routeName
		routeEntries[route.namespace][route.name] = processedEntries
	}

	return routeEntries
}

/**
 * Validate processed entries based on route configuration.
 * Returns an array of error messages, empty if all valid.
 */
export function validateProcessedEntries(
	route: DiscoveredRoute,
	entries: ProcessedEntry[]
): string[] {
	const errors: string[] = []
	const { config } = route
	const keySet = new Set<string>()

	for (const entry of entries) {
		// Check for duplicate keys (unless multiple is allowed)
		if (!config.multiple && keySet.has(entry.key)) {
			errors.push(
				`Duplicate key "${entry.key}" in ${route.namespace}:${route.name}. ` +
					`Set "multiple: true" in route config to allow multiple handlers per key.`
			)
		}
		keySet.add(entry.key)

		// Check required exports
		const exportsConfig = config.exports

		if (exportsConfig?.default === 'required' && !entry.exports.default) {
			errors.push(
				`Entry "${entry.key}" in ${route.namespace}:${route.name} is missing required default export.`
			)
		}

		if (exportsConfig?.config === 'required' && !entry.exports.config) {
			errors.push(
				`Entry "${entry.key}" in ${route.namespace}:${route.name} is missing required config export.`
			)
		}

		// Check forbidden exports
		if (exportsConfig?.default === 'forbidden' && entry.exports.default) {
			errors.push(
				`Entry "${entry.key}" in ${route.namespace}:${route.name} has forbidden default export.`
			)
		}

		if (exportsConfig?.config === 'forbidden' && entry.exports.config) {
			errors.push(
				`Entry "${entry.key}" in ${route.namespace}:${route.name} has forbidden config export.`
			)
		}
	}

	return errors
}

/**
 * Merge route entries into a flat structure for backward compatibility.
 * This converts the new RouteEntries format into the legacy manifest format.
 */
export function flattenRouteEntries(
	routeEntries: RouteEntries
): Map<string, ProcessedEntry[]> {
	const flattened = new Map<string, ProcessedEntry[]>()

	for (const [namespace, routes] of Object.entries(routeEntries)) {
		for (const [routeName, entries] of Object.entries(routes)) {
			const flatKey = `${namespace}:${routeName}`
			flattened.set(flatKey, entries)
		}
	}

	return flattened
}

/**
 * Get entries for a specific route type.
 */
export function getEntriesForType(
	routeEntries: RouteEntries,
	namespace: string,
	routeName: string
): ProcessedEntry[] {
	return routeEntries[namespace]?.[routeName] ?? []
}

/**
 * Count total entries across all routes.
 */
export function countTotalEntries(routeEntries: RouteEntries): number {
	let count = 0

	for (const routes of Object.values(routeEntries)) {
		for (const entries of Object.values(routes)) {
			count += entries.length
		}
	}

	return count
}
