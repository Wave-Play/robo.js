import { Command } from '../../utils/cli-handler.js'
import { color, composeColors } from '../../../core/color.js'
import { logger } from '../../../core/logger.js'
import { RoboPlaySession } from '../../../roboplay/session.js'
import { RoboPlay } from '../../../roboplay/client.js'

const command = new Command('stop')
	.description('Stop your Robo Pod.')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(stopAction)
export default command

interface StopCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function stopAction(_args: string[], options: StopCommandOptions) {
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

	// Stop the pod
	const pod = session.pods.find((pod) => pod.id === link.podId)
	logger.info(`Stopping Pod ${composeColors(color.bold, color.cyan)(pod.name)}...`)
	const result = await RoboPlay.Pod.stop({
		bearerToken: session.userToken,
		podId: pod.id
	})

	// Handle errors
	if (!result.success) {
		logger.debug(`Failed to stop Pod ${composeColors(color.bold, color.cyan)(pod.name)}.`)
		logger.error(result.error)
		return
	}

	// Success
	logger.info(`Successfully stopped Pod ${composeColors(color.bold, color.cyan)(pod.name)}.`)
}
