import { Command } from '../../utils/cli-handler.js'
import { color, composeColors } from '../../../core/color.js'
import { logger } from '../../../core/logger.js'
import { RoboPlaySession } from '../../../roboplay/session.js'
import { RoboPlay } from '../../../roboplay/client.js'

const command = new Command('start')
	.description('Start your Robo Pod.')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(startAction)
export default command

interface StartCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function startAction(_args: string[], options: StartCommandOptions) {
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})

	// Verify session
	const session = await RoboPlaySession.get()
	if (!session) {
		logger.error(
			`You must be logged in to deploy to RoboPlay. Run ${composeColors(
				color.bold,
				color.cyan
			)('robo login')} to get started.`
		)
		return
	}

	// Verify project is linked
	const link = session.linkedProjects[process.cwd()]
	if (!link?.podId) {
		logger.error(
			`This project is not linked to a Robo Pod. Run ${composeColors(
				color.bold,
				color.cyan
			)('robo login')} again to fix this.`
		)
		return
	}

	// Start the pod
	const pod = session.pods.find((pod) => pod.id === link.podId)
	logger.info(`Starting Pod ${composeColors(color.bold, color.cyan)(pod.name)}...`)
	const result = await RoboPlay.Pod.start({
		bearerToken: session.userToken,
		podId: pod.id
	})

	// Handle errors
	if (!result.success) {
		logger.debug(`Failed to start Pod ${composeColors(color.bold, color.cyan)(pod.name)}.`)
		logger.error(result.error)
		return
	}

	// Success
	logger.info(`Successfully started Pod ${composeColors(color.bold, color.cyan)(pod.name)}.`)
}
