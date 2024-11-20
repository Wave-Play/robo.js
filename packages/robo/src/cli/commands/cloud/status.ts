import { Command } from '../../utils/cli-handler.js'
import { color, composeColors } from '../../../core/color.js'
import { logger } from '../../../core/logger.js'
import { getPodStatusColor } from '../../utils/utils.js'
import { RoboPlaySession } from '../../../roboplay/session.js'
import { RoboPlay } from '../../../roboplay/client.js'
import type { ListResult, Pod } from '../../../roboplay/types.js'

const command = new Command('status')
	.description('Check RoboPlay status.')
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

	// Check if each Pod is online
	let pods: ListResult<Pod> = { data: [], success: false }
	if (session?.userToken) {
		pods = await RoboPlay.Pod.list({ bearerToken: session?.userToken, userId: session?.user?.id })
	}

	const podResults = await Promise.all(
		pods?.data?.map(async (pod) => {
			try {
				// Get pod status
				const statusColor = getPodStatusColor(pod.status)
				const linked = session.linkedProjects[process.cwd()]?.podId === pod.id

				return { linked, pod, statusColor }
			} catch (error) {
				logger.debug(`Failed to get Pod status for ${pod.name}`, error)

				return {
					pod,
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

	podResults?.forEach(({ linked, pod, statusColor }) => {
		logger.log('\n' + Indent, color.bold('🤖 Pod - ' + pod.name))
		if (pod.robo) {
			logger.log(Indent, 'Robo:', color.bold(pod.robo?.name), linked ? color.cyan('(linked)') : '')
		}
		logger.log(Indent, 'Status:', composeColors(color.bold, statusColor)(pod.status))
	})

	logger.log()
}
