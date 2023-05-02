#!/usr/bin/env node
import { Command } from 'commander'
import { createRequire } from 'node:module'
import Robo from './robo.js'
import { logger } from './logger.js'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

interface CommandOptions {
	verbose?: boolean
}

new Command('create-robo <projectName>')
	.description('Create a new Robo project')
	.version(packageJson.version)
	.option('-v --verbose', 'print more information for debugging')
	.action(async (options: CommandOptions, { args }) => {
		logger({
			level: options.verbose ? 'debug' : 'info'
		}).debug(`Creating new Robo.js project...`)
		logger.log('')

		// Create a new Robo project prototype
		const projectName = args[0]
		const robo = new Robo(projectName)

		// Get user input to determine which features to include or use the recommended defaults
		const selectedFeaturesOrDefaults = await robo.getUserInput()
		if (selectedFeaturesOrDefaults === 'defaults') {
			await robo.createPackage(['TypeScript', 'ESLint', 'Prettier'])
		} else {
			await robo.createPackage(selectedFeaturesOrDefaults)
		}

		// Determine if TypeScript is selected and copy the corresponding template files
		const useTypeScript =
			selectedFeaturesOrDefaults === 'defaults' || (selectedFeaturesOrDefaults as string[]).includes('TypeScript')
		await robo.copyTemplateFiles('', useTypeScript)

		// Ask the user for their Discord credentials (token and client ID) and store them for later use
		await robo.askForDiscordCredentials()
		logger.log('')
		logger.ready(`Successfully created ${projectName}. Happy coding!`)
	})
	.parse(process.argv)
