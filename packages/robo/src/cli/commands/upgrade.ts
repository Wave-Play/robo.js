import { logger } from '../../core/logger.js'
import { Command } from '../utils/cli-handler.js'
import { exec } from '../utils/utils.js'
import { getPackageExecutor } from '../utils/runtime-utils.js'

const command = new Command('upgrade')
	.description('Upgrades your Robo to the latest version')
	.option('-f', '--force', 'forcefully install')
	.option('-ns', '--no-self-check', 'do not check for updates to Sage CLI')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.handler(upgradeAction)
export default command

interface UpgradeCommandOptions {
	force?: boolean
	silent?: boolean
	verbose?: boolean
}

export async function upgradeAction(_files: string[], options: UpgradeCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Forwarding to Sage CLI...`)

	// Update with the same package manager
	const packageExecutor = getPackageExecutor()
	const args = process.argv.slice(3)
	logger.debug(`Package executor:`, packageExecutor)
	logger.debug(`Arguments:`, args)

	await exec([packageExecutor, '@roboplay/sage@latest', 'upgrade', ...args])
}
