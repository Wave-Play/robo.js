import { Command } from '../../utils/cli-handler.js'
import { color, composeColors } from '../../../core/color.js'
import { logger } from '../../../core/logger.js'
import { RoboPlaySession } from '../../../roboplay/session.js'
import { RoboPlay } from '../../../roboplay/client.js'

const command = new Command('status')
	.description('Builds your plugin for distribution.')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(statusAction)
export default command

const Indent = '   '

interface StatusCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function statusAction(_args: string[], options: StatusCommandOptions) {
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})
	logger.debug(`Current working directory:`, process.cwd())

	// Get session
	const session = await RoboPlaySession.get()
	const sessionColor = session ? color.green : color.red
	const sessionStatus = session ? 'Authenticated' : 'Not authenticated'

	// Check if RoboPlay is online
	const roboplay = await RoboPlay.status()
	const roboplayColor = roboplay ? color.green : color.red
	const roboplayStatus = roboplay ? 'Online' : 'Offline'

	// Check if Robo is online
	const roboResults = await Promise.all(
		session?.robos?.map(async (robo) => {
			try {
				const statusResult = await RoboPlay.Robo.status({ bearerToken: session.userToken, roboId: robo.id })
				const status = statusResult?.success && statusResult?.status === 'online' ? 'Online' : 'Offline'
				const statusColor = status === 'Online' ? color.green : color.red
				const linked = session.linkedProjects[robo.id] === process.cwd()

				return { linked, robo, status, statusColor }
			} catch (error) {
				logger.debug(`Failed to get Robo status for ${robo.name}`, error)

				return {
					robo,
					status: 'Unknown',
					statusColor: color.yellow
				}
			}
		})
	)

	// Log status for everything
	logger.log('\n' + Indent, color.bold('🔒 Session'))
	if (session?.user) {
		logger.log(Indent, 'Account:', color.bold(session.user.displayName))
	}
	logger.log(Indent, 'Status:', composeColors(color.bold, sessionColor)(sessionStatus))

	logger.log('\n' + Indent, color.bold('🌐 RoboPlay'))
	logger.log(Indent, 'Status:', composeColors(color.bold, roboplayColor)(roboplayStatus))
	if (!roboplay) {
		logger.log(Indent, 'More info:', composeColors(color.underline, color.blue)('https://status.roboplay.dev'))
	}

	roboResults?.forEach(({ linked, robo, status, statusColor }) => {
		logger.log('\n' + Indent, color.bold('🤖 Robo'))
		logger.log(Indent, 'Name:', color.bold(robo.name), linked ? color.cyan('(linked)') : '')
		logger.log(Indent, 'Status:', composeColors(color.bold, statusColor)(status))
	})

	logger.log()
}
