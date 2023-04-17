import { Config } from '../../types/index.js'
import { logger } from '../../core/logger.js'
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

export async function loadConfig(file = 'robo'): Promise<Config | null> {
	const extensions = ['.mjs', '.cjs']
	const prefix = file.endsWith('.config') ? '' : '.config/'

	for (const ext of extensions) {
		const fullPath = `${process.cwd()}/${prefix}${file}${ext}`
		try {
			const importPath = pathToFileURL(fullPath).toString()
			const imported = await import(importPath)
			const config = imported.default ?? imported ?? {}
			_config = config
			logger.debug(`Loaded configuration file:`, config)
			return config
		} catch (ignored) {
			// empty
		}
	}

	const fileName = `${prefix}${file}`
	if (fileName.endsWith('.config')) {
		_config = {
			clientOptions: {
				intents: []
			}
		}
		return _config
	} else {
		return loadConfig(file + '.config')
	}
}
