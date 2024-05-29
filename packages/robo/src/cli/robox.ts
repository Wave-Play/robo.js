#!/usr/bin/env node
import { spawn } from 'child_process'
import { loadEnv } from '../core/dotenv.js'
import { Command } from './utils/cli-handler.js'
import { IS_WINDOWS, packageJson } from './utils/utils.js'
import { logger as defaultLogger } from '../core/logger.js'
import { color } from '../core/color.js'

const command = new Command('robox')
export default command

command
	.description('Execute an authenticated Robo command.')
	.version(packageJson.version)
	.positionalArgs(true)
	.handler(handler)
	.parse()

async function handler() {
	// Determine if the user wants verbose output
	const splitAt = process.argv.indexOf('--')
	const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')
	const logger = defaultLogger({ level: verbose ? 'debug' : 'info' }).fork('robox')

	// Load environment variables
	logger.debug('Loading environment variables...')
	await loadEnv()

	// If "--" isn't present, assume `robo` command
	// `npx robox build` -> `robox -- npx robo build`
	const args = []
	if (splitAt === -1) {
		args.push('robo', ...process.argv.slice(2))
	} else {
		args.push(...process.argv.slice(splitAt + 1))
	}

	// Execute the command
	logger.debug(color.bold('> ' + args.join(' ')))
	const child = spawn(args[0], args.slice(1), {
		stdio: 'inherit',
		shell: IS_WINDOWS
	})

	process.on('SIGINT', () => child.kill('SIGINT'))
	process.on('SIGTERM', () => child.kill('SIGTERM'))
	process.on('exit', () => child.kill())
}
