import fs from 'node:fs'
import { Config } from '../types/index.js'
import { logger } from './logger.js'
import { pathToFileURL } from 'node:url'

// Global config reference
let _config: Config = null

/**
 * Returns the currently loaded configuration.
 * May return null if config has yet to load. Use `loadConfig` to load it first.
 */
export function getConfig(): Config | null {
	return _config
}

export async function loadConfig(file = 'robo'): Promise<Config> {
	const configPath = await loadConfigPath(file)
	let config: Config

	if (configPath) {
		const imported = await import(configPath)
		config = imported.default ?? imported ?? {}
		logger.debug(`Loaded configuration file:`, config)
	} else {
		config = {
			clientOptions: {
				intents: []
			}
		}
	}

	_config = config
	return config
}

export async function loadConfigPath(file = 'robo'): Promise<string> {
	const extensions = ['.mjs', '.cjs']
	const prefix = file.endsWith('.config') ? '' : '.config/'

	for (const ext of extensions) {
		const fullPath = `${process.cwd()}/${prefix}${file}${ext}`
		try {
			const importPath = pathToFileURL(fullPath).toString()
			fs.existsSync(importPath)
			logger.debug(`Found configuration file at`, importPath)
			return importPath
		} catch (ignored) {
			// empty
		}
	}

	const fileName = `${prefix}${file}`
	if (fileName.endsWith('.config')) {
		return null
	} else {
		return loadConfigPath(file + '.config')
	}
}
