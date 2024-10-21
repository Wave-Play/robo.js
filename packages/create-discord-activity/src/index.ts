#!/usr/bin/env node
import { Command } from 'robo.js/cli.js'
import { exec, getPackageExecutor, packageJson } from './utils.js'
import { logger } from 'robo.js'

interface CommandOptions {
	silent?: boolean
	verbose?: boolean
}

export default new Command('create-discord-activity')
	.description('Power up Discord with effortless activities, bots, web servers, and more! ⚡')
	.version(packageJson.version)
	.positionalArgs(true)
	.handler(async (_args: string[], options: CommandOptions) => {
		// Create a logger
		logger({
			enabled: !options.silent,
			level: options.verbose ? 'debug' : 'info'
		})

		// Forward to Sage CLI
		const args = process.argv.slice(2)
		const packageExecutor = getPackageExecutor()

		await exec([packageExecutor, '--yes', 'create-robo@latest', '-k', 'activity', ...args])
	})
	.parse()
