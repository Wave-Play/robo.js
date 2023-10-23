import { Command } from 'commander'
import { logger } from '../core/logger.js'
import { getPackageManager } from '../core/utils.js'

const command = new Command('export')
	.arguments('[modules...]')
	.description('Export module(s) from your Robo as plugins')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(importAction)
export default command

interface ExportOptions {
	silent?: boolean
	verbose?: boolean
}

async function importAction(modules: string[], options: ExportOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Exporting ${modules.length} module${modules.length === 1 ? '' : 's'}...`)
	logger.debug(`Package manager:`, getPackageManager())
	logger.debug(`Current working directory:`, process.cwd())
}
