/**
 * Route Scanner Utility
 *
 * Scans directories based on RouteConfig settings and generates ScannedEntry objects.
 * This is the core scanning logic that walks directories and creates entries
 * for each handler file found.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { logger } from '../../core/logger.js'
import { ALLOWED_EXTENSIONS } from '../../core/constants.js'
import { IS_BUN_RUNTIME } from './runtime-utils.js'
import { hasProperties } from './utils.js'
import type { DiscoveredRoute, ScannedEntry, KeyConfig, NestingConfig } from '../../types/routes.js'

/**
 * Options for scanning a route directory.
 */
export interface ScanRouteOptions {
	/**
	 * The discovered route definition.
	 */
	route: DiscoveredRoute

	/**
	 * Base directory to scan (e.g., .robo/build).
	 */
	buildDirectory: string

	/**
	 * Whether to also scan module directories.
	 * @default true
	 */
	includeModules?: boolean
}

/**
 * Internal options for recursive scanning.
 */
interface RecursiveScanOptions {
	route: DiscoveredRoute
	basePath: string
	currentPath: string
	currentDepth: number
	pathSegments: string[]
	modulePrefix?: string
}

/**
 * Information about a dynamic segment in a path.
 */
interface DynamicSegmentInfo {
	/** The parameter name extracted from the segment */
	param: string
	/** Type of segment: 'dynamic', 'catchAll', or 'optionalCatchAll' */
	type: 'dynamic' | 'catchAll' | 'optionalCatchAll'
	/** Original segment string (e.g., '[id]', '[...path]') */
	original: string
}

/**
 * Default regex patterns for dynamic segments.
 */
const DEFAULT_DYNAMIC_SEGMENT = /^\[([^\].]+)\]$/
const DEFAULT_CATCH_ALL = /^\[\.\.\.([^\]]+)\]$/
const DEFAULT_OPTIONAL_CATCH_ALL = /^\[\[\.\.\.([^\]]+)\]\]$/

/**
 * Parse a path segment to check if it's a dynamic segment.
 */
function parseDynamicSegment(
	segment: string,
	nesting?: {
		dynamicSegment?: RegExp
		catchAllSegment?: RegExp
		optionalCatchAll?: RegExp
	}
): DynamicSegmentInfo | null {
	const dynamicPattern = nesting?.dynamicSegment ?? DEFAULT_DYNAMIC_SEGMENT
	const catchAllPattern = nesting?.catchAllSegment ?? DEFAULT_CATCH_ALL
	const optionalCatchAllPattern = nesting?.optionalCatchAll ?? DEFAULT_OPTIONAL_CATCH_ALL

	// Check optional catch-all first (most specific)
	let match = segment.match(optionalCatchAllPattern)
	if (match) {
		return {
			param: match[1],
			type: 'optionalCatchAll',
			original: segment
		}
	}

	// Check catch-all
	match = segment.match(catchAllPattern)
	if (match) {
		return {
			param: match[1],
			type: 'catchAll',
			original: segment
		}
	}

	// Check dynamic segment
	match = segment.match(dynamicPattern)
	if (match) {
		return {
			param: match[1],
			type: 'dynamic',
			original: segment
		}
	}

	return null
}

/**
 * Extract all dynamic segment info from path segments.
 */
function extractDynamicSegments(
	segments: string[],
	nesting?: {
		dynamicSegment?: RegExp
		catchAllSegment?: RegExp
		optionalCatchAll?: RegExp
	}
): {
	params: string[]
	catchAll?: { param: string; optional: boolean }
} {
	const params: string[] = []
	let catchAll: { param: string; optional: boolean } | undefined

	for (const segment of segments) {
		const info = parseDynamicSegment(segment, nesting)
		if (!info) continue

		if (info.type === 'dynamic') {
			params.push(info.param)
		} else if (info.type === 'catchAll') {
			catchAll = { param: info.param, optional: false }
		} else if (info.type === 'optionalCatchAll') {
			catchAll = { param: info.param, optional: true }
		}
	}

	return { params, catchAll }
}

/**
 * Generate a key from path segments based on KeyConfig.
 */
function generateKey(segments: string[], keyConfig: KeyConfig): string {
	if (segments.length === 0) {
		return ''
	}

	// For filename style, use only the last segment
	if (keyConfig.style === 'filename') {
		return segments[segments.length - 1]
	}

	// For filepath style, join with separator
	const separator = keyConfig.separator ?? '/'

	// Apply nested transformation if specified
	if (keyConfig.nested === 'camelCase') {
		// guild/memberAdd → guildMemberAdd
		return segments
			.map((seg, i) => (i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1)))
			.join('')
	}

	if (keyConfig.nested === 'dotNotation') {
		return segments.join('.')
	}

	// Default: join with separator
	let key = segments.join(separator)

	// Apply custom transform if provided
	if (keyConfig.transform) {
		key = keyConfig.transform(key)
	}

	return key
}

/**
 * Check if a filename passes the route's filter.
 */
function passesFilter(filename: string, filter?: RegExp): boolean {
	if (!filter) {
		return true
	}
	return filter.test(filename)
}

/**
 * Get the file name without extension.
 */
function getBaseName(filename: string): string {
	return path.basename(filename, path.extname(filename))
}

/**
 * Recursively scan a directory for handler files.
 */
async function scanDirectoryRecursive(options: RecursiveScanOptions): Promise<ScannedEntry[]> {
	const { route, basePath, currentPath, currentDepth, pathSegments, modulePrefix } = options
	const { config } = route
	const loggerInstance = logger()
	const entries: ScannedEntry[] = []

	// Check max depth
	const maxDepth = config.nesting?.maxDepth
	if (maxDepth !== undefined && currentDepth > maxDepth) {
		loggerInstance.debug(`Skipping ${currentPath}: exceeds max depth of ${maxDepth}`)
		return entries
	}

	let directory: string[]
	try {
		directory = await fs.readdir(currentPath)
	} catch (error) {
		if (hasProperties<{ code: string }>(error, ['code']) && error.code === 'ENOENT') {
			// Directory doesn't exist - this is fine
			return entries
		}
		throw error
	}

	// Separate files and directories
	const files: string[] = []
	const directories: string[] = []

	await Promise.all(
		directory.map(async (item) => {
			const itemPath = path.join(currentPath, item)
			const stat = await fs.stat(itemPath)

			if (stat.isFile() && ALLOWED_EXTENSIONS.includes(path.extname(item))) {
				files.push(item)
			} else if (stat.isDirectory()) {
				directories.push(item)
			}
		})
	)

	// Process files first (parent entries before children)
	for (const file of files) {
		const basename = getBaseName(file)

		// Check filter
		if (!passesFilter(basename, config.filter)) {
			loggerInstance.debug(`Skipping ${file}: filtered out`)
			continue
		}

		// Handle index files
		const isIndex = basename === 'index'
		const allowIndex = config.nesting?.allowIndex ?? true

		if (isIndex && !allowIndex) {
			loggerInstance.debug(`Skipping ${file}: index files not allowed`)
			continue
		}

		// Build path segments for key generation
		const fileSegments = isIndex ? [...pathSegments] : [...pathSegments, basename]

		// Skip empty segments (root index)
		if (fileSegments.length === 0) {
			loggerInstance.debug(`Skipping ${file}: would produce empty key`)
			continue
		}

		// Generate key
		const key = generateKey(fileSegments, config.key)

		// Build full file path and import it
		const fullPath = path.join(currentPath, file)
		let importPath = pathToFileURL(fullPath).toString()
		if (IS_BUN_RUNTIME) {
			importPath = decodeURIComponent(importPath)
		}

		try {
			const module = await import(importPath)

			// Build relative path from base
			const relativePath = path.relative(basePath, fullPath)

			// Build file path relative to src
			const filePath = path.join(route.directory, relativePath)

			// Extract dynamic segment info from path segments
			const dynamicInfo = extractDynamicSegments(fileSegments, config.nesting)

			const entry: ScannedEntry = {
				key,
				type: `${route.namespace}:${route.name}`,
				filePath,
				relativePath,
				exports: module
			}

			// Add dynamic segment info if present
			if (dynamicInfo.params.length > 0 || dynamicInfo.catchAll) {
				entry.dynamicSegments = dynamicInfo
			}

			// Add module prefix if scanning from modules directory
			if (modulePrefix) {
				;(entry as ScannedEntry & { module?: string }).module = modulePrefix
			}

			entries.push(entry)
			loggerInstance.debug(`Scanned entry: ${entry.type} -> "${key}" from ${relativePath}`)
		} catch (error) {
			loggerInstance.error(`Failed to import ${fullPath}:`, error)
		}
	}

	// Recurse into directories
	for (const dir of directories) {
		const dirPath = path.join(currentPath, dir)
		const newSegments = [...pathSegments, dir]

		const subEntries = await scanDirectoryRecursive({
			route,
			basePath,
			currentPath: dirPath,
			currentDepth: currentDepth + 1,
			pathSegments: newSegments,
			modulePrefix
		})

		entries.push(...subEntries)
	}

	return entries
}

/**
 * Scan a route's directory and return all scanned entries.
 */
export async function scanRoute(options: ScanRouteOptions): Promise<ScannedEntry[]> {
	const { route, buildDirectory, includeModules = true } = options
	const loggerInstance = logger()
	const allEntries: ScannedEntry[] = []

	loggerInstance.debug(`Scanning route: ${route.namespace}:${route.name} (${route.directory})`)

	// Scan main directory
	const mainDir = path.join(buildDirectory, route.directory)
	const mainEntries = await scanDirectoryRecursive({
		route,
		basePath: mainDir,
		currentPath: mainDir,
		currentDepth: 1,
		pathSegments: []
	})
	allEntries.push(...mainEntries)

	// Scan module directories if enabled
	if (includeModules) {
		const modulesDir = path.join(buildDirectory, 'modules')

		try {
			const modules = await fs.readdir(modulesDir)

			for (const moduleName of modules) {
				const moduleRouteDir = path.join(modulesDir, moduleName, route.directory)

				try {
					const stat = await fs.stat(moduleRouteDir)
					if (!stat.isDirectory()) {
						continue
					}

					const moduleEntries = await scanDirectoryRecursive({
						route,
						basePath: moduleRouteDir,
						currentPath: moduleRouteDir,
						currentDepth: 1,
						pathSegments: [],
						modulePrefix: moduleName
					})

					allEntries.push(...moduleEntries)
				} catch {
					// Module doesn't have this route directory - skip
				}
			}
		} catch {
			// No modules directory - this is fine
		}
	}

	loggerInstance.debug(`Scanned ${allEntries.length} entries for ${route.namespace}:${route.name}`)
	return allEntries
}

/**
 * Scan all discovered routes and return entries grouped by route.
 */
export async function scanAllRoutes(
	routes: DiscoveredRoute[],
	buildDirectory: string
): Promise<Map<DiscoveredRoute, ScannedEntry[]>> {
	const loggerInstance = logger()
	const results = new Map<DiscoveredRoute, ScannedEntry[]>()

	loggerInstance.debug(`Scanning ${routes.length} routes...`)

	// Scan all routes in parallel
	await Promise.all(
		routes.map(async (route) => {
			const entries = await scanRoute({
				route,
				buildDirectory
			})
			results.set(route, entries)
		})
	)

	return results
}
