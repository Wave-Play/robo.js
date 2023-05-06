#!/usr/bin/env node
import { Command } from 'commander'
import { createRequire } from 'node:module'
import Robo from './robo.js'
import { logger } from './logger.js'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

interface CommandOptions {
	javascript?: boolean
	typescript?: boolean
	verbose?: boolean
}

new Command('create-robo <projectName>')
	.description('Create a new Robo project')
	.version(packageJson.version)
	.option('-js --javascript', 'create a Robo using JavaScript')
	.option('-ts --typescript', 'create a Robo using TypeScript')
	.option('-v --verbose', 'print more information for debugging')
	.action(async (options: CommandOptions, { args }) => {
		logger({
			level: options.verbose ? 'debug' : 'info'
		}).debug(`Creating new Robo.js project...`)
		logger.debug(`Using options: ${JSON.stringify(options)}`)
		logger.log('')

		// Create a new Robo project prototype
		const projectName = args[0]
		const robo = new Robo(projectName)

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
		await robo.copyTemplateFiles('')

		// Ask the user for their Discord credentials (token and client ID) and store them for later use
		await robo.askForDiscordCredentials()
		logger.log('')
		logger.ready(`Successfully created ${projectName}. Happy coding!`)
	})
	.parse(process.argv)
