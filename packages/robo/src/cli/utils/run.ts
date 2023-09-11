import { fork } from 'child_process'
import { logger } from '../../core/logger.js'
import { locateInHierarchy } from './utils.js'
import type { ChildProcess } from 'child_process'
import type { RoboMessage } from '../../types/index.js'

const ENTRY_FILE = '/node_modules/@roboplay/robo.js/dist/entry.js'

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
		locateInHierarchy(ENTRY_FILE).then((entryFile) => {
			logger.debug(`> ${entryFile} --enable-source-maps`)
			const childProcess = fork(entryFile, {
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
	
			const start = Date.now()
			const onMonitorReady = (message: RoboMessage) => {
				if (message.type === 'ready') {
					logger.debug(`New Robo process became ready in ${Date.now() - start}ms`)
					childProcess.off('message', onMonitorReady)
					resolve(childProcess)
				}
			}
	
			logger.debug('Waiting for Robo process to be ready...')
			childProcess.on('message', onMonitorReady)
			childProcess.once('error', (error) => {
				reject(error)
			})
		}).catch((error) => {
			logger.error(`Failed to locate Robo entry file: ${ENTRY_FILE}`)
			reject(error)
		})
	})
}
