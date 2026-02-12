import type { RoboRequest } from '@robojs/server'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Route information for autocomplete
 */
interface RouteInfo {
	/** The route path with parameter placeholders (e.g., /api/v10/channels/:id) */
	path: string
	/** Supported HTTP methods (default assumption) */
	methods: string[]
	/** Original file path relative to api/ */
	key: string
	/** Category (v10, control, cdn, etc.) */
	category: string
}

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const apiRoot = join(__dirname, '..')

// Cache the routes list
let cachedRoutes: RouteInfo[] | null = null

/**
 * Recursively scan a directory for .ts/.js files
 */
function scanDirectory(dir: string, basePath: string = ''): string[] {
	const results: string[] = []

	if (!existsSync(dir)) {
		return results
	}

	const entries = readdirSync(dir)

	for (const entry of entries) {
		const fullPath = join(dir, entry)
		const relativePath = basePath ? `${basePath}/${entry}` : entry

		try {
			const stat = statSync(fullPath)

			if (stat.isDirectory()) {
				results.push(...scanDirectory(fullPath, relativePath))
			} else if (entry.endsWith('.ts') || entry.endsWith('.js')) {
				// Remove extension and add to results
				const routePath = relativePath.replace(/\.(ts|js)$/, '')
				results.push(routePath)
			}
		} catch {
			// Skip files we can't read
		}
	}

	return results
}

/**
 * Convert a file path to an API route path
 * e.g., "v10/channels/[id]/messages" -> "/api/v10/channels/:id/messages"
 */
function filePathToRoutePath(filePath: string): string {
	return '/api/' + filePath.replace(/\[(.+?)\]/g, ':$1')
}

/**
 * Determine the category from the file path
 */
function getCategory(filePath: string): string {
	if (filePath.startsWith('v10/')) return 'discord'
	if (filePath.startsWith('control/')) return 'control'
	if (filePath.startsWith('cdn/')) return 'cdn'
	if (filePath.startsWith('stage/')) return 'stage'
	return 'other'
}

/**
 * Get all routes by scanning the API directory
 */
function getAllRoutes(): RouteInfo[] {
	if (cachedRoutes) {
		return cachedRoutes
	}

	const filePaths = scanDirectory(apiRoot)

	cachedRoutes = filePaths
		.filter(fp => !fp.includes('/utils') && fp !== 'stage/routes') // Exclude utility files and this file
		.map(filePath => ({
			path: filePathToRoutePath(filePath),
			methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
			key: filePath,
			category: getCategory(filePath)
		}))
		.sort((a, b) => a.path.localeCompare(b.path))

	return cachedRoutes
}

/**
 * GET /api/stage/routes - Returns list of all available API routes
 *
 * Used by the Stage UI for REST client autocomplete.
 */
export default async (request: RoboRequest) => {
	if (request.method !== 'GET') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	try {
		const routes = getAllRoutes()

		return {
			routes,
			count: routes.length,
			categories: {
				discord: routes.filter((r) => r.category === 'discord').length,
				control: routes.filter((r) => r.category === 'control').length,
				cdn: routes.filter((r) => r.category === 'cdn').length,
				stage: routes.filter((r) => r.category === 'stage').length,
				other: routes.filter((r) => r.category === 'other').length
			}
		}
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: 'Failed to fetch routes',
				message: error instanceof Error ? error.message : String(error)
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}
}
