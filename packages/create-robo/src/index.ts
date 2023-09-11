#!/usr/bin/env node
import { Command } from 'commander'
import inquirer from 'inquirer'
import { createRequire } from 'node:module'
import path from 'node:path'
import Robo from './robo.js'
import { logger } from './logger.js'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

interface CommandOptions {
	javascript?: boolean
	plugin?: boolean
	template?: string
	typescript?: boolean
	verbose?: boolean
}

new Command('create-robo <projectName>')
	.description('Create a new Robo project')
	.version(packageJson.version)
	.option('-js --javascript', 'create a Robo using JavaScript')
	.option('-p --plugin', 'create a Robo plugin instead of a bot')
	.option('-t --template <templateUrl>', 'create a Robo from an online template')
	.option('-ts --typescript', 'create a Robo using TypeScript')
	.option('-v --verbose', 'print more information for debugging')
	.action(async (options: CommandOptions, { args }) => {
		logger({
			level: options.verbose ? 'debug' : 'info'
		}).debug(`Creating new Robo.js ${options.plugin ? 'plugin' : 'project'}...`)
		logger.debug(`Using options: ${JSON.stringify(options)}`)

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

		if (useSameDirectory) {
			logger.log(`This new ${robo.isPlugin ? 'plugin' : 'Robo'} will be created in the current directory.`)
		}
		logger.log('')

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
			const selectedFeaturesOrDefaults = await robo.getUserInput()
			await robo.createPackage(selectedFeaturesOrDefaults)

			// Determine if TypeScript is selected and copy the corresponding template files
			logger.debug(`Copying template files...`)
			await robo.copyTemplateFiles('')
			logger.debug(`Finished copying template files!`)
		}

		// Ask the user for their Discord credentials (token and client ID) and store them for later use
		// Skip this step if the user is creating a plugin
		if (!robo.isPlugin) {
			logger.debug(`Asking for Discord credentials...`)
			await robo.askForDiscordCredentials()
		}
		logger.log('')
		logger.ready(`Successfully created ${projectName}. Happy coding!`)
	})
	.parse(process.argv)
