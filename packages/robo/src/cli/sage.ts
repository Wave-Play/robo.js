#!/usr/bin/env node
import { logger } from '../core/logger.js'
import { Command } from './utils/cli-handler.js'
import { getPackageExecutor } from './utils/runtime-utils.js'
import { exec, packageJson } from './utils/utils.js'

const command = new Command('sage')
	.version(packageJson.version)
	.description('Codemod for Robo.js')
	.option('-v', '--verbose', 'print more information for debugging')
	.positionalArgs(true)
	.handler(async (_args, options) => {
		// Create a logger
		logger({
			enabled: !options.silent,
			level: options.verbose ? 'debug' : 'info'
		}).info(`Forwarding to Sage CLI...`)
		logger.debug(`Current working directory:`, process.cwd())

		// Forward to Sage CLI
		const args = process.argv.slice(2)
		const packageExecutor = getPackageExecutor()

		await exec([packageExecutor, '@roboplay/sage@latest', ...args])
	})
	.parse()
export default command
