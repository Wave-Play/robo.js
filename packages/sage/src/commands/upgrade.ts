import { Command } from 'commander'
import { logger } from '../core/logger.js'
import { getPackageManager } from '../core/utils.js'

const command = new Command('upgrade')
	.description('Upgrades your Robo to the latest version')
	.option('-f --force', 'forcefully install')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(upgradeAction)
export default command

interface UpgradeOptions {
	force?: boolean
	silent?: boolean
	verbose?: boolean
}

// TODO:
// - Handle upgrade process (handle package manager changes)
// - Check and show codemod changes
// - Let user choose which changes to apply
// - Apply changes
// - Auto accept option for ci
// - Load changelog
async function upgradeAction(_files: string[], options: UpgradeOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Checking for updates...`)
	logger.debug(`Package manager:`, getPackageManager())
	logger.debug(`Current working directory:`, process.cwd())
}
