#!/usr/bin/env node
import { Highlight, HighlightBlue, HighlightGreen, HighlightRed, Indent } from './core/constants.js'
import Robo from './robo.js'
import { IS_BUN_RUNTIME, SupportedPackageManagers, getPackageManager, packageJson } from './utils.js'
import path from 'node:path'
import { input, select } from '@inquirer/prompts'
import { color, logger } from 'robo.js'
import { Command } from 'robo.js/cli.js'
import { Env } from './env.js'
import { getKitName } from './utils/kit.js'
import type { PackageManager } from './utils.js'

export type RoboKit = 'activity' | 'app' | 'bot' | 'plugin' | 'web'
const RoboKits: RoboKit[] = ['activity', 'app', 'bot', 'plugin', 'web']

export interface CommandOptions {
	env?: string
	features?: string
	install?: boolean
	javascript?: boolean
	kit?: RoboKit
	name?: string
	['package-manager']?: PackageManager
	plugin?: boolean
	plugins?: string[]
	template?: string
	typescript?: boolean
	verbose?: boolean
	roboVersion?: string
	update?: boolean
	'no-creds'?: boolean
	'no-features'?: boolean
	'no-install'?: boolean
	'no-plugins'?: boolean
	'no-update'?: boolean
	creds?: boolean
	version?: boolean
}

new Command('create-robo <projectName>')
	.description('Launch epic projects instantly with Robo.js — effortless, powerful, complete!')
	.version(packageJson.version)
	.positionalArgs(true)
	.option('-e', '--env', 'specify environment variables as key-value pairs.')
	.option('-f', '--features', 'comma-separated list of features to include')
	.option('-js', '--javascript', 'create a Robo using JavaScript')
	.option('-p', '--plugins', 'pre-install plugins along with the project')
	.option('-P', '--plugin', 'create a Robo plugin instead of a project')
	.option('-pm', '--package-manager', 'specify the package manager to use')
	.option('-n', '--name', 'specify the name of the Robo project')
	.option('-nf', '--no-features', 'skips the features selection')
	.option('-ni', '--no-install', 'skips the installation of dependencies')
	.option('-np', '--no-plugins', 'skips the installation of plugins')
	.option('-nu', '--no-update', 'skips the update check')
	.option('-t', '--template', 'create a Robo from an online template')
	.option('-ts', '--typescript', 'create a Robo using TypeScript')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-rv', '--robo-version', 'specify a Robo.js version to use')
	.option('-k', '--kit', 'choose a kit to start off with your Robo')
	.option('-nc', '--no-creds', 'Skips asking for the credentials')
	.handler(async (args: string[], options: CommandOptions) => {
		const { env } = options
		logger({
			level: options.verbose ? 'debug' : 'info'
		}).debug(`Creating new Robo.js ${options.kit === 'plugin' ? 'plugin' : 'project'}...`)
		logger.debug(`Using options: ${JSON.stringify(options)}`)
		logger.debug(`Using args: ${JSON.stringify(args)}`)
		logger.debug(`System package manager:`, getPackageManager())
		logger.debug(`create-robo version:`, packageJson.version)
		logger.debug(`Current working directory:`, process.cwd())

		// Just return the version if requested
		if (options.version) {
			const version = color.cyan('v' + packageJson.version)

			logger.log()
			logger.log(Indent, '⚡', color.bold('Create Robo ' + version))
			logger.log(Indent, '  ', packageJson.description)
			logger.log()
			logger.log(Indent, '   Learn more:', HighlightBlue('https://robojs.dev/create-robo'))
			logger.log()

			return
		}

		// Verify option types for better Commander API compatibility
		if (typeof options.plugins === 'string') {
			// @ts-expect-error - This is a valid check
			options.plugins = options.plugins.split(' ')
		} else if (options.kit?.includes(' ')) {
			// Bypasses current bug in CLi handler causing kit to be read as arg
			// e.g. `npx create-robo -k activity myProject` reads `activity myProject` as the kit
			// TODO: https://github.com/Wave-Play/robo.js/issues/331
			const tokens = options.kit.split(' ')
			options.kit = tokens.shift() as RoboKit
			args.push(...tokens)
		}

		// Set default values
		if (options.creds === undefined) {
			options.creds = true
		}
		if (options['no-creds']) {
			options.creds = false
		}
		if (options.install === undefined) {
			options.install = true
		}
		if (options['no-install']) {
			options.install = false
		}
		if (options['no-plugins']) {
			options.plugins = []
		}
		if (options.update === undefined) {
			options.update = true
		}
		if (options['no-update']) {
			options.update = false
		}

		// `activity` is an alias for `app`
		if (options.kit === 'activity') {
			options.kit = 'app'
		}

		// Plugin alias yields plugin kit
		if (options.plugin) {
			options.kit = 'plugin'
		}

		// Got a custom package manager? Let's use it as long as it's supported
		const packageManager = options['package-manager'] ?? getPackageManager()
		logger.debug(`Using package manager:`, packageManager)

		if (!SupportedPackageManagers.includes(packageManager)) {
			logger.error(
				`The package manager ${Highlight(packageManager)} is not supported. Please use one of:`,
				SupportedPackageManagers.map(Highlight).join(', ')
			)
			return
		}

		// No kit specified, prompt the user to choose an adventure: bot or activity or webapp
		if (!options.kit && !options.template) {
			logger.log()
			options.kit = await select<RoboKit>(
				{
					message: color.blue('Choose your adventure:'),
					choices: [
						{ name: 'Discord Activity', value: 'app' as const },
						{ name: 'Discord Bot', value: 'bot' as const },
						{ name: 'Plugin', value: 'plugin' as const },
						{ name: 'Web Application', value: 'web' as const }
					]
				},
				{
					clearPromptOnDone: true
				}
			)
		}

		// Ensure correct kit is selected (bot or app or web)
		if (options.kit && !RoboKits.includes(options.kit)) {
			logger.error('Only bot (default), activity and web kits are available at the moment.')
			return
		}

		if (options.name && typeof options.name !== 'string') {
			const example = Highlight('npx create-robo --name epicbot')
			logger.error(`Please provide a valid name for your Robo project. (e.g. ${example})`)
			return
		}

		// Check for updates
		if (options.update) {
			await checkUpdates(packageManager)
		}

		// Infer project name from current directory if it was not provided
		let projectName = args[0] ?? options.name
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
		const kitName = getKitName(options.kit, options.template)
		const spawnKit = kitName !== 'Unknown' ? ` as a ${Highlight(kitName)}` : ''
		logger.log('')
		logger.log(Indent, color.bold('✨ Welcome to Robo.js!'))
		logger.log(Indent, `   Spawning ${Highlight(projectName)}${spawnKit}...`)

		const metadata: Array<{ key: string; value: string }> = []
		if (options.kit === 'plugin') {
			metadata.push({ key: 'Type', value: 'Plugin' })
		}
		if (options.javascript || options.typescript) {
			metadata.push({ key: 'Language', value: options.typescript ? 'TypeScript' : 'JavaScript' })
		}
		if (options.features) {
			metadata.push({ key: 'Features', value: options.features })
		}
		if (options.plugins?.length) {
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
			logger.log(Indent, color.bold('   Specs:'))
			metadata.forEach(({ key, value }) => {
				logger.log(Indent, `   - ${key}:`, Highlight(value))
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
			selectedFeaturesOrDefaults = options['no-features']
				? []
				: options.features?.split(',') ?? (await robo.getUserInput())
			await robo.createPackage(selectedFeaturesOrDefaults, plugins)

			// Determine if TypeScript is selected and copy the corresponding template files
			logger.debug(`Copying template files...`)
			await robo.copyTemplateFiles('')
			logger.debug(`Finished copying template files!`)
		}

		// Want some plugins?
		// if there are plugins specified with the command we skip asking for more.
		if (
			options.kit !== 'plugin' &&
			!options.template &&
			!options['no-plugins'] &&
			(options.plugins === undefined || options.plugins.length <= 0)
		) {
			await robo.plugins()
		}

		// Ask the user for their Discord credentials (token and client ID) and store them for later use
		// Skip this step if the user is creating a plugin or using web kit
		if (!robo.isPlugin && options.kit !== 'web') {
			logger.debug(`Asking for Discord credentials...`)
			await robo.askForDiscordCredentials()
		} else if (!robo.isPlugin && options.kit === 'web') {
			logger.debug('Generating web .env file...')
			const envFile = await new Env('.env', robo.workingDir).load()
			envFile.set('NODE_OPTIONS', ['--enable-source-maps'].join(' '), 'Enable source maps for easier debugging')
			envFile.set('PORT', '3000', 'Change this port number if needed')
			await envFile.commit(robo.isTypeScript)
			logger.debug('Successfully generated web .env file!')
		}

		// Save env options as well
		const envVars = env?.split(',')
		logger.debug('Parsed option environment variables:', envVars)

		if (envVars) {
			logger.debug(`Saving ${envVars.length} environment variables from options...`)
			const envFile = await new Env('.env', robo.workingDir).load()

			for (const envVar of envVars) {
				const [key, value] = envVar.split('=')
				envFile.set(key, value)
			}

			await envFile.commit(robo.isTypeScript)
			logger.debug(`Successfully saved environment variables!`)
		}

		// Bun is special
		// if executed with with `bunx --bun create-robo`
		// it will use it as runtime, hence:
		if (IS_BUN_RUNTIME) {
			await robo.bun()
		}

		logger.log(Indent.repeat(15))
		logger.log(Indent, '🚀', HighlightGreen('Your Robo is ready!'))
		logger.log(Indent, '   Say hello to this world,', color.bold(projectName) + '.')
		logger.log('')

		// What's next?
		logger.log(Indent, '   ' + color.bold('Next steps'))
		if (!useSameDirectory) {
			logger.log(Indent, '   - Change directory:', Highlight(`cd ${projectName}`))
		}
		if (!options.install || robo.shouldInstall) {
			logger.log(Indent, '   - Install dependencies:', Highlight(packageManager + ' install'))
		}
		if (robo.missingEnv) {
			logger.log(Indent, '   - Add missing variables:', Highlight('.env'))
		}
		logger.log(Indent, '   - Develop locally:', Highlight(packageManager + ' run dev'))
		logger.log(Indent, '   - Deploy to the cloud:', Highlight(packageManager + ' run deploy'))

		// Show what failed and how to resolve
		if (robo.installFailed) {
			logger.log('')
			logger.log(Indent, '   ' + HighlightRed('Resolve these issues'))
			logger.log(Indent, '   - Install dependencies manually:', Highlight(packageManager + ' install <packages>'))
		}

		// Link to common resources
		if (options.kit === 'app') {
			logger.log('')
			logger.log(Indent, '  ', color.bold('Learn more'))
			logger.log(Indent, '   - Documentation:', HighlightBlue('https://robojs.dev/discord-activities'))
			logger.log(
				Indent,
				'   - Authenticating users:',
				HighlightBlue('https://robojs.dev/discord-activities/authentication')
			)
			logger.log(
				Indent,
				'   - Multiplayer features:',
				HighlightBlue('https://robojs.dev/discord-activities/multiplayer')
			)
			// logger.log(Indent, '   - ✨🎃 Hacktoberfest:', HighlightMagenta('https://robojs.dev/hacktoberfest'))
		} else if (options.kit === 'bot') {
			logger.log('')
			logger.log(Indent, '  ', color.bold('Learn more'))
			logger.log(Indent, '   - Documentation:', HighlightBlue('https://robojs.dev/discord-bots'))
			logger.log(Indent, '   - Context commands:', HighlightBlue('https://robojs.dev/discord-bots/context-menu'))
			logger.log(Indent, '   - Slash commands:', HighlightBlue('https://robojs.dev/discord-bots/commands'))
			// logger.log(Indent, '   - ✨🎃 Hacktoberfest:', HighlightMagenta('https://robojs.dev/hacktoberfest'))
		}

		logger.log('')
	})
	.parse()

async function checkUpdates(packageManager: PackageManager) {
	// Check NPM registry for updates
	logger.debug(`Checking for updates...`)
	const response = await fetch(`https://registry.npmjs.org/${packageJson.name}/latest`)
	const latestVersion = (await response.json()).version
	logger.debug(`Latest version on NPM Registry: ${latestVersion}`)

	// Compare versions
	if (packageJson.version !== latestVersion) {
		// Prepare commands
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
			HighlightGreen(`💡 Update available!`),
			color.dim(`(v${packageJson.version} → v${latestVersion})`)
		)
		logger.log(Indent, `   Run this instead to get the latest updates:`)
		logger.log(Indent, '   ' + Highlight(command + ' ' + args))
	}
}
