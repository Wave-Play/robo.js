/**
 * HMR Dependency Graph
 *
 * Builds and maintains a dependency graph from build output for HMR.
 * Tracks which modules import which other modules and provides
 * reverse traversal to find impacted handlers when utilities change.
 *
 * Key features:
 * - Build graph lazily from handler roots only
 * - Mtime caching to avoid re-parsing unchanged files
 * - Reverse traversal to find handler dependencies
 * - Handle circular dependencies safely
 */

import fs from 'node:fs'
import path from 'node:path'
import { parseImports } from './hmr-import-parser.js'
import type { RouteDefinitions } from '../../types/manifest-v1.js'

/**
 * Dependency graph for HMR.
 * Tracks module dependencies and reverse dependencies for efficient lookup.
 */
export interface DependencyGraph {
	/** Module → modules it imports (forward dependencies) */
	deps: Map<string, Set<string>>
	/** Module → modules that import it (reverse dependencies for lookup) */
	revDeps: Map<string, Set<string>>
	/** Module → last modified time (for caching to avoid re-parsing) */
	mtimes: Map<string, number>
	/** Modules with unresolved dynamic imports (variable specifiers) */
	hasUnresolvedDynamic: Set<string>
	/** Root directory of build output */
	buildRoot: string
}

export interface ImpactResult {
	impacted: string[]
	exceededLimit: boolean
	visitedCount: number
	/** All modules visited during traversal (for linker to know which files need rewriting) */
	visited: string[]
}

/**
 * Maximum number of nodes to visit during reverse traversal.
 * If exceeded, we fall back to route-level reload for safety.
 * Configurable via ROBO_HMR_MAX_TRAVERSAL environment variable.
 */
export const MAX_TRAVERSAL_NODES = parseInt(process.env.ROBO_HMR_MAX_TRAVERSAL || '1000', 10)

/**
 * Create an empty dependency graph.
 */
export function createGraph(buildRoot: string): DependencyGraph {
	return {
		deps: new Map(),
		revDeps: new Map(),
		mtimes: new Map(),
		hasUnresolvedDynamic: new Set(),
		buildRoot
	}
}

/**
 * Resolve an import specifier to a build-relative module path.
 * Returns null if the specifier cannot be resolved (external, non-existent, etc.)
 *
 * @param specifier - The import specifier (e.g., './utils/format.js')
 * @param importerDir - Directory of the importing module (relative to build root)
 * @param buildRoot - Absolute path to build root
 */
export function resolveSpecifier(
	specifier: string,
	importerDir: string,
	buildRoot: string
): string | null {
	// Only resolve relative imports (./ or ../)
	if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
		return null
	}

	// Strip query string and hash from specifier (e.g., './module.js?v=1#hash' -> './module.js')
	const cleanSpecifier = specifier.split('?')[0].split('#')[0]

	// Resolve the path relative to importer directory
	const resolved = path.posix.normalize(path.posix.join(importerDir, cleanSpecifier))

	// Try with various extensions and index files
	const extensions = ['', '.js', '.mjs', '.json', '/index.js', '/index.mjs']

	for (const ext of extensions) {
		const candidate = resolved + ext
		const fullPath = path.join(buildRoot, candidate)

		if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
			// Normalize the path for consistent storage
			return candidate.startsWith('/') ? candidate.slice(1) : candidate
		}
	}

	return null
}

/**
 * Parse a module and add its dependencies to the graph.
 * Uses mtime caching to skip unchanged files.
 *
 * @param modulePath - Build-relative module path
 * @param graph - The dependency graph to update
 * @returns true if the module was parsed, false if skipped (cached or missing)
 */
export function parseModule(modulePath: string, graph: DependencyGraph): boolean {
	const fullPath = path.join(graph.buildRoot, modulePath)

	// Check if file exists
	if (!fs.existsSync(fullPath)) {
		// File was deleted - remove from graph
		removeModule(modulePath, graph)
		return false
	}

	// Check mtime for caching
	const stat = fs.statSync(fullPath)
	const cachedMtime = graph.mtimes.get(modulePath)

	if (cachedMtime !== undefined && cachedMtime >= stat.mtimeMs) {
		// File hasn't changed since last parse
		return false
	}

	// Read and parse the file
	const content = fs.readFileSync(fullPath, 'utf-8')
	const { imports, hasUnresolvedDynamic } = parseImports(content)

	// Clear old dependencies first
	const oldDeps = graph.deps.get(modulePath)
	if (oldDeps) {
		for (const dep of oldDeps) {
			graph.revDeps.get(dep)?.delete(modulePath)
		}
	}

	// Add new dependencies
	const deps = new Set<string>()
	const importerDir = path.posix.dirname(modulePath)

	for (const imp of imports) {
		if (!imp.isRelative) {
			continue
		}

		const resolved = resolveSpecifier(imp.specifier, importerDir, graph.buildRoot)
		if (resolved) {
			deps.add(resolved)

			// Add reverse dependency
			if (!graph.revDeps.has(resolved)) {
				graph.revDeps.set(resolved, new Set())
			}
			graph.revDeps.get(resolved)!.add(modulePath)
		}
	}

	// Update graph
	graph.deps.set(modulePath, deps)
	graph.mtimes.set(modulePath, stat.mtimeMs)

	if (hasUnresolvedDynamic) {
		graph.hasUnresolvedDynamic.add(modulePath)
	} else {
		graph.hasUnresolvedDynamic.delete(modulePath)
	}

	return true
}

/**
 * Remove a module from the graph.
 * Called when a file is deleted.
 */
export function removeModule(modulePath: string, graph: DependencyGraph): void {
	// Remove from forward deps
	const oldDeps = graph.deps.get(modulePath)
	if (oldDeps) {
		for (const dep of oldDeps) {
			graph.revDeps.get(dep)?.delete(modulePath)
		}
	}
	graph.deps.delete(modulePath)

	// Remove from other maps
	graph.mtimes.delete(modulePath)
	graph.hasUnresolvedDynamic.delete(modulePath)

	// Prune stale entries from revDeps[modulePath].
	// Keep reverse edges so we can still determine which handlers were impacted
	// when a dependency is deleted, but remove importers that no longer exist
	// in the graph (their forward deps have been removed).
	const importers = graph.revDeps.get(modulePath)
	if (importers) {
		for (const importer of importers) {
			if (!graph.deps.has(importer)) {
				importers.delete(importer)
			}
		}
		if (importers.size === 0) {
			graph.revDeps.delete(modulePath)
		}
	}
}

/**
 * Recursively scan and parse all modules reachable from a starting module.
 * Follows import chains to build the complete dependency graph.
 *
 * @param modulePath - Starting module path
 * @param graph - The dependency graph to populate
 * @param visited - Set of already visited modules (for cycle detection)
 */
function parseModuleDeps(modulePath: string, graph: DependencyGraph, visited: Set<string>): void {
	if (visited.has(modulePath)) {
		return // Already visited (handles circular deps)
	}
	visited.add(modulePath)

	// Parse this module if not already in graph or if changed
	parseModule(modulePath, graph)

	// Recursively parse dependencies
	const deps = graph.deps.get(modulePath)
	if (deps) {
		for (const dep of deps) {
			parseModuleDeps(dep, graph, visited)
		}
	}
}

/**
 * Recursively scan a directory for JS/MJS files.
 */
function scanDirectory(fullDir: string, relativeDir: string, graph: DependencyGraph): string[] {
	const modules: string[] = []

	if (!fs.existsSync(fullDir)) {
		return modules
	}

	const entries = fs.readdirSync(fullDir, { withFileTypes: true })

	for (const entry of entries) {
		const fullPath = path.join(fullDir, entry.name)
		const relativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name

		if (entry.isDirectory()) {
			modules.push(...scanDirectory(fullPath, relativePath, graph))
		} else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
			modules.push(relativePath)
		}
	}

	return modules
}

/**
 * Build the initial dependency graph from handler roots.
 * Only parses modules reachable from handler directories for efficiency.
 *
 * @param mode - Build mode (development, production, etc.)
 * @param routeDefinitions - Route definitions from manifest
 * @returns The populated dependency graph
 */
export function buildInitialGraph(mode: string, routeDefinitions: RouteDefinitions): DependencyGraph {
	const buildRoot = path.join(process.cwd(), '.robo', 'build', mode)

	const graph = createGraph(buildRoot)

	// Build may not exist yet
	if (!fs.existsSync(buildRoot)) {
		return graph
	}

	// Find all handler directories from route definitions
	const handlerDirs = new Set<string>()
	for (const nsDef of Object.values(routeDefinitions)) {
		for (const routeDef of Object.values(nsDef.routes)) {
			handlerDirs.add(routeDef.directory)
		}
	}

	// Scan handler directories and build graph starting from each handler
	for (const dir of handlerDirs) {
		const fullDir = path.join(buildRoot, dir)
		const handlerModules = scanDirectory(fullDir, dir, graph)

		// Parse each handler and its dependencies
		for (const modulePath of handlerModules) {
			parseModuleDeps(modulePath, graph, new Set())
		}
	}

	return graph
}

/**
 * Update the graph for changed files.
 * Re-parses the specified files and updates dependencies.
 *
 * @param graph - The dependency graph to update
 * @param changedFiles - Array of build-relative paths that changed
 */
export function updateGraphForFiles(graph: DependencyGraph, changedFiles: string[]): void {
	for (const file of changedFiles) {
		// Rebuild the reachable subtree from this module.
		// This ensures newly introduced dependencies are fully tracked.
		parseModuleDeps(file, graph, new Set())
	}
}

/**
 * Get all handler modules that transitively depend on the changed files.
 * Uses BFS to traverse reverse dependencies until reaching handler roots.
 *
 * @param graph - The dependency graph
 * @param changedFiles - Array of build-relative paths that changed
 * @param routeDefinitions - Route definitions to identify handlers
 * @returns Array of handler paths that need to be reloaded
 */
export function getImpactedHandlers(
	graph: DependencyGraph,
	changedFiles: string[],
	routeDefinitions: RouteDefinitions
): ImpactResult {
	// Build set of handler directories for quick lookup
	const handlerDirs = new Set<string>()
	for (const nsDef of Object.values(routeDefinitions)) {
		for (const routeDef of Object.values(nsDef.routes)) {
			handlerDirs.add(routeDef.directory)
		}
	}

	const impacted = new Set<string>()
	const visited = new Set<string>()

	// BFS from each changed file up through reverse dependencies
	const queue = [...changedFiles]

	while (queue.length > 0 && visited.size < MAX_TRAVERSAL_NODES) {
		const current = queue.shift()!

		if (visited.has(current)) {
			continue
		}
		visited.add(current)

		// Check if this is a handler (file in a handler directory)
		for (const dir of handlerDirs) {
			if (current.startsWith(dir + '/') || current.startsWith(dir + '\\')) {
				impacted.add(current)
				// Don't continue traversing past handler - we found a root
				break
			}
		}

		// Add reverse dependencies to queue (modules that import this one)
		const revDeps = graph.revDeps.get(current)
		if (revDeps) {
			for (const dep of revDeps) {
				if (!visited.has(dep)) {
					queue.push(dep)
				}
			}
		}
	}

	// Check if we hit the traversal limit
	const exceededLimit = visited.size >= MAX_TRAVERSAL_NODES
	return {
		impacted: exceededLimit ? [] : Array.from(impacted),
		exceededLimit,
		visitedCount: visited.size,
		visited: exceededLimit ? [] : Array.from(visited)
	}
}

/**
 * Check if the graph has any modules with unresolved dynamic imports
 * that could be affected by the given changed files.
 *
 * @param graph - The dependency graph
 * @param changedFiles - Array of build-relative paths that changed
 * @returns true if there are potentially affected unresolved dynamic imports
 */
export function hasAffectedDynamicImports(graph: DependencyGraph, changedFiles: string[]): boolean {
	// If any changed file is in a module with unresolved dynamic imports,
	// we can't be sure what depends on it
	for (const file of changedFiles) {
		if (graph.hasUnresolvedDynamic.has(file)) {
			return true
		}

		// Check reverse deps too
		const revDeps = graph.revDeps.get(file)
		if (revDeps) {
			for (const dep of revDeps) {
				if (graph.hasUnresolvedDynamic.has(dep)) {
					return true
				}
			}
		}
	}

	return false
}

export interface GraphStats {
	moduleCount: number
	edgeCount: number
	unresolvedDynamicCount: number
	/** Average number of imports per module */
	avgDepsPerModule: number
	/** Maximum depth of dependency chain from any handler */
	maxChainDepth: number
}

export interface TraversalMetrics {
	visitedCount: number
	impactedCount: number
	/** Percentage of MAX_TRAVERSAL_NODES used (0-1) */
	traversalUtilization: number
	exceededLimit: boolean
}

/**
 * Get graph statistics for debugging/logging.
 */
export function getGraphStats(graph: DependencyGraph): GraphStats {
	let edgeCount = 0
	for (const deps of graph.deps.values()) {
		edgeCount += deps.size
	}

	const moduleCount = graph.deps.size
	const avgDepsPerModule = moduleCount > 0 ? edgeCount / moduleCount : 0

	// Calculate max chain depth via BFS from all leaf nodes (modules with no deps)
	let maxChainDepth = 0
	const depths = new Map<string, number>()

	// Find leaf nodes (modules that don't import anything)
	const leaves: string[] = []
	for (const [mod, deps] of graph.deps) {
		if (deps.size === 0) {
			leaves.push(mod)
			depths.set(mod, 0)
		}
	}

	// BFS to calculate depths
	const queue = [...leaves]
	while (queue.length > 0) {
		const current = queue.shift()!
		const currentDepth = depths.get(current) ?? 0

		const importers = graph.revDeps.get(current)
		if (importers) {
			for (const importer of importers) {
				const existingDepth = depths.get(importer)
				const newDepth = currentDepth + 1

				if (existingDepth === undefined || newDepth > existingDepth) {
					depths.set(importer, newDepth)
					maxChainDepth = Math.max(maxChainDepth, newDepth)
					queue.push(importer)
				}
			}
		}
	}

	return {
		moduleCount,
		edgeCount,
		unresolvedDynamicCount: graph.hasUnresolvedDynamic.size,
		avgDepsPerModule: Math.round(avgDepsPerModule * 100) / 100,
		maxChainDepth
	}
}

/**
 * Get metrics from a traversal result for debugging/logging.
 */
export function getTraversalMetrics(result: ImpactResult): TraversalMetrics {
	return {
		visitedCount: result.visitedCount,
		impactedCount: result.impacted.length,
		traversalUtilization: result.visitedCount / MAX_TRAVERSAL_NODES,
		exceededLimit: result.exceededLimit
	}
}
