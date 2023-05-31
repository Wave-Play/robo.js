import { isMainThread, parentPort } from 'node:worker_threads'
import { logger } from '../core/logger.js'
import { buildAction } from './commands/build/index.js'

interface WorkerMessage {
	command: 'build'
	verbose: boolean
}

// This should only be run in a worker thread
if (isMainThread) {
	logger.error('worker.js script should never be imported from the main thread!')
	process.exit(1)
}

// Keep this worker thread alive
setInterval(() => { /* :3 */ }, 1000).unref()

// Wait for main thread to send a message
parentPort.on('message', async (message: WorkerMessage) => {
	// Handle command type
	if (message.command === 'build') {
		await buildAction({
			dev: true,
			verbose: message.verbose
		})
	} else {
		logger.error(`Unknown worker message:`, message)
	}

	// Stop living once work is done ;-;
	parentPort.close()
})
