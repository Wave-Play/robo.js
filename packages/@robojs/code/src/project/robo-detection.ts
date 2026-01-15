/**
 * Robo.js project detection and analysis
 *
 * Detects Robo.js projects and extracts signals for indexing
 * and overview building.
 */

import type { ExecutionProvider } from '../types/execution.js'
import type { RoboIndexSignals, RoboOverview } from '../types/scale.js'
import type { RoboProjectKind } from '../types/robo.js'
import { OVERVIEW_CAPS } from './caps.js'
import { codeLogger } from '../core/logger.js'

/**
 * Known Robo.js package names for detection
 */
const ROBO_PACKAGES = ['robo.js', '@robojs/discordjs', '@robojs/server', '@robojs/mock'] as const

/**
 * Known Robo.js directories
 */
const ROBO_DIRS = {
	commands: '/src/commands',
	events: '/src/events',
	api: '/src/api',
	plugins: '/config/plugins',
	flashcore: '/src/robo/flashcore'
} as const

/**
 * Activity-related packages that indicate an activity project
 */
const ACTIVITY_PACKAGES = ['@discord/embedded-app-sdk', '@robojs/patch'] as const

/**
 * Parse package.json and extract relevant info
 */
export interface ParsedPackageJson {
	name?: string
	version?: string
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
}

/**
 * Parse package.json content
 */
export function parsePackageJson(content: string): ParsedPackageJson | null {
	try {
		const pkg = JSON.parse(content)
		return {
			name: pkg.name,
			version: pkg.version,
			scripts: pkg.scripts,
			dependencies: pkg.dependencies,
			devDependencies: pkg.devDependencies
		}
	} catch (e) {
		codeLogger.warn('Failed to parse package.json:', e)
		return null
	}
}

/**
 * Check if a directory exists using the provider
 */
async function directoryExists(provider: ExecutionProvider, path: string): Promise<boolean> {
	try {
		const exists = await provider.exists(path)
		if (!exists) return false
		const stat = await provider.stat(path)
		return stat.isDirectory === true
	} catch {
		return false
	}
}

/**
 * Get all installed Robo.js related packages from dependencies
 */
export function getRoboPackages(pkg: ParsedPackageJson): string[] {
	const allDeps = {
		...pkg.dependencies,
		...pkg.devDependencies
	}

	const roboPackages: string[] = []

	// Find robo.js core
	if ('robo.js' in allDeps) {
		roboPackages.push('robo.js')
	}

	// Find @robojs/* packages
	for (const dep of Object.keys(allDeps)) {
		if (dep.startsWith('@robojs/')) {
			roboPackages.push(dep)
		}
	}

	return roboPackages
}

/**
 * Determine the Robo project kind based on deps and directories
 */
export function determineProjectKind(
	roboPackages: string[],
	hasApiDir: boolean,
	pkg: ParsedPackageJson
): RoboProjectKind {
	const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

	// Check for activity markers
	const hasActivityPackage = ACTIVITY_PACKAGES.some((p) => p in allDeps)
	if (hasActivityPackage) {
		return 'activity'
	}

	// Check for Discord.js integration
	const hasDiscordJs = roboPackages.includes('@robojs/discordjs') || 'discord.js' in allDeps

	if (hasDiscordJs) {
		// Bot with API routes
		if (hasApiDir || roboPackages.includes('@robojs/server')) {
			return 'bot+api'
		}
		return 'bot'
	}

	// Has robo.js but no discord.js - could be API-only or unknown
	if (roboPackages.includes('robo.js') || roboPackages.includes('@robojs/server')) {
		if (hasApiDir) {
			return 'bot+api' // API server
		}
	}

	return 'unknown'
}

/**
 * Detect if a project is a Robo.js project and extract signals
 *
 * @param provider - ExecutionProvider for file access
 * @param packageJson - Optional pre-parsed package.json
 * @returns RoboIndexSignals if Robo project detected, null otherwise
 */
export async function detectRoboProject(
	provider: ExecutionProvider,
	packageJson?: ParsedPackageJson
): Promise<RoboIndexSignals | null> {
	// Get package.json if not provided
	let pkg: ParsedPackageJson | null | undefined = packageJson
	if (!pkg) {
		try {
			const content = await provider.readFile('/package.json')
			pkg = parsePackageJson(content)
		} catch {
			// No package.json
			return null
		}
	}

	if (!pkg) {
		return null
	}

	// Get Robo packages
	const roboPackages = getRoboPackages(pkg)

	// Check for Robo directories
	const [hasCommandsDir, hasEventsDir, hasApiDir, hasPluginsDir, hasFlashcoreDir] = await Promise.all([
		directoryExists(provider, ROBO_DIRS.commands),
		directoryExists(provider, ROBO_DIRS.events),
		directoryExists(provider, ROBO_DIRS.api),
		directoryExists(provider, ROBO_DIRS.plugins),
		directoryExists(provider, ROBO_DIRS.flashcore)
	])

	// Not a Robo project if no Robo packages and no Robo directories
	const hasRoboPackages = roboPackages.length > 0
	const hasRoboDirs = hasCommandsDir || hasEventsDir || hasApiDir || hasPluginsDir || hasFlashcoreDir

	if (!hasRoboPackages && !hasRoboDirs) {
		return null
	}

	// Determine project kind
	const kind = determineProjectKind(roboPackages, hasApiDir, pkg)

	// Check for mock availability
	const hasMock = roboPackages.includes('@robojs/mock')

	// Build signals
	const signals: RoboIndexSignals = {
		kind,
		plugins: roboPackages.filter((p) => p !== 'robo.js'),
		hasMock
	}

	// Add directory paths if they exist
	if (hasCommandsDir) signals.commandsDir = ROBO_DIRS.commands
	if (hasEventsDir) signals.eventsDir = ROBO_DIRS.events
	if (hasApiDir) signals.apiDir = ROBO_DIRS.api
	if (hasFlashcoreDir) signals.flashcoreDir = ROBO_DIRS.flashcore

	return signals
}

/**
 * Scan a directory for file names (non-recursive)
 */
async function scanDirectory(provider: ExecutionProvider, dirPath: string, maxItems: number): Promise<string[]> {
	try {
		const entries = await provider.readdir(dirPath, { recursive: false })
		const names: string[] = []

		for (const entry of entries) {
			if (names.length >= maxItems) break

			// Get relative name
			const name = entry.name.replace(/\.(ts|js|tsx|jsx)$/, '')
			if (name && !name.startsWith('_') && !name.startsWith('.')) {
				names.push(name)
			}
		}

		return names
	} catch {
		return []
	}
}

/**
 * Scan for commands (supports nested directories for subcommands)
 */
async function scanCommands(provider: ExecutionProvider, dirPath: string, maxItems: number): Promise<string[]> {
	try {
		const entries = await provider.readdir(dirPath, { recursive: true })
		const commands: string[] = []

		for (const entry of entries) {
			if (commands.length >= maxItems) break
			if (entry.isDirectory) continue

			// Get relative path from commands dir
			let relativePath = entry.path
			if (relativePath.startsWith(dirPath)) {
				relativePath = relativePath.slice(dirPath.length)
			}
			if (relativePath.startsWith('/')) {
				relativePath = relativePath.slice(1)
			}

			// Convert path to command name (e.g., "user/profile.ts" -> "/user profile")
			const name = relativePath
				.replace(/\.(ts|js|tsx|jsx)$/, '')
				.split('/')
				.filter((p) => p && !p.startsWith('_') && !p.startsWith('.'))
				.join(' ')

			if (name) {
				commands.push('/' + name)
			}
		}

		return commands
	} catch {
		return []
	}
}

/**
 * Scan for API routes (supports nested directories)
 */
async function scanApiRoutes(provider: ExecutionProvider, dirPath: string, maxItems: number): Promise<string[]> {
	try {
		const entries = await provider.readdir(dirPath, { recursive: true })
		const routes: string[] = []

		for (const entry of entries) {
			if (routes.length >= maxItems) break
			if (entry.isDirectory) continue

			// Get relative path from api dir
			let relativePath = entry.path
			if (relativePath.startsWith(dirPath)) {
				relativePath = relativePath.slice(dirPath.length)
			}

			// Convert to route path
			const route = relativePath
				.replace(/\.(ts|js|tsx|jsx)$/, '')
				.replace(/\/index$/, '') // index files are route root
				.replace(/\[([^\]]+)\]/g, ':$1') // [id] -> :id

			if (route) {
				routes.push(route || '/')
			}
		}

		return routes
	} catch {
		return []
	}
}

/**
 * Build detailed Robo overview with commands, events, routes
 *
 * @param provider - ExecutionProvider for file access
 * @param signals - RoboIndexSignals from detection
 * @returns Detailed RoboOverview
 */
export async function buildRoboOverview(provider: ExecutionProvider, signals: RoboIndexSignals): Promise<RoboOverview> {
	const overview: RoboOverview = {
		kind: signals.kind,
		plugins: signals.plugins
	}

	// Scan commands
	if (signals.commandsDir) {
		overview.commands = await scanCommands(provider, signals.commandsDir, OVERVIEW_CAPS.maxCommands)
	}

	// Scan events
	if (signals.eventsDir) {
		overview.events = await scanDirectory(provider, signals.eventsDir, OVERVIEW_CAPS.maxEvents)
	}

	// Scan API routes
	if (signals.apiDir) {
		overview.apiRoutes = await scanApiRoutes(provider, signals.apiDir, OVERVIEW_CAPS.maxApiRoutes)
	}

	// Scan Flashcore schemas
	if (signals.flashcoreDir) {
		overview.flashcoreSchemas = await scanDirectory(provider, signals.flashcoreDir, OVERVIEW_CAPS.maxFlashcoreSchemas)
	}

	// Mock support
	overview.mock = {
		supported: signals.hasMock
	}

	return overview
}

/**
 * Get robo.js version from package.json
 */
export function getRoboVersion(pkg: ParsedPackageJson): string | undefined {
	return pkg.dependencies?.['robo.js'] || pkg.devDependencies?.['robo.js']
}

/**
 * Check if project has a robo.config file
 */
export async function hasRoboConfig(provider: ExecutionProvider): Promise<boolean> {
	const configFiles = ['/robo.config.js', '/robo.config.ts', '/robo.config.mjs']

	for (const configFile of configFiles) {
		if (await provider.exists(configFile)) {
			return true
		}
	}

	return false
}
