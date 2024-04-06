import { Config } from '../types/index.js'
import { logger } from './logger.js'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Global config reference
let _config: Config = null
const _configPaths: Set<string> = new Set()

/**
 * Returns the currently loaded configuration.
 * May return null if config has yet to load. Use {@link loadConfig} to load it first.
 */
export function getConfig(): Config | null {
	return _config
}

/**
 * Returns the paths to all loaded configuration files.
 */
export function getConfigPaths(): Set<string> {
	return _configPaths
}

export async function loadConfig(file = 'robo'): Promise<Config> {
	const configPath = await loadConfigPath(file)
	let config: Config

	if (configPath) {
		config = await read<Config>(configPath)
		_configPaths.add(configPath)

		// Load plugin files when using "/config" directory
		if (configPath.includes(path.sep + 'config' + path.sep)) {
			logger.debug('Scanning for plugin files...')
			config.plugins = config.plugins ?? []

			await scanPlugins(configPath, (plugin, pluginConfig, pluginPath) => {
				// Remove existing plugin config if it exists
				const existingIndex = config.plugins?.findIndex((p) => p === plugin || p[0] === plugin)
				if (existingIndex !== -1) {
					config.plugins?.splice(existingIndex, 1)
				}

				config.plugins?.push([plugin, pluginConfig])
				_configPaths.add(pluginPath)
			})
		}
	} else {
		config = {
			clientOptions: {
				intents: []
			}
		}
	}

	_config = config
	logger.debug(`Loaded configuration file:`, config)
	return config
}

/**
 * Looks for the config file in the current project.
 * Will look for the following files in order:
 * - config/robo.mjs
 * - config/robo.cjs
 * - config/robo.json
 * - .config/robo.mjs
 * - .config/robo.cjs
 * - .config/robo.json
 *
 * @param file The name of the config file to look for. Defaults to "robo".
 * @returns The path to the config file, or null if it could not be found.
 */
export async function loadConfigPath(file = 'robo'): Promise<string> {
	const extensions = ['.mjs', '.cjs', '.json']
	const prefixes = ['config' + path.sep, '.config' + path.sep]

	for (const prefix of prefixes) {
		for (const ext of extensions) {
			const fullPath = path.join(process.cwd(), `${prefix}${file}${ext}`)

			try {
				if (fs.existsSync(fullPath)) {
					// Convert to file URL to allow for dynamic import()
					logger.debug(`Found configuration file at`, fullPath)
					return fullPath
				}
			} catch (ignored) {
				// empty
			}
		}
	}

	// If no config file was found, return null
	return null
}

/**
 * Scans the /plugins config subdirectory for plugins.
 *
 * @param callback A callback function to be called for each plugin found. The plugin name will be passed as the first argument, including the scoped organization if applicable. Second parameter is the plugin config object.
 */
async function scanPlugins(
	configPath: string,
	callback: (plugin: string, pluginConfig: unknown, pluginPath: string) => void
) {
	// Look for plugins in the same directory as the config file
	const pluginsPath = path.join(path.dirname(configPath), 'plugins')

	if (!fs.existsSync(pluginsPath)) {
		return
	}

	// For each file in the plugins directory, import it and add it to the config
	const plugins = fs.readdirSync(pluginsPath)

	for (const plugin of plugins) {
		const pluginPath = path.join(pluginsPath, plugin)

		// Load subdirectories as scoped plugins
		if (fs.statSync(pluginPath).isDirectory()) {
			const scopedPlugins = fs.readdirSync(pluginPath)

			for (const scopedPlugin of scopedPlugins) {
				const scopedPath = path.join(pluginPath, scopedPlugin)
				const [pluginName, pluginConfig] = await importConfigFile(scopedPath, pluginsPath)
				callback('@' + pluginName, pluginConfig, scopedPath)
			}
		} else {
			const [pluginName, pluginConfig] = await importConfigFile(pluginPath, pluginsPath)
			callback(pluginName, pluginConfig, pluginPath)
		}
	}
}

async function importConfigFile(configPath: string, basePath?: string): Promise<[string, unknown]> {
	// Compute the file name, keeping the base path in mind for scoped config files
	let resolvedPath: string

	if (basePath) {
		resolvedPath = path.relative(basePath, configPath)
	} else {
		resolvedPath = path.basename(configPath)
	}

	// Remove file extension and try to load file contents
	const pluginName = resolvedPath.split('.')[0]

	try {
		const pluginConfig = await read(configPath)
		return [pluginName, pluginConfig]
	} catch (e) {
		logger.debug(`Failed to load plugin configuration file for ${pluginName}:`, e)
		return [pluginName, {}]
	}
}

async function read<T = unknown>(configPath: string): Promise<T> {
	// If the file is a JSON file, handle it differently
	if (configPath.endsWith('.json')) {
		try {
			const rawData = fs.readFileSync(configPath, 'utf8')
			const pluginConfig = JSON.parse(rawData)
			return pluginConfig ?? {}
		} catch (e) {
			return {} as T
		}
	} else {
		try {
			// Convert to file URL to allow for a seamless dynamic import()
			const imported = await import(pathToFileURL(configPath).toString())
			const pluginConfig = imported.default ?? imported
			return pluginConfig ?? {}
		} catch (e) {
			logger.error(e)
			return {} as T
		}
	}
}
