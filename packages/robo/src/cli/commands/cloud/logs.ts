import { Command } from '../../utils/cli-handler.js'
import { color, composeColors } from '../../../core/color.js'
import { logger } from '../../../core/logger.js'
import { RoboPlaySession } from '../../../roboplay/session.js'
import { RoboPlay } from '../../../roboplay/client.js'

const command = new Command('logs')
	.description("View your Robo's remote logs.")
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(logsAction)
export default command

const Indent = '   '

interface LogsCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function logsAction(_args: string[], options: LogsCommandOptions) {
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

	// Fetch remote logs
	const logs = await RoboPlay.Pod.getLogs({
		bearerToken: session.userToken,
		podId: link.podId
	})

	// Handle errors
	if (!logs.success) {
		logger.error(logs.error)
		return
	}

	// Print logs directly to stdout
	if (logs.logs.length === 0) {
		logger.info('No logs found.')
		return
	}

	logger.log('\n' + Indent, `Start of logs for Pod`, composeColors(color.bold, color.cyan)(link.podId), '\n\n')
	for (const log of logs.logs) {
		process.stdout.write(log.message + '\n', 'utf8')
	}
	logger.log('\n\n')

	logger.log(Indent, `... end of logs for Pod`, composeColors(color.bold, color.cyan)(link.podId), '\n')
}
