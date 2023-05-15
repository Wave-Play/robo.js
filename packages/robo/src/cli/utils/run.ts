import { fork } from 'child_process'
import { logger } from '../../core/logger.js'
import type { ChildProcess } from 'child_process'
import type { RoboMessage } from '../../types/index.js'

const ENTRY_FILE = './node_modules/@roboplay/robo.js/dist/entry.js'

let _currentProcess: ChildProcess | null = null
let _eventsRegistered = false

/**
 * Runs the Robo entry file in a child process.
 *
 * The Robo is run in a child process in development mode for various reasons:
 * - This clears the import cache, which is crucial for refreshing code changes
 * - The plugin cache is cleared, which is also crucial for refreshing code changes
 * - A clean process is closer to the production environment
 */
export function run(): Promise<ChildProcess> {
	return new Promise((resolve, reject) => {
		logger.debug(`> ${ENTRY_FILE} --enable-source-maps`)
		const childProcess = fork(ENTRY_FILE, {
			execArgv: ['--enable-source-maps'],
			stdio: 'inherit'
		})
		_currentProcess = childProcess

		// Make sure to kill the bot process when the process exits
		if (!_eventsRegistered) {
			process.on('SIGINT', () => {
				_currentProcess?.kill('SIGINT')
				process.exit(0)
			})
			process.on('SIGTERM', () => {
				_currentProcess?.kill('SIGTERM')
				process.exit(0)
			})
			_eventsRegistered = true
		}

		const onMonitorReady = (message: RoboMessage) => {
			if (message.type === 'ready') {
				logger.debug('New child process is ready!')
				childProcess.off('message', onMonitorReady)
				resolve(childProcess)
			}
		}

		logger.debug('Waiting for new process to be ready...')
		childProcess.on('message', onMonitorReady)
		childProcess.once('error', (error) => {
			reject(error)
		})
	})
}
