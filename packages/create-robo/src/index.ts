#!/usr/bin/env node
import Robo from './robo.js'
import { Indent, getPackageManager } from './utils.js'
import { Command } from 'commander'
import { input, select } from '@inquirer/prompts'
import { createRequire } from 'node:module'
import path from 'node:path'
import chalk from 'chalk'
import { logger } from 'robo.js'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

export interface CommandOptions {
	features?: string
	install?: boolean
	javascript?: boolean
	kit?: 'activity' | 'app' | 'bot' | 'web'
	plugin?: boolean
	plugins?: string[]
	template?: string
	typescript?: boolean
	verbose?: boolean
	roboVersion?: string
	update?: boolean
	creds?: boolean
}

new Command('create-robo <projectName>')
	.description('Launch epic projects instantly with Robo.js — effortless, powerful, complete!')
	.version(packageJson.version)
	.option('-f --features <features>', 'comma-separated list of features to include')
	.option('-js --javascript', 'create a Robo using JavaScript')
	.option('-p --plugins <plugins...>', 'pre-install plugins along with the project')
	.option('-P --plugin', 'create a Robo plugin instead of a bot')
	.option('-ni --no-install', 'skips the installation of dependencies')
	.option('-nu --no-update', 'skips the update check')
	.option('-t --template <templateUrl>', 'create a Robo from an online template')
	.option('-ts --typescript', 'create a Robo using TypeScript')
	.option('-v --verbose', 'print more information for debugging')
	.option('-rv, --robo-version <value>', 'specify a Robo.js version to use')
	.option('-k, --kit <value>', 'choose a kit to start off with your Robo')
	.option('-nc --no-creds', 'Skips asking for the credentials')
	.action(async (options: CommandOptions, { args }) => {
		logger({
			level: options.verbose ? 'debug' : 'info'
		}).debug(`Creating new Robo.js ${options.plugin ? 'plugin' : 'project'}...`)
		logger.debug(`Using options: ${JSON.stringify(options)}`)
		logger.debug(`Package manager:`, getPackageManager())
		logger.debug(`create-robo version:`, packageJson.version)
		logger.debug(`Current working directory:`, process.cwd())

		// `activity` is an alias for `app`
		if (options.kit === 'activity') {
			options.kit = 'app'
		}

		// No kit specified, prompt the user to choose an adventure: bot or activity
		if (!options.kit && !options.template) {
			logger.log()
			options.kit = await select<'app' | 'bot'>(
				{
					message: chalk.blue('Choose your adventure:'),
					choices: [
						{ name: 'Discord Bot', value: 'bot' as const },
						{ name: 'Discord Activity', value: 'app' as const }
					]
				},
				{
					clearPromptOnDone: true
				}
			)
		}

		// Ensure correct kit is selected (bot or app)
		if (options.kit && !['bot', 'app', 'web'].includes(options.kit)) {
			logger.error('Only bot (default) and activity kits are available at the moment.')
			return
		}

		// Check for updates
		if (options.update) {
			await checkUpdates()
		}

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
			projectName = await input({
				message: `What would you like to call your Robo?`,
				validate: (input) => {
					if (input.trim().length < 1) {
						return 'Oops! Please enter a name for your Robo before continuing.'
					}
					return true
				}
			})
			useSameDirectory = true
		}

		// Print introduction section
		logger.log('')
		logger.log(Indent, chalk.bold('✨ Welcome to Robo.js!'))
		logger.log(Indent, `   Spawning ${chalk.bold.cyan(projectName)} into existence...`)

		const metadata: Array<{ key: string; value: string }> = []
		if (options.plugin) {
			metadata.push({ key: 'Type', value: 'Plugin' })
		}
		if (options.javascript || options.typescript) {
			metadata.push({ key: 'Language', value: options.typescript ? 'TypeScript' : 'JavaScript' })
		}
		if (options.features) {
			metadata.push({ key: 'Features', value: options.features })
		}
		if (options.plugins) {
			metadata.push({ key: 'Plugins', value: options.plugins.join(', ') })
		}
		if (options.install === false) {
			metadata.push({ key: 'Install dependencies', value: 'No' })
		}
		if (options.roboVersion) {
			metadata.push({ key: 'Robo version', value: options.roboVersion })
		}

		if (metadata.length > 0) {
			logger.log('')
			logger.log(Indent, chalk.bold('   Specs:'))
			metadata.forEach(({ key, value }) => {
				logger.log(Indent, `   - ${key}:`, chalk.bold.cyan(value))
			})
		}

		// Create a new Robo project prototype
		logger.debug(`Creating Robo prototype...`)
		const robo = new Robo(projectName, options, useSameDirectory)
		const plugins = options.plugins ?? []
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

			// Get user input to determine which features to include or use the recommended defaults
			selectedFeaturesOrDefaults = options.features?.split(',') ?? (await robo.getUserInput())
			await robo.createPackage(selectedFeaturesOrDefaults, plugins)

			// Determine if TypeScript is selected and copy the corresponding template files
			logger.debug(`Copying template files...`)
			await robo.copyTemplateFiles('')
			logger.debug(`Finished copying template files!`)
		}

		// Want some plugins?
		// if there are plugins specified with the command we skip asking for more.
		if (!options.template && (options.plugins === undefined || options.plugins.length <= 0)) {
			await robo.plugins()
		}

		// Ask the user for their Discord credentials (token and client ID) and store them for later use
		// Skip this step if the user is creating a plugin
		if (!robo.isPlugin) {
			logger.debug(`Asking for Discord credentials...`)
			await robo.askForDiscordCredentials()
		}

		// Bun is special
		if (getPackageManager() === 'bun') {
			await robo.bun()
		}

		const packageManager = getPackageManager()
		logger.log(Indent.repeat(15))
		logger.log(Indent, '🚀', chalk.bold.green('Your Robo is ready!'))
		logger.log(Indent, '   Say hello to this world,', chalk.bold(projectName) + '.')
		logger.log('')
		logger.log(Indent, '   ' + chalk.bold('Next steps:'))
		if (!useSameDirectory) {
			logger.log(Indent, '   - Change directory:', chalk.bold.cyan(`cd ${projectName}`))
		}
		if (!options.install || robo.shouldInstall) {
			logger.log(Indent, '   - Install dependencies:', chalk.bold.cyan(packageManager + ' install'))
		}
		if (robo.missingEnv) {
			logger.log(Indent, '   - Add missing variables:', chalk.bold.cyan('.env'))
		}
		logger.log(Indent, '   - Develop locally:', chalk.bold.cyan(packageManager + ' run dev'))
		logger.log(Indent, '   - Deploy to the cloud:', chalk.bold.cyan(packageManager + ' run deploy'))
		if (robo.selectedPlugins.length < 1) {
			logger.log(Indent, '   - Check out or create your own plugins')
		}

		if (robo.installFailed) {
			logger.log('')
			logger.log(Indent, '   ' + chalk.bold.red('Resolve the following issues:'))
			logger.log(Indent, '   - Install dependencies manually:', chalk.bold.cyan(packageManager + ' install <packages>'))
		}
		logger.log('')
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
		const command = `${commandName} ${packageJson.name}@latest`
		const args = process.argv.slice(2).join(' ')

		// Print update message
		logger.log('')
		logger.log(
			Indent,
			chalk.bold.green(`💡 Update available!`),
			chalk.dim(`(v${packageJson.version} → v${latestVersion})`)
		)
		logger.log(Indent, `   Run this instead to get the latest updates:`)
		logger.log(Indent, '   ' + chalk.bold.cyan(command + ' ' + args))
	}
}
