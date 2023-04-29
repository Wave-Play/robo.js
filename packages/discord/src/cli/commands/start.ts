import { Command } from 'commander'
import fs from 'fs/promises'
import { logger } from '../../core/logger.js'
import chalk from 'chalk'
import { hasFilesRecursively } from '../utils/fs-helper.js'

const command = new Command('start')
	.description('Starts your bot in production mode.')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(startAction)
export default command

interface StartCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function startAction(options: StartCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Starting Robo in ${chalk.bold('production mode')}...`)
	logger.warn(`Thank you for trying Robo.js! This is a pre-release version, so please let us know of issues on GitHub.`)

	// Check if .robo/build directory has .js files (recursively)
	if (!(await hasFilesRecursively('.robo/build'))) {
		logger.error(
			`No production build found. Make sure to compile your Robo using ${chalk.bold.blue('"robo build"')} first.`
		)
		process.exit(1)
	}

	// Check if .robo/manifest.json is missing
	try {
		await fs.access('.robo/manifest.json')
	} catch (err) {
		logger.error(
			`The ${chalk.bold(
				'.robo/manifest.json'
			)} file is missing. Make sure your project structure is correct and run ${chalk.bold.blue('"robo build"')} again.`
		)
		process.exit(1)
	}

	// Imported dynamically to prevent multiple process hooks
	const { Robo } = await import('../../core/robo.js')

	// Start Roboooooooo!! :D
	Robo.start()
}
