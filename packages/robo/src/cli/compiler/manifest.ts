import fs from 'node:fs/promises'
import path from 'node:path'
import { BaseConfig, Manifest } from '../../types/index.js'
import { compilerLogger } from '../utils/loggers.js'
import { hasProperties } from '../utils/utils.js'
import { BASE_MANIFEST } from '../utils/manifest.js'

const ManifestCache: Record<string, Manifest> = {}

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
 */
export async function useManifest(options?: UseManifestOptions): Promise<Manifest> {
	const { cache = true, name = '', basePath = '', safe } = options ?? {}

	// Check if manifest is already cached
	let manifest = ManifestCache[name]

	if (manifest && cache) {
		compilerLogger.debug(`Using cached manifest`, name ? `for plugin ${name}` : '')
		return manifest
	}

	// Load manifest from file
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
