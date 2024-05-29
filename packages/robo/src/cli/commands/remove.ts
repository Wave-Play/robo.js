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

const command = new Command('remove')
	.description('Removes a plugin from your Robo')
	.option('-f', '--force', 'forcefully remove & unregister packages')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.positionalArgs(true)
	.handler(removeAction)
export default command

interface RemoveCommandOptions {
	force?: boolean
	silent?: boolean
	verbose?: boolean
}

export async function removeAction(packages: string[], options: RemoveCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Removing ${packages.length} plugin${packages.length === 1 ? '' : 's'}...`)
	logger.debug(`Removing plugins:`, packages)
	logger.debug(`Current working directory:`, process.cwd())
	const startTime = Date.now()

	if (packages.length === 0) {
		logger.error(`No packages specified. Use ${color.bold('robo remove <package>')} to remove a plugin.`)
		return
	}

	// Check which plugin packages are already registered
	const config = await loadConfig()
	const pendingRegistration = packages.filter((pkg) => {
		return (
			options.force || config.plugins?.includes(pkg) || config.plugins?.find((p) => Array.isArray(p) && p[0] === pkg)
		)
	})
	logger.debug(`Pending registration remove:`, pendingRegistration)

	// Check which plugins need to be installed
	const packageJsonPath = path.join(process.cwd(), 'package.json')
	const packageJson = require(packageJsonPath)
	const pendingUninstall = packages.filter((pkg) => {
		return options.force || Object.keys(packageJson.dependencies ?? {})?.includes(pkg)
	})
	logger.debug(`Pending installation remove:`, pendingUninstall)

	// Remove plugin packages
	if (pendingUninstall.length > 0) {
		const packageManager = getPackageManager()
		const command = packageManager === 'npm' ? 'uninstall' : 'remove'
		logger.debug(`Using package manager:`, packageManager)

		// Uninstall dependencies using the package manager that triggered the command
		try {
			await exec(`${packageManager} ${command} ${pendingUninstall.join(' ')}`, {
				stdio: options.force ? 'inherit' : 'ignore'
			})
			logger.debug(`Successfully uninstalled packages!`)
		} catch (error) {
			logger.error(`Failed to uninstall packages:`, error)
			if (!options.force) {
				return
			}
		}
	}

	// Remove plugin registrations by removing their config files
	await Promise.all(
		pendingRegistration.map(async (pkg) => {
			return removePluginConfig(pkg)
		})
	)

	logger.info(`Successfully completed in ${Date.now() - startTime}ms`)
}

/**
 * Deletes the config file for a plugin in the config/plugins directory.
 *
 * @param pluginName The name of the plugin (e.g. @roboplay/plugin-ai)
 */
async function removePluginConfig(pluginName: string) {
	const pluginParts = pluginName.replace(/^@/, '').split('/')

	// Remove plugin config file
	const pluginPath = path.join(process.cwd(), 'config', 'plugins', ...pluginParts) + '.mjs'
	logger.debug(`Deleting ${pluginName} config from ${pluginPath}...`)
	await fs.rm(pluginPath, {
		force: true
	})
}
