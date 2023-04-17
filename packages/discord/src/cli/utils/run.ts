import { fork } from 'child_process'
import { logger } from '../../core/logger.js'

const ENTRY_FILE = './node_modules/@roboplay/robo.js/dist/entry.js'

export function run() {
	logger.debug(`> ${ENTRY_FILE} --enable-source-maps`)
	return fork(ENTRY_FILE, {
		execArgv: ['--enable-source-maps'],
		stdio: 'inherit'
	})
}
