import { fork } from 'child_process'
import { logger } from '../../core/logger.js'
import type { ChildProcess } from 'child_process'
import type { RoboMessage } from '../../types/index.js'

const ENTRY_FILE = './node_modules/@roboplay/robo.js/dist/entry.js'

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

		const onMonitorReady = (message: RoboMessage) => {
			if (message.type === 'ready') {
				logger.debug('New child process is ready!')
				childProcess.off('message', onMonitorReady)
				resolve(childProcess)
			}
		}

		// Make sure to kill the bot process when the process exits
		process.on('SIGINT', () => {
			childProcess?.kill('SIGINT')
			process.exit(0)
		})
		process.on('SIGTERM', () => {
			childProcess?.kill('SIGTERM')
			process.exit(0)
		})

		logger.debug('Waiting for new process to be ready...')
		childProcess.on('message', onMonitorReady)
		childProcess.once('error', (error) => {
			reject(error)
		})
	})
}
