/**
 * Route Discovery Utility
 *
 * Discovers route definitions from plugins and the current project.
 * Route definitions are located in /src/robo/routes/ and tell Robo.js
 * how to scan directories and process handler files.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { logger } from '../../core/logger.js'
import { inferNamespace } from '../../core/hooks.js'
import { ALLOWED_EXTENSIONS } from '../../core/constants.js'
import type { DiscoveredRoute, RouteConfig } from '../../types/routes.js'
import type { PluginData } from '../../types/common.js'

/**
 * Check if a file or directory exists.
 */
async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

/**
 * Get the routes directory path for a plugin.
 * Checks both .robo/build and dist locations.
 */
async function getPluginRoutesDir(pluginName: string): Promise<string | null> {
	const possiblePaths = [
		// Plugin package: node_modules/@robojs/discord/.robo/build/robo/routes/
		path.join(process.cwd(), 'node_modules', pluginName, '.robo', 'build', 'robo', 'routes'),
		// Alternative: node_modules/@robojs/discord/dist/robo/routes/
		path.join(process.cwd(), 'node_modules', pluginName, 'dist', 'robo', 'routes')
	]

	for (const routesDir of possiblePaths) {
		if (await pathExists(routesDir)) {
			return routesDir
		}
	}

	return null
}

/**
 * Get the routes directory path for the current project.
 */
async function getProjectRoutesDir(): Promise<string | null> {
	const routesDir = path.join(process.cwd(), '.robo', 'build', 'robo', 'routes')

	if (await pathExists(routesDir)) {
		return routesDir
	}

	return null
}

/**
 * Load a route definition from a file.
 */
async function loadRouteDefinition(
	filePath: string,
	namespace: string
): Promise<DiscoveredRoute | null> {
	const loggerInstance = logger()

	try {
		const routeModule = await import(pathToFileURL(filePath).href)

		// Route files must have a config export
		const config = routeModule.config as RouteConfig | undefined
		if (!config) {
			loggerInstance.warn(`Route definition at ${filePath} is missing 'config' export`)
			return null
		}

		// Validate required config properties
		if (!config.key || !config.key.style) {
			loggerInstance.warn(`Route definition at ${filePath} has invalid key config`)
			return null
		}

		// Get route name from filename (e.g., commands.js -> commands)
		const routeName = path.basename(filePath, path.extname(filePath))

		// The directory to scan is inferred from the route name
		// /src/robo/routes/commands.ts → /src/commands/
		const directory = routeName

		// The processor is the default export (optional)
		const processor = typeof routeModule.default === 'function' ? routeModule.default : undefined

		// The controller factory is exported as 'controller' (optional, for Phase 5)
		const controller = typeof routeModule.controller === 'function' ? routeModule.controller : undefined

		// Type info for portal codegen (Phase 5)
		// Route files can export Handler and Controller type names as strings
		const typeInfo =
			routeModule.handlerType || routeModule.controllerType
				? {
						handlerType: typeof routeModule.handlerType === 'string' ? routeModule.handlerType : undefined,
						controllerType:
							typeof routeModule.controllerType === 'string' ? routeModule.controllerType : undefined
					}
				: undefined

		return {
			name: routeName,
			directory,
			config,
			processor,
			controller,
			typeInfo,
			namespace,
			sourcePath: filePath
		}
	} catch (error) {
		loggerInstance.error(`Failed to load route definition from ${filePath}:`, error)
		return null
	}
}

/**
 * Discover routes from a directory.
 */
async function discoverRoutesFromDir(
	routesDir: string,
	namespace: string
): Promise<DiscoveredRoute[]> {
	const loggerInstance = logger()
	const routes: DiscoveredRoute[] = []

	try {
		const files = await fs.readdir(routesDir)

		for (const file of files) {
			const filePath = path.join(routesDir, file)
			const stat = await fs.stat(filePath)

			// Only process files with allowed extensions
			if (!stat.isFile()) {
				continue
			}

			const ext = path.extname(file)
			if (!ALLOWED_EXTENSIONS.includes(ext)) {
				continue
			}

			const route = await loadRouteDefinition(filePath, namespace)
			if (route) {
				routes.push(route)
				loggerInstance.debug(`Discovered route: ${namespace}:${route.name}`)
			}
		}
	} catch (error) {
		// Directory doesn't exist or can't be read - this is fine
		loggerInstance.debug(`Could not read routes directory ${routesDir}:`, error)
	}

	return routes
}

/**
 * Discover all route definitions from plugins and the current project.
 *
 * Routes are discovered in order:
 * 1. Plugin routes (in registration order)
 * 2. Project routes (can override plugin routes)
 */
export async function discoverRoutes(
	plugins: Map<string, PluginData>
): Promise<DiscoveredRoute[]> {
	const loggerInstance = logger()
	const allRoutes: DiscoveredRoute[] = []
	const routeMap = new Map<string, DiscoveredRoute>()

	loggerInstance.debug('Discovering route definitions...')

	// 1. Discover routes from each plugin
	for (const [pluginName] of plugins) {
		const routesDir = await getPluginRoutesDir(pluginName)
		if (!routesDir) {
			continue
		}

		const namespace = inferNamespace(pluginName)
		const pluginRoutes = await discoverRoutesFromDir(routesDir, namespace)

		for (const route of pluginRoutes) {
			const routeKey = `${route.namespace}:${route.name}`

			// Check for conflicts
			if (routeMap.has(routeKey)) {
				const existing = routeMap.get(routeKey)!
				loggerInstance.warn(
					`Route conflict: "${routeKey}" defined by both "${existing.sourcePath}" and "${route.sourcePath}". Using latter.`
				)
			}

			routeMap.set(routeKey, route)
		}
	}

	// 2. Discover routes from the project
	const projectRoutesDir = await getProjectRoutesDir()
	if (projectRoutesDir) {
		// Project routes use 'project' namespace by default
		const projectRoutes = await discoverRoutesFromDir(projectRoutesDir, 'project')

		for (const route of projectRoutes) {
			const routeKey = `${route.namespace}:${route.name}`

			// Project routes can override plugin routes
			if (routeMap.has(routeKey)) {
				loggerInstance.debug(`Project route overriding: ${routeKey}`)
			}

			routeMap.set(routeKey, route)
		}
	}

	// Convert map to array
	for (const route of routeMap.values()) {
		allRoutes.push(route)
	}

	loggerInstance.debug(`Discovered ${allRoutes.length} route definition(s)`)
	return allRoutes
}

/**
 * Group discovered routes by the directory they scan.
 * This is useful for detecting conflicts where multiple routes
 * try to claim the same source directory.
 */
export function groupRoutesByDirectory(routes: DiscoveredRoute[]): Map<string, DiscoveredRoute[]> {
	const grouped = new Map<string, DiscoveredRoute[]>()

	for (const route of routes) {
		const existing = grouped.get(route.directory) ?? []
		existing.push(route)
		grouped.set(route.directory, existing)
	}

	return grouped
}

/**
 * Validate discovered routes for conflicts.
 * Returns an array of error messages, empty if valid.
 */
export function validateRoutes(routes: DiscoveredRoute[]): string[] {
	const errors: string[] = []
	const grouped = groupRoutesByDirectory(routes)

	for (const [directory, directoryRoutes] of grouped) {
		if (directoryRoutes.length > 1) {
			const sources = directoryRoutes.map((r) => `${r.namespace}:${r.name}`).join(', ')
			errors.push(
				`Directory "${directory}" is claimed by multiple routes: ${sources}. ` +
					`Only one route can scan each directory.`
			)
		}
	}

	return errors
}
