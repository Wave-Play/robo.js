import { Highlight, HighlightGreen, Indent } from './../../core/constants.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { color } from '../../core/color.js'
import { loadConfig } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { Command } from '../utils/cli-handler.js'
import { createRequire } from 'node:module'
import { PackageDir, exec } from '../utils/utils.js'
import { getPackageExecutor, getPackageManager } from '../utils/runtime-utils.js'
import { Compiler } from '../utils/compiler.js'
import { Spinner } from '../utils/spinner.js'
import readline from 'node:readline'

const require = createRequire(import.meta.url)

const localPrefixes = ['file:', '.', '/', '~', ':']

const command = new Command('add')
	.description('Adds a plugin to your Robo.')
	.option('-f', '--force', 'forcefully install & register packages')
	.option('-ns', '--no-seed', 'skip the seeding of files from the plugin')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-y', '--yes', 'auto-accept seed files')
	.positionalArgs(true)
	.handler(addAction)
export default command

interface AddCommandOptions {
	force?: boolean
	'no-seed'?: boolean
	silent?: boolean
	sync?: boolean
	verbose?: boolean
	yes?: boolean
}

export async function addAction(packages: string[], options: AddCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})
	logger.debug(`Adding plugins:`, packages)
	logger.debug(`Current working directory:`, process.cwd())
	const startTime = Date.now()
	const seed = !options['no-seed']
	const s = packages.length > 1 ? 's' : ''

	if (packages.length === 0) {
		logger.error(`No packages specified. Use ${color.bold('robo add <package>')} to add a plugin.`)
		return
	}

	// Prepare fancy formatting
	const spinner = new Spinner()
	logger.log('\n' + Indent, color.bold(`📦 Installing plugin${s}`))
	spinner.setText(packages.map((pkg) => `${Indent}    - {{spinner}} ${Highlight(pkg)}`).join('\n') + `\n\n`)
	spinner.start()

	if (options.verbose) {
		spinner.stop(false, false)
	}

	// Check which plugin packages are already registered
	const config = await loadConfig()
	const nameMap: Record<string, string> = {}
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
					nameMap[pkg] = packageJson.name
					return packageJson.name
				}

				nameMap[pkg] = pkg
				return pkg
			})
	)
	spinner.setText(pendingRegistration.map((pkg) => `${Indent}    - {{spinner}} ${Highlight(pkg)}`).join('\n') + `\n\n`)
	logger.debug('Pending registration add:', pendingRegistration)

	// Check which plugins need to be installed
	const packageJsonPath = path.join(process.cwd(), 'package.json')
	const packageJson = require(packageJsonPath)
	const pendingInstall = packages
		.filter((pkg) => {
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
			await exec([packageManager, command, ...pendingInstall], {
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

	// Update spinner with registered plugins
	spinner.setText(
		pendingRegistration.map((pkg) => `${Indent}    ${HighlightGreen('✔ ' + pkg)}  `).join('\n') + `\n\n`,
		false
	)
	spinner.stop(false, false)

	// See which plugins have seeds
	const pluginsWithSeeds = packages.filter((pkg) => Compiler.hasSeed(pkg))
	logger.debug(`Plugins with seeds:`, pluginsWithSeeds)

	// Automatically copy files meant to be seeded by the plugin
	if (seed && options.sync && pluginsWithSeeds.length > 0) {
		const executor = getPackageExecutor(false)
		const command = executor + ' robo add ' + packages.join(' ')
		logger.log(Indent, color.bold(`🌱 Seed files detected`))
		logger.log(Indent, '   Run the following to copy seed files:', '\n   ' + Indent, Highlight(command))
		logger.log('')
	} else if (seed && pluginsWithSeeds.length > 0) {
		const pluginSeeds = await Promise.all(
			packages.map(async (pkg) => {
				const manifest = await Compiler.useManifest({
					basePath: path.resolve(PackageDir, '..', pkg)
				})
				const description = manifest.__robo?.seed?.description

				return `${Indent}    - ${Highlight(nameMap[pkg])}${description ? ': ' + description : ''}`
			})
		)
		logger.log(Indent, color.bold(`🌱 Seed files detected`))
		logger.log(pluginSeeds.join('\n'), '\n')

		// Consent
		const promptUser = (question: string): Promise<string> => {
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			})

			return new Promise((resolve) => {
				rl.question(question, (input) => {
					rl.close()
					resolve(input)
				})
			})
		}

		// Ask for consent
		let seedConsent = options.yes
		if (!seedConsent) {
			const response = await promptUser(Indent + `    Would you like to include these files? ${color.dim('[Y/n]')}: `)
			seedConsent = response.toLowerCase().trim() === 'y'
			logger.log('')
		}

		if (seedConsent) {
			await Promise.all(
				packages.map(async (pkg) => {
					try {
						await Compiler.useSeed(pkg)
					} catch (error) {
						logger.error(`Failed to copy seed files for plugin ${color.bold(pkg)}:`, error)
					}
				})
			)
		}
	}

	// Ta-dah!
	logger.log(Indent, `✨ Plugin${s} successfully installed and ready to use.\n`)
	logger.debug(`Finished in ${Date.now() - startTime}ms`)
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
