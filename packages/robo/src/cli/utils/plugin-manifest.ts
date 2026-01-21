/**
 * Plugin Manifest Loader
 *
 * Loads minimal manifest info from a plugin's granular manifest for seed operations.
 * This is used during CLI operations (robo add) to seed files and env variables.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { logger } from '../../core/logger.js'
import type { PluginManifestInfo, ManifestSeed } from '../../types/manifest.js'

/**
 * Load minimal manifest info from a plugin's granular manifest.
 * Returns language and seed config needed for seeding operations.
 *
 * @param basePath - Base path to the plugin (containing .robo directory)
 * @param pluginName - Plugin package name (for seed file lookup)
 */
export async function loadPluginManifestInfo(
	basePath: string,
	pluginName: string
): Promise<PluginManifestInfo> {
	const manifestBase = path.join(basePath, '.robo', 'manifest', 'production')

	try {
		// Read robo.json for project metadata (language)
		const roboPath = path.join(manifestBase, 'robo.json')
		const roboContent = await fs.readFile(roboPath, 'utf-8')
		const roboData = JSON.parse(roboContent) as { language?: string }

		// Read seeds from seeds/{plugin}.json
		let seedConfig: ManifestSeed | undefined
		const pluginFileName = pluginName.replace(/@/g, '').replace(/\//g, '__')
		const seedPath = path.join(manifestBase, 'seeds', `${pluginFileName}.json`)

		try {
			const seedContent = await fs.readFile(seedPath, 'utf-8')
			seedConfig = JSON.parse(seedContent)
		} catch {
			// Seed file may not exist - that's fine
		}

		return {
			language: roboData.language === 'typescript' ? 'typescript' : 'javascript',
			seed: seedConfig
		}
	} catch (error) {
		logger.debug(`Failed to read granular manifest at ${manifestBase}:`, error)

		// Return defaults if manifest doesn't exist
		return {
			language: 'javascript',
			seed: undefined
		}
	}
}

/**
 * Check if a plugin has a granular manifest.
 */
export async function hasPluginManifest(basePath: string): Promise<boolean> {
	const manifestDir = path.join(basePath, '.robo', 'manifest', 'production')

	try {
		await fs.stat(path.join(manifestDir, 'robo.json'))
		return true
	} catch {
		return false
	}
}
