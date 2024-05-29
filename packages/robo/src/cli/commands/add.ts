import fs from 'node:fs/promises'
import path from 'node:path'
import { color } from '../../core/color.js'
import { loadConfig } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { Command } from '../utils/cli-handler.js'
import { createRequire } from 'node:module'
import { exec } from '../utils/utils.js'
import { getPackageManager } from '../utils/runtime-utils.js'

const require = createRequire(import.meta.url)

const localPrefixes = ['file:', '.', '/', '~', ':']

const command = new Command('add')
	.description('Adds a plugin to your Robo.')
	.option('-f', '--force', 'forcefully install & register packages')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.positionalArgs(true)
	.handler(addAction)
export default command

interface AddCommandOptions {
	force?: boolean
	silent?: boolean
	verbose?: boolean
}

export async function addAction(packages: string[], options: AddCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Adding ${packages.length} plugin${packages.length === 1 ? '' : 's'}...`)
	logger.debug(`Adding plugins:`, packages)
	logger.debug(`Current working directory:`, process.cwd())
	const startTime = Date.now()

	if (packages.length === 0) {
		logger.error(`No packages specified. Use ${color.bold('robo add <package>')} to add a plugin.`)
		return
	}

	// Check which plugin packages are already registered
	const config = await loadConfig()
	const pendingRegistration = await Promise.all(
		packages
			.filter((pkg) => {
				return options.force || !config.plugins?.includes(pkg)
			})
			.map(async (pkg) => {
				// Extract real package name from local paths
				const isLocal = localPrefixes.some((prefix) => {
					return prefix === ':' ? pkg.indexOf(prefix) === 1 : pkg.startsWith(prefix)
				})

				if (isLocal) {
					const packageJsonPath = path.join(pkg, 'package.json')
					const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
					return packageJson.name
				}

				return pkg
			})
	)
	logger.debug(`Pending registration add:`, pendingRegistration)

	// Check which plugins need to be installed
	const packageJsonPath = path.join(process.cwd(), 'package.json')
	const packageJson = require(packageJsonPath)
	const pendingInstall = packages.filter((pkg) => {
		return (
			options.force ||
			(!Object.keys(packageJson.dependencies ?? {})?.includes(pkg) &&
				!config.plugins?.find((p) => Array.isArray(p) && p[0] === pkg))
		)
	})
	logger.debug(`Pending installation add:`, pendingInstall)

	// Install plugin packages
	if (pendingInstall.length > 0) {
		const packageManager = getPackageManager()
		const command = packageManager === 'npm' ? 'install' : 'add'
		logger.debug(`Using package manager:`, packageManager)

		// Install dependencies using the package manager that triggered the command
		try {
			await exec(`${packageManager} ${command} ${pendingInstall.join(' ')}`, {
				stdio: options.force ? 'inherit' : 'ignore'
			})
			logger.debug(`Successfully installed packages!`)
		} catch (error) {
			logger.error(`Failed to install packages:`, error)
			if (!options.force) {
				return
			}
		}
	}

	// Register plugins by adding them to the config
	await Promise.all(pendingRegistration.map((pkg) => createPluginConfig(pkg, {})))
	logger.info(`Successfully completed in ${Date.now() - startTime}ms`)
}

/**
 * Generates a plugin config file in the config/plugins directory.
 *
 * @param pluginName The name of the plugin (e.g. @roboplay/plugin-ai)
 * @param config The plugin config
 */
async function createPluginConfig(pluginName: string, config: Record<string, unknown>) {
	// Split plugin name into parts to create parent directories
	const pluginParts = pluginName.replace(/^@/, '').split('/')

	// Make sure the directory exists
	await fs.mkdir(path.join(process.cwd(), 'config', 'plugins'), {
		recursive: true
	})

	// Create parent directory if this is a scoped plugin
	if (pluginName.startsWith('@')) {
		await fs.mkdir(path.join(process.cwd(), 'config', 'plugins', pluginParts[0]), {
			recursive: true
		})
	}

	// Normalize plugin path
	const pluginPath = path.join(process.cwd(), 'config', 'plugins', ...pluginParts) + '.mjs'
	const pluginConfig = JSON.stringify(config) + '\n'

	logger.debug(`Writing ${pluginName} config to ${pluginPath}...`)
	await fs.writeFile(pluginPath, `export default ${pluginConfig}`)
}
