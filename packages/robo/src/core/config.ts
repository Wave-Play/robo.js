import { Config } from '../types/index.js'
import { logger } from './logger.js'
import fs from 'node:fs'
import path from 'node:path'
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
	const prefixes = [
		file.endsWith('.config') ? '' : 'config' + path.sep,
		file.endsWith('.config') ? '' : '.config' + path.sep
	]

	for (const prefix of prefixes) {
		for (const ext of extensions) {
			const fullPath = path.join(process.cwd(), `${prefix}${file}${ext}`)

			try {
				logger.error(fs.existsSync(fullPath))
				if (fs.existsSync(fullPath)) {
					logger.debug(`Found configuration file at`, fullPath)
					return pathToFileURL(fullPath).toString()
				}
			} catch (ignored) {
				// empty
			}
		}
	}

	const fileName = path.join(prefixes[1], file)
	if (fileName.endsWith('.config')) {
		return null
	} else {
		return loadConfigPath(file + '.config')
	}
}
