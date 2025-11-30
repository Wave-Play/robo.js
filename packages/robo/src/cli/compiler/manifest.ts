import fs from 'node:fs/promises'
import path from 'node:path'
import { BaseConfig, Manifest } from '../../types/index.js'
import { compilerLogger } from '../utils/loggers.js'
import { hasProperties } from '../utils/utils.js'
import { BASE_MANIFEST } from '../utils/manifest.js'
import { Mode } from '../../core/mode.js'
import type { ProjectMetadata, RouteDefinitions, HandlerEntry } from '../../types/manifest-v1.js'

const ManifestCache: Record<string, Manifest> = {}

/**
 * Check if granular manifest exists for the current mode.
 */
async function hasGranularManifest(basePath: string = ''): Promise<boolean> {
	const mode = Mode.get()
	const manifestDir = path.join(basePath || '.', '.robo', 'manifest', mode)

	try {
		await fs.access(path.join(manifestDir, 'robo.json'))
		return true
	} catch {
		return false
	}
}

/**
 * Load manifest from granular files and reconstruct legacy format.
 * This provides backward compatibility while supporting the new granular system.
 */
async function loadGranularManifest(basePath: string = ''): Promise<Manifest | null> {
	const mode = Mode.get()
	const manifestDir = path.join(basePath || '.', '.robo', 'manifest', mode)

	try {
		// Load core files
		const [roboContent, routeDefsContent] = await Promise.all([
			fs.readFile(path.join(manifestDir, 'robo.json'), 'utf-8'),
			fs.readFile(path.join(manifestDir, 'routes', '@.json'), 'utf-8').catch(() => '{}')
		])

		const robo: ProjectMetadata = JSON.parse(roboContent)
		// Route definitions are available for future use
		const _routeDefs: RouteDefinitions = JSON.parse(routeDefsContent)
		void _routeDefs // Silence unused warning - available for future use

		// Start with base manifest
		const manifest: Manifest = {
			...BASE_MANIFEST,
			__README: 'This file was reconstructed from granular manifest files.',
			__robo: {
				config: null, // Config is loaded separately
				language: robo.language,
				mode: robo.mode,
				type: 'robo',
				updatedAt: robo.buildTime,
				version: robo.roboVersion
			}
		}

		// Load route entries and reconstruct legacy format
		const routesDir = path.join(manifestDir, 'routes')

		try {
			const routeFiles = await fs.readdir(routesDir)

			for (const file of routeFiles) {
				if (file === '@.json' || !file.endsWith('.json')) {
					continue
				}

				const content = await fs.readFile(path.join(routesDir, file), 'utf-8')
				const entries: HandlerEntry[] = JSON.parse(content)

				// Parse namespace and route from filename (e.g., "discord.commands.json")
				const [namespace, route] = file.replace('.json', '').split('.')

				// Store in __routes for new system
				if (!manifest.__routes) {
					manifest.__routes = {}
				}
				if (!manifest.__routes[namespace]) {
					manifest.__routes[namespace] = {}
				}
				manifest.__routes[namespace][route] = entries
			}
		} catch {
			// Routes directory might not exist
		}

		compilerLogger.debug(`Loaded granular manifest from ${manifestDir}`)
		return manifest
	} catch (error) {
		compilerLogger.debug(`Failed to load granular manifest:`, error)
		return null
	}
}

interface GetManifestOptions {
	name?: string
}

interface UseManifestOptions {
	basePath?: string
	cache?: boolean
	name?: string
	safe?: boolean
}

/**
 * Retrieve a manifest that has already been loaded via `useManifest`.
 * If the manifest has not been loaded, `null` is returned.
 */
export function getManifest(options?: GetManifestOptions): Manifest | null {
	return ManifestCache[options?.name ?? ''] ?? null
}

/**
 * Load the manifest file for the current project.
 * If the manifest file does not exist, a base manifest is returned.
 *
 * Results are cached in memory unless the `cache` option is set to `false`.
 * When `safe` is set to `true`, errors are suppressed and the base manifest is returned.
 *
 * For projects with granular manifests, will attempt to load from the granular
 * directory structure first, falling back to legacy manifest.json.
 */
export async function useManifest(options?: UseManifestOptions): Promise<Manifest> {
	const { cache = true, name = '', basePath = '', safe } = options ?? {}

	// Check if manifest is already cached
	let manifest = ManifestCache[name]

	if (manifest && cache) {
		compilerLogger.debug(`Using cached manifest`, name ? `for plugin ${name}` : '')
		return manifest
	}

	// Try loading from granular manifest first (only for project, not plugins)
	if (!name && !basePath) {
		const granularExists = await hasGranularManifest(basePath)
		if (granularExists) {
			const granularManifest = await loadGranularManifest(basePath)
			if (granularManifest) {
				ManifestCache[name] = granularManifest
				return granularManifest
			}
		}
	}

	// Fall back to legacy manifest.json
	const manifestPath = path.join(basePath || '.', '.robo', 'manifest.json')
	compilerLogger.debug(`Loading manifest`, name ? `for plugin ${name}` : '', `from ${manifestPath}...`)

	try {
		const manifestContent = await fs.readFile(manifestPath, 'utf-8')
		if (!manifestContent?.trim()) {
			manifest = BASE_MANIFEST
			return manifest
		}
		manifest = JSON.parse(manifestContent, jsonReviver) as Manifest

		// Inject plugin info if this is being built as a plugin
		if (name && basePath) {
			compilerLogger.debug(`Injecting plugin info into manifest...`)
			const pluginInfo: BaseConfig = {
				__auto: true,
				__plugin: {
					name,
					path: basePath
				}
			}

			Object.keys(manifest.api ?? {}).forEach((key) => {
				manifest.api[key].__auto = true
				manifest.api[key].__path = manifest.api[key].__path?.replaceAll('\\', path.sep)
				manifest.api[key].__plugin = {
					name,
					path: basePath
				}
			})
			Object.keys(manifest.commands).forEach((key) => {
				manifest.commands[key].__auto = true
				manifest.commands[key].__path = manifest.commands[key].__path?.replaceAll('\\', path.sep)
				manifest.commands[key].__plugin = {
					name,
					path: basePath
				}
			})
			Object.keys(manifest.context?.message ?? {}).forEach((key) => {
				manifest.context.message[key].__auto = true
				manifest.context.message[key].__path = manifest.context.message[key].__path?.replaceAll('\\', path.sep)
				manifest.context.message[key].__plugin = {
					name,
					path: basePath
				}
			})
			Object.keys(manifest.context?.user ?? {}).forEach((key) => {
				manifest.context.user[key].__auto = true
				manifest.context.user[key].__path = manifest.context.user[key].__path?.replaceAll('\\', path.sep)
				manifest.context.user[key].__plugin = {
					name,
					path: basePath
				}
			})
			Object.keys(manifest.events).forEach((key) => {
				manifest.events[key] = manifest.events[key].map((eventConfig) => ({
					...pluginInfo,
					...eventConfig,
					__path: eventConfig.__path?.replaceAll('\\', path.sep)
				}))
			})
			manifest.middleware = manifest.middleware?.map((middleware) => ({
				...pluginInfo,
				...middleware,
				__path: middleware.__path?.replaceAll('\\', path.sep)
			}))

			if (manifest.__robo?.seed?.hook) {
				manifest.__robo.seed.hook = manifest.__robo.seed.hook.replaceAll('\\', path.sep)
			}

		}

		return manifest
	} catch (e) {
		if (safe || hasProperties<{ code: unknown }>(e, ['code']) && e.code === 'ENOENT') {
			compilerLogger.debug(`No manifest found${name ? ` for ${name}` : ''}, using base manifest...`)
			manifest = BASE_MANIFEST
			return manifest
		}
		throw e
	} finally {
		ManifestCache[name] = manifest
	}
}

// TODO: Move into Discord plugin
function jsonReviver(key: string, value: unknown) {
	if (key === 'defaultMemberPermissions' && typeof value === 'string' && value.slice(-1) === 'n') {
		return BigInt(value.slice(0, -1))
	} else {
		return value
	}
}
