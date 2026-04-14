/**
 * HMR Mapper
 *
 * Maps file paths to their corresponding portal routes and handlers.
 * Used by the dev command to determine what needs to be hot-reloaded.
 */

import type { Change } from './watcher.js'
import type { RouteDefinitions } from '../../types/manifest-v1.js'

/**
 * Result of mapping a file to its route/handler location.
 */
export interface HmrMapping {
	/** Namespace (e.g., 'discord', 'api', 'project') */
	namespace: string
	/** Route name (e.g., 'commands', 'events', 'routes') */
	route: string
	/** Handler key (e.g., 'ping', 'ready', 'users/[id]') */
	key: string
	/** Type of file */
	type: 'handler' | 'utility' | 'config' | 'hook'
	/** Original file path */
	filePath: string
	/** Source directory the file belongs to */
	sourceDir: string
}

/**
 * Result of detecting route changes (added/removed/modified handlers).
 */
export interface RouteChanges {
	added: HmrMapping[]
	removed: HmrMapping[]
	modified: HmrMapping[]
}

/**
 * Patterns that require a full restart instead of HMR.
 */
const REQUIRES_FULL_RESTART: RegExp[] = [
	/^src\/robo\/hooks\//,           // Lifecycle hooks
	/^src\/robo\/routes\//,          // Route definitions
	/^src\/robo\/terminal\//,        // Terminal commands
	/^config\//,                      // Config files
	/robo\.config\./,                 // Robo config
	/tsconfig\.json$/,                // TypeScript config
	/\.env$/,                         // Environment variables
	/^\.robo\//,                      // Build artifacts
]

type AnyRouteDefinition = RouteDefinitions[string]['routes'][string]

/**
 * Strip the src/ prefix from a file path if present.
 * Route definitions use directories without the src/ prefix (e.g., 'events' not 'src/events').
 */
function stripSrcPrefix(filePath: string): string {
	return filePath.replace(/^src\//, '')
}

/**
 * Generate a key from path segments based on the route's KeyConfig.
 * Mirrors `generateKey` in `route-scanner.ts` (minus non-serializable transforms).
 */
function generateKey(segments: string[], keyConfig: AnyRouteDefinition['key']): string {
	if (segments.length === 0) {
		return ''
	}

	// Generate base key based on style
	if (keyConfig.style === 'filename') {
		return segments[segments.length - 1]
	}

	if (keyConfig.style === 'parentOrFilename') {
		return segments.length > 1 ? segments[0] : segments[segments.length - 1]
	}

	// filepath style - join with separator
	const separator = keyConfig.separator ?? '/'

	if (keyConfig.nested === 'camelCase') {
		return segments
			.map((seg, i) => (i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1)))
			.join('')
	}

	if (keyConfig.nested === 'dotNotation') {
		return segments.join('.')
	}

	return segments.join(separator)
}

/**
 * Check if a file change requires a full restart.
 */
export function requiresFullRestart(filePath: string): boolean {
	const normalizedPath = filePath.replace(/\\/g, '/')
	return REQUIRES_FULL_RESTART.some(pattern => pattern.test(normalizedPath))
}

/**
 * Compute the handler key for a file under a route directory.
 *
 * Returns null when the file should not be treated as a handler for the route
 * (filtered out, index not allowed, exceeds nesting maxDepth, etc.).
 *
 * In those cases we treat it as a utility file (it may still be imported by handlers).
 */
function computeHandlerKey(relativePath: string, routeDef: AnyRouteDefinition): string | null {
	// Remove file extension
	const withoutExt = relativePath.replace(/\.(ts|tsx|js|jsx|mjs|mts)$/, '')
	if (!withoutExt) return null

	const segments = withoutExt.split('/').filter(Boolean)
	if (segments.length === 0) return null

	const basename = segments[segments.length - 1]
	const dirSegments = segments.slice(0, -1)

	// Filter applies to the file basename (route-scanner behavior)
	if (routeDef.filter) {
		try {
			const filter = new RegExp(routeDef.filter)
			if (!filter.test(basename)) {
				return null
			}
		} catch {
			// Invalid filter should not break HMR; treat as handler to avoid surprising skips
		}
	}

	// Enforce nesting maxDepth (route-scanner skips traversal when currentDepth > maxDepth)
	const maxDepth = routeDef.nesting?.maxDepth
	if (maxDepth !== undefined && dirSegments.length > maxDepth) {
		return null
	}

	// Index handling mirrors route-scanner: index.ts maps to the parent folder key when allowed,
	// otherwise it's skipped as a handler.
	const isIndex = basename === 'index'
	const allowIndex = routeDef.nesting?.allowIndex ?? true
	if (isIndex && !allowIndex) {
		return null
	}

	const keySegments = isIndex ? dirSegments : [...dirSegments, basename]
	if (keySegments.length === 0) {
		// Root index produces empty key and is skipped by route-scanner.
		return null
	}

	return generateKey(keySegments, routeDef.key)
}

/**
 * Map a single file path to its route/handler location.
 * Returns null if the file is outside src/ and not a special config/hook path.
 *
 * Uses route definitions from the manifest to dynamically determine namespaces.
 * This allows HMR to work with any plugins regardless of their namespace configuration.
 */
export function mapFileToRoute(filePath: string, routeDefinitions?: RouteDefinitions): HmrMapping | null {
	const normalizedPath = filePath.replace(/\\/g, '/')

	// Handle empty path
	if (!normalizedPath) {
		return null
	}

	// Check if it's a config/hook file that needs full restart
	if (requiresFullRestart(normalizedPath)) {
		return {
			namespace: '',
			route: '',
			key: '',
			type: getFileType(normalizedPath),
			filePath: normalizedPath,
			sourceDir: ''
		}
	}

	// Strip src/ prefix for matching against route definitions
	// Route definitions use directories like 'events' not 'src/events'
	const pathWithoutSrc = stripSrcPrefix(normalizedPath)

	// Match against route definitions (dynamically loaded from manifest)
	if (routeDefinitions) {
		for (const [namespace, nsDef] of Object.entries(routeDefinitions)) {
			for (const [routeName, routeDef] of Object.entries(nsDef.routes)) {
				const directory = routeDef.directory
				if (pathWithoutSrc.startsWith(directory + '/') || pathWithoutSrc === directory) {
					const relativePath = pathWithoutSrc.slice(directory.length + 1)
					const key = computeHandlerKey(relativePath, routeDef)

					// If the file is within a handler directory but isn't a handler for this route
					// (filtered, index disallowed, too deep), treat it as a utility file.
					if (!key) {
						return {
							namespace: '',
							route: '',
							key: '',
							type: 'utility',
							filePath: normalizedPath,
							sourceDir: 'src'
						}
					}

					return {
						namespace,
						route: routeName,
						key,
						type: 'handler',
						filePath: normalizedPath,
						sourceDir: 'src/' + directory
					}
				}
			}
		}
	}

	// Check if it's in src/ but not a known handler directory (utility file)
	if (normalizedPath.startsWith('src/')) {
		return {
			namespace: '',
			route: '',
			key: '',
			type: 'utility',
			filePath: normalizedPath,
			sourceDir: 'src'
		}
	}

	return null
}

/**
 * Determine file type from path.
 */
function getFileType(filePath: string): 'handler' | 'utility' | 'config' | 'hook' {
	if (filePath.includes('/robo/hooks/') || filePath.includes('/robo/')) {
		return 'hook'
	}
	if (filePath.startsWith('config/') || filePath.includes('robo.config')) {
		return 'config'
	}
	return 'utility'
}

/**
 * Get all affected routes from a list of file changes.
 * Filters out non-handler files and groups by route.
 */
export function getAffectedRoutes(
	changes: Change[],
	routeDefinitions?: RouteDefinitions
): HmrMapping[] {
	const mappings: HmrMapping[] = []

	for (const change of changes) {
		const mapping = mapFileToRoute(change.filePath, routeDefinitions)
		if (mapping && mapping.type === 'handler') {
			mappings.push(mapping)
		}
	}

	return mappings
}

/**
 * Detect what type of changes occurred (added/removed/modified).
 */
export function detectRouteChanges(
	changes: Change[],
	routeDefinitions?: RouteDefinitions
): RouteChanges {
	const result: RouteChanges = {
		added: [],
		removed: [],
		modified: []
	}

	for (const change of changes) {
		const mapping = mapFileToRoute(change.filePath, routeDefinitions)
		if (!mapping || mapping.type !== 'handler') {
			continue
		}

		switch (change.changeType) {
			case 'added':
				result.added.push(mapping)
				break
			case 'removed':
				result.removed.push(mapping)
				break
			case 'changed':
				result.modified.push(mapping)
				break
		}
	}

	return result
}

/**
 * Get non-handler changes that should trigger a warning.
 * These are utility files that don't hot-reload.
 */
export function getNonHandlerChanges(
	changes: Change[],
	routeDefinitions?: RouteDefinitions
): HmrMapping[] {
	const mappings: HmrMapping[] = []

	for (const change of changes) {
		const mapping = mapFileToRoute(change.filePath, routeDefinitions)
		if (mapping && mapping.type === 'utility') {
			mappings.push(mapping)
		}
	}

	return mappings
}

/**
 * Get files that require a full restart.
 */
export function getRestartRequiredChanges(changes: Change[]): Change[] {
	return changes.filter(change => requiresFullRestart(change.filePath))
}

/**
 * Group mappings by their route (namespace:route).
 */
export function groupByRoute(mappings: HmrMapping[]): Map<string, HmrMapping[]> {
	const groups = new Map<string, HmrMapping[]>()

	for (const mapping of mappings) {
		const key = `${mapping.namespace}:${mapping.route}`
		if (!groups.has(key)) {
			groups.set(key, [])
		}
		groups.get(key)!.push(mapping)
	}

	return groups
}

/**
 * Get unique routes that need to be reloaded.
 * Returns tuples of [namespace, route].
 */
export function getUniqueRoutes(mappings: HmrMapping[]): Array<[string, string]> {
	const seen = new Set<string>()
	const routes: Array<[string, string]> = []

	for (const mapping of mappings) {
		const key = `${mapping.namespace}:${mapping.route}`
		if (!seen.has(key)) {
			seen.add(key)
			routes.push([mapping.namespace, mapping.route])
		}
	}

	return routes
}
