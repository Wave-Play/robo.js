import { Command } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import { color } from '../../core/color.js'
import { RoboPlaySession } from '../../roboplay/session.js'

const command = new Command('logout')
	.description('Sign out of your RoboPlay account')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(logoutAction)
export default command

const Indent = '   '

interface LogoutCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function logoutAction(_args: string[], options: LogoutCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})

	// Farewell, user!
	await RoboPlaySession.clear()
	logger.log('\n' + Indent, color.green(`You have successfully signed out!`))
}
