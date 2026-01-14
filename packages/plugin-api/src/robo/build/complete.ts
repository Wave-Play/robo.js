/**
 * Build Complete Hook - Vite Production Build & Plugin Assets
 *
 * This hook runs during `robo build` (production builds only) to:
 * 1. Bundle frontend assets using Vite
 * 2. Output to .robo/public/ for production serving
 * 3. Copy plugin static assets to .robo/public/{namespace}/
 *
 * In development mode, the Vite dev server handles this instead (see start.ts).
 */
import { logger } from '../../core/logger.js'
import { hasDependency } from '../../core/runtime-utils.js'
import { existsSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getPluginOptions, Manifest } from 'robo.js'
import type { BuildCompleteContext } from 'robo.js'
import type { ConfigEnv, UserConfig } from 'vite'
import type { PluginConfig } from '../prepare.js'
import type { PluginPrefixConfig, PluginPrefixMap } from '../../core/plugin-routes.js'
import { generateOpenAPISpec } from '../../core/openapi-generator.js'
import type { OpenAPIConfig } from '../../core/openapi-generator.js'

/**
 * Build complete hook - Bundles frontend assets with Vite and copies plugin assets
 */
export default async function (context: BuildCompleteContext): Promise<void> {
	const { mode } = context

	// Skip in development mode - dev server handles this
	if (mode === 'development') {
		logger.debug('Skipping Vite build in development mode')
		return
	}

	// Build Vite assets if available
	if (await hasDependency('vite', true)) {
		try {
			await buildVite()
		} catch (error) {
			logger.error('Failed to build Vite:', error)
		}
	} else {
		logger.debug('Vite not installed. Skipping Vite build...')
	}

	// Copy plugin static assets
	try {
		await copyPluginAssets()
	} catch (error) {
		logger.error('Failed to copy plugin assets:', error)
	}

	// Generate OpenAPI spec
	const pluginConfig = getPluginOptions('@robojs/server') as PluginConfig | null
	const openapiConfig = pluginConfig?.openapi as OpenAPIConfig | boolean | undefined

	// Check if OpenAPI generation is disabled
	// Supports: openapi: false OR openapi: { enabled: false }
	const isDisabled = openapiConfig === false || (typeof openapiConfig === 'object' && openapiConfig.enabled === false)

	if (!isDisabled) {
		const apiEntries = context.entries.handlers('server', 'api')
		if (apiEntries.length > 0) {
			const buildDir = path.join(context.paths.output, 'build')
			const options = typeof openapiConfig === 'object' ? openapiConfig : {}

			await generateOpenAPISpec(apiEntries, buildDir, {
				title: options.title ?? 'API',
				version: options.version ?? '1.0.0',
				description: options.description,
				servers: options.servers,
				contact: options.contact,
				license: options.license,
				securitySchemes: options.securitySchemes,
				tags: options.tags,
				outputPath: path.join(context.paths.output, 'openapi.json')
			})
		}
	} else {
		logger.debug('OpenAPI generation disabled via config')
	}
}

/**
 * Build frontend assets with Vite.
 * Loads config from config/vite.ts, config/vite.mjs, or vite.config.ts/js.
 */
async function buildVite(): Promise<void> {
	const time = Date.now()
	logger.debug('Building Vite...')
	const { build, loadConfigFromFile } = await import('vite')

	// Load Vite config
	let config: UserConfig | undefined
	const configEnv: ConfigEnv = {
		command: 'build',
		isPreview: false,
		isSsrBuild: false,
		mode: 'production'
	}

	// Check config paths in order of preference
	const configPaths = [
		path.join(process.cwd(), 'config', 'vite.ts'),
		path.join(process.cwd(), 'config', 'vite.mjs'),
		path.join(process.cwd(), 'vite.config.ts'),
		path.join(process.cwd(), 'vite.config.js')
	]

	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			config = (await loadConfigFromFile(configEnv, configPath))?.config
			break
		}
	}

	if (!config) {
		logger.debug('No Vite config found. Skipping...')
		return
	}
	logger.debug('Vite config loaded:', config)

	// Build with Vite
	await build({
		logLevel: 'warn',
		...(config ?? {}),
		build: {
			...(config?.build ?? {}),
			emptyOutDir: true,
			outDir: path.join('.robo', 'public')
		}
	})
	logger.debug('Vite build completed in', Date.now() - time, 'ms')
}

/**
 * Copy plugin static assets to production public directory.
 * For each plugin with a static prefix (declared in manifest or user config),
 * copies public/ from node_modules to .robo/public/{namespace}/.
 *
 * Uses the same resolution order as prepare.ts:
 * 1. User's explicit `pluginPrefixes` in server config
 * 2. Plugin's declared `pluginPrefix` from manifest
 */
async function copyPluginAssets(): Promise<void> {
	// Get merged plugin prefixes (same logic as prepare.ts)
	const pluginPrefixes = getMergedPluginPrefixes()

	if (Object.keys(pluginPrefixes).length === 0) {
		logger.debug('No plugin prefixes found. Skipping plugin asset copy...')
		return
	}

	logger.debug('Copying plugin static assets...')
	const time = Date.now()
	let copiedCount = 0

	for (const [pluginName, prefixConfig] of Object.entries(pluginPrefixes)) {
		// Check if this plugin has static assets enabled
		const hasStatic = hasStaticPrefix(prefixConfig)
		if (!hasStatic) {
			logger.debug(`Plugin ${pluginName} has no static prefix. Skipping...`)
			continue
		}

		// Check if plugin has a public/ directory
		const sourcePath = path.join(process.cwd(), 'node_modules', pluginName, 'public')
		if (!existsSync(sourcePath)) {
			logger.debug(`Plugin ${pluginName} has no public/ directory. Skipping...`)
			continue
		}

		// Determine destination path
		const namespace = getPluginNamespace(pluginName)
		const destPath = path.join(process.cwd(), '.robo', 'public', namespace)

		// Copy plugin assets
		try {
			await mkdir(destPath, { recursive: true })
			await cp(sourcePath, destPath, { recursive: true })
			logger.debug(`Copied ${pluginName} assets to ${destPath}`)
			copiedCount++
		} catch (error) {
			logger.error(`Failed to copy assets for ${pluginName}:`, error)
		}
	}

	if (copiedCount > 0) {
		logger.debug(`Copied assets for ${copiedCount} plugin(s) in ${Date.now() - time}ms`)
	}
}

/**
 * Get merged plugin prefixes from manifest defaults and user config.
 * This mirrors the logic in prepare.ts to ensure consistent behavior.
 */
function getMergedPluginPrefixes(): PluginPrefixMap {
	const merged: PluginPrefixMap = {}

	// Get plugin defaults from manifest
	try {
		const plugins = Manifest.plugins()
		for (const plugin of plugins) {
			if (plugin.prefix) {
				// Store with leading slash for consistency
				const prefixValue = plugin.prefix.startsWith('/') ? plugin.prefix : `/${plugin.prefix}`
				merged[plugin.name] = prefixValue
			}
		}
	} catch {
		logger.debug('Could not load plugin prefixes from manifest')
	}

	// User config overrides plugin defaults
	const pluginConfig = getPluginOptions('@robojs/server') as PluginConfig | null
	if (pluginConfig?.pluginPrefixes) {
		Object.assign(merged, pluginConfig.pluginPrefixes)
	}

	return merged
}

/**
 * Check if a plugin prefix config includes static assets.
 */
function hasStaticPrefix(config: PluginPrefixConfig): boolean {
	if (typeof config === 'string') {
		return true // String prefix applies to both API and static
	}
	return config.static !== false && config.static !== undefined
}

/**
 * Convert plugin name to filesystem-safe namespace.
 * @example '@robojs/mock' -> 'robojs-mock'
 * @example 'my-plugin' -> 'my-plugin'
 */
function getPluginNamespace(pluginName: string): string {
	return pluginName.replace(/^@/, '').replace(/\//g, '-')
}
