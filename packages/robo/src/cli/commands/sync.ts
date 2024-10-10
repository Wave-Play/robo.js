import { Command } from '../utils/cli-handler.js'
import { color, composeColors } from '../../core/color.js'
import { logger } from '../../core/logger.js'
import { getPackageManager } from '../utils/runtime-utils.js'
import { findPackagePath, getRoboPackageJson, PackageDir, packageJson } from '../utils/utils.js'
import { addAction } from './add.js'
import { removeAction } from './remove.js'
import { loadConfig } from '../../core/config.js'
import { Flashcore, prepareFlashcore } from '../../core/flashcore.js'
import { existsSync } from 'node:fs'
import path from 'node:path'

const command = new Command('sync')
	.description('Syncs the Robo with the latest plugins and configurations')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(syncAction)
export default command

interface SyncCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function syncAction(_args: string[], options: SyncCommandOptions) {
	// Configure logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).debug('Syncing Robo...')
	logger.debug('CLI options:', options)
	logger.debug(`Package manager:`, getPackageManager())
	logger.debug(`Robo.js version:`, packageJson.version)
	logger.debug(`Current working directory:`, process.cwd())

	// Get project package.json to read dependencies from
	let roboPackageJson

	try {
		roboPackageJson = await getRoboPackageJson()
		logger.debug(`Syncing from Robo's package.json:`, roboPackageJson)
	} catch (error) {
		logger.warn(`Error reading package.json:`, error)
		return
	}

	// Check past runs to see if we've already handled these plugins
	await loadConfig()
	await prepareFlashcore()
	const pluginRecord =
		(await Flashcore.get<Record<string, boolean>>('plugins', {
			namespace: ['robo', 'sync']
		})) ?? {}
	logger.debug('Plugin record:', pluginRecord)

	// Go through each dependency to find Robo plugins by checking for `.robo` directory
	const time = Date.now()
	const pluginPaths: Record<string, string> = {}
	const allPlugins: string[] = (
		await Promise.all(
			Object.keys(roboPackageJson.dependencies || {}).map(async (packageName: string) => {
				let pluginPath = path.join(PackageDir, '..', packageName, '.robo')

				if (existsSync(pluginPath)) {
					pluginPaths[packageName] = path.join(pluginPath, '..')
					return packageName
				}

				pluginPath = path.join(await findPackagePath(packageName, process.cwd()), '.robo')
				if (!existsSync(pluginPath)) {
					return null
				}

				pluginPaths[packageName] = path.join(pluginPath, '..')
				return packageName
			})
		)
	)
		.filter(Boolean)
		.sort()
	logger.debug(`Found ${allPlugins.length} total Robo plugins in ${Date.now() - time}ms:`, allPlugins)

	// Filter out plugins that have already been handled
	const addPlugins = allPlugins.filter((plugin) => {
		return !pluginRecord[plugin]
	})
	const pluginsInRecord = Object.keys(pluginRecord).sort()
	logger.debug(`Found ${addPlugins.length} new plugins to handled:`, addPlugins)

	// Remove plugins that are no longer in package.json
	const removePlugins = pluginsInRecord.filter((plugin) => !allPlugins.includes(plugin))
	logger.debug(`Found ${removePlugins.length} plugins to remove:`, removePlugins)

	// Nothing to see here!
	if (addPlugins.length === 0 && removePlugins.length === 0) {
		logger.debug(composeColors(color.bold, color.green)('This Robo is up-to-date!'), 'No sync required.')
		return
	}

	// New plugins found! Let's register them!
	if (addPlugins.length > 0) {
		logger.debug(addPlugins.length, `new plugin${addPlugins.length === 1 ? '' : 's'} detected.`)
		logger.debug('Registering new plugins:', addPlugins)

		try {
			const args = addPlugins.map((pkg) => {
				return isDependencyFromNpm(roboPackageJson.dependencies?.[pkg]) ? pkg : pluginPaths[pkg]
			})
			await addAction(args, {
				silent: options.silent,
				sync: true,
				verbose: options.verbose
			})
		} catch (error) {
			logger.error('Problem adding plugins:', error)
		}
	}

	// Plugins removed from package.json, let's remove them from the record
	if (removePlugins.length > 0) {
		logger.debug(removePlugins.length, `plugin${removePlugins.length === 1 ? '' : 's'} removed.`)
		logger.debug('Removing plugins:', removePlugins)

		try {
			await removeAction(removePlugins, {
				silent: options.silent,
				verbose: options.verbose
			})

			for (const plugin of removePlugins) {
				delete pluginRecord[plugin]
			}
		} catch (error) {
			logger.error('Problem removing plugins:', error)
		}
	}

	// Mark all plugins as handled
	const newPayload = {
		...allPlugins.reduce((acc, plugin) => {
			acc[plugin] = true
			return acc
		}, {} as Record<string, boolean>)
	}
	logger.debug('Saving new plugin record:', newPayload)

	await Flashcore.set('plugins', newPayload, {
		namespace: ['robo', 'sync']
	})
}

/*
 * Used to register with package name if it's from npm, otherwise register with local path
 */
function isDependencyFromNpm(versionSpec: string): boolean {
	// If it's a valid semver version or range, assume it's from npm
	if (isValidSemver(versionSpec)) {
		return true
	}

	// Attempt to parse as a URL (check if remote dependency)
	try {
		const url = new URL(versionSpec)

		if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'git:') {
			return false
		}
	} catch (e) {
		// Not a valid URL, proceed
	}

	// Check if the versionSpec is a file system path (local dependency)
	if (
		versionSpec.startsWith('file:') ||
		versionSpec.startsWith('link:') ||
		path.isAbsolute(versionSpec) ||
		versionSpec.startsWith('./') ||
		versionSpec.startsWith('../') ||
		versionSpec.startsWith('~') ||
		(process.platform === 'win32' && /^[a-zA-Z]:[\\/]/.test(versionSpec))
	) {
		return false
	}

	// If it doesn't match any known patterns, assume it's from npm
	return true
}

function isValidSemver(versionSpec: string): boolean {
	const semverRegex = /^v?(?:\d+)(?:\.\d+){0,2}(?:-[\w-.]+)?(?:\+[\w-.]+)?$/
	const rangeRegex = /^[\^~]?v?(?:\d+)(?:\.\d+){0,2}(?:-[\w-.]+)?(?:\+[\w-.]+)?$/
	versionSpec = versionSpec.trim()

	return semverRegex.test(versionSpec) || rangeRegex.test(versionSpec) || versionSpec === '*'
}
