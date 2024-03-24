#!/usr/bin/env node
import { Command } from 'commander'
import inquirer from 'inquirer'
import { createRequire } from 'node:module'
import path from 'node:path'
import Robo from './robo.js'
import { logger } from './logger.js'
import { getPackageManager } from './utils.js'
import chalk from 'chalk'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

interface CommandOptions {
	features?: string
	install?: boolean
	javascript?: boolean
	plugin?: boolean
	plugins?: string[]
	template?: string
	typescript?: boolean
	verbose?: boolean
	roboVersion?: string
	kit?: string
}

new Command('create-robo <projectName>')
	.description('Create a new Robo project')
	.version(packageJson.version)
	.option('-f --features <features>', 'comma-separated list of features to include')
	.option('-js --javascript', 'create a Robo using JavaScript')
	.option('-p --plugins <plugins...>', 'pre-install plugins along with the project')
	.option('-P --plugin', 'create a Robo plugin instead of a bot')
	.option('-ni --no-install', 'skip installing dependencies')
	.option('-t --template <templateUrl>', 'create a Robo from an online template')
	.option('-ts --typescript', 'create a Robo using TypeScript')
	.option('-v --verbose', 'print more information for debugging')
	.option('-rv, --robo-version <value>', 'choose which version of robo your project will use')
	.option('-kit, --kit <value>', 'blablfezfzfa', 'app')
	.action(async (options: CommandOptions, { args }) => {
		logger({
			level: options.verbose ? 'debug' : 'info'
		}).debug(`Creating new Robo.js ${options.plugin ? 'plugin' : 'project'}...`)
		logger.debug(`Using options: ${JSON.stringify(options)}`)
		logger.debug(`Package manager:`, getPackageManager())
		logger.debug(`create-robo version:`, packageJson.version)
		logger.debug(`Current working directory:`, process.cwd())

		if (options.kit === 'app') {
		}

		// parses robo version argument
		const roboVersion = await getRoboversionArg(options.roboVersion)

		// Check for updates
		await checkUpdates()

		// Infer project name from current directory if it was not provided
		let projectName = args[0]
		let useSameDirectory = false

		if (!projectName) {
			projectName = process.cwd().split(path.sep).pop()
			useSameDirectory = true
		}
		logger.debug(`Project name: ${projectName}`)

		// Ask the user for Robo name directly as a fallback
		if (!projectName) {
			logger.debug(`Project name not provided, asking user...`)
			const answers = await inquirer.prompt([
				{
					type: 'input',
					name: 'projectName',
					message: `What would you like to call your Robo?`,
					validate: (input) => {
						if (input.trim().length < 1) {
							return 'Oops! Please enter a name for your Robo before continuing.'
						}
						return true
					}
				}
			])
			projectName = answers.projectName
			useSameDirectory = true
		}

		// Create a new Robo project prototype
		logger.debug(`Creating Robo prototype...`)
		const robo = new Robo(projectName, options.plugin, useSameDirectory)
		const plugins = options.plugins ?? []

		if (useSameDirectory) {
			logger.log(`This new ${robo.isPlugin ? 'plugin' : 'Robo'} will be created in the current directory.`)
		}
		logger.log('')

		let selectedFeaturesOrDefaults: string[] = []
		if (options.template) {
			logger.debug(`Downloading template: ${options.template}`)
			await robo.downloadTemplate(options.template)
		} else {
			// Verify plugin status if it sounds like one
			if (!robo.isPlugin && projectName.toLowerCase().includes('plugin')) {
				await robo.askIsPlugin()
			}

			// Copy the template files to the new project directory
			if (options.javascript || options.typescript) {
				const useTypeScript = options.typescript ?? false
				robo.useTypeScript(useTypeScript)
				logger.info(`Using ${useTypeScript ? 'TypeScript' : 'JavaScript'}`)
			} else {
				await robo.askUseTypeScript()
			}

			// Get user input to determine which features to include or use the recommended defaults
			selectedFeaturesOrDefaults = options.features?.split(',') ?? (await robo.getUserInput())
			await robo.createPackage(selectedFeaturesOrDefaults, plugins, options.install ?? true, roboVersion)

			// Determine if TypeScript is selected and copy the corresponding template files
			logger.debug(`Copying template files...`)
			await robo.copyTemplateFiles('')
			logger.debug(`Finished copying template files!`)
		}

		// Ask the user for their Discord credentials (token and client ID) and store them for later use
		// Skip this step if the user is creating a plugin
		if (!robo.isPlugin) {
			logger.debug(`Asking for Discord credentials...`)
			await robo.askForDiscordCredentials(selectedFeaturesOrDefaults)
		}
		logger.log('')
		logger.ready(`Successfully created ${projectName}. Happy coding!`)
	})
	.parse(process.argv)

async function checkUpdates() {
	// Check NPM registry for updates
	logger.debug(`Checking for updates...`)
	const response = await fetch(`https://registry.npmjs.org/${packageJson.name}/latest`)
	const latestVersion = (await response.json()).version
	logger.debug(`Latest version on NPM Registry: ${latestVersion}`)

	// Compare versions
	if (packageJson.version !== latestVersion) {
		// Prepare commands
		const packageManager = getPackageManager()
		let commandName = 'npx'
		if (packageManager === 'yarn') {
			commandName = 'yarn dlx'
		} else if (packageManager === 'pnpm') {
			commandName = 'pnpx'
		} else if (packageManager === 'bun') {
			commandName = 'bunx'
		}
		const command = `${commandName} ${packageJson.name}@${latestVersion}`

		// Print update message
		logger.info(chalk.bold.green(`A new version of ${chalk.bold('create-robo')} is available! (v${latestVersion})`))
		logger.info(`Run as ${chalk.bold(command)} instead to get the latest updates.`)
	}
}

async function getRoboversionArg(roboVersion: string): Promise<string> {
	let result = 'latest'

	if (roboVersion) {
		const response = await fetch(`https://registry.npmjs.org/@roboplay/robo.js/${roboVersion}`)
		const version = (await response.json()).version

		if (version) {
			result = version
		} else {
			logger.error('Invalid Robo version, falling back to latest..')
		}
	} else {
		logger.debug('No Robo version specified, reading latest from NPM registry...')
		const response = await fetch(`https://registry.npmjs.org/@roboplay/robo.js/latest`)
		const version = (await response.json()).version

		if (version) {
			result = version
		} else {
			logger.error('Failed to read latest Robo version from NPM registry, falling back to latest..')
		}
	}
	return result
}
