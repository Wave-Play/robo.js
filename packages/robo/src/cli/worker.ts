import { isMainThread, parentPort } from 'node:worker_threads'
import { logger } from '../core/logger.js'
import type { SpiritMessage } from '../types/index.js'

// This should only be run in a worker thread
if (isMainThread) {
	logger.error('Spirit file should never be imported from the main thread!')
	process.exit(1)
}

// Keep this worker thread alive
setInterval(() => {
	/* :3 */
}, 1000).unref()

// This is used to wait for the state to be loaded before continuing
let stateLoadResolve: () => void
const stateLoad = new Promise<void>((resolve) => {
	stateLoadResolve = resolve
})

/**
 * Spirits continue living in the background until their job is done.
 * Each job may be different, and some don't end until told to do so.
 */
async function run(message: SpiritMessage): Promise<unknown> {
	if (message.command === 'build') {
		const { buildAction } = await import('./commands/build/index.js')
		await buildAction({
			dev: true,
			verbose: message.verbose
		})
		return 'exit'
	} else if (message.command === 'restart') {
		const { Robo } = await import('../core/robo.js')
		Robo.restart()
		return 'ok'
	} else if (message.command === 'start') {
		const { Robo } = await import('../core/robo.js')
		Robo.start({ stateLoad })
		return 'ok'
	} else if (message.event === 'state-load') {
		const { loadState } = await import('../core/state.js')
		loadState(message.state)
		stateLoadResolve()
		return 'ok'
	} else {
		throw `Unknown worker message: ${message.command}`
	}
}

parentPort.on('message', async (message: SpiritMessage) => {
	logger({
		level: message.verbose ? 'debug' : 'info'
	}).debug(`Spirit received message:`, message)

	// Handle message and send response (if any) back to main thread
	let result: SpiritMessage
	try {
		result = { response: await run(message) }
	} catch (error) {
		result = { response: 'exit', error }
	}

	// Preemptively flush logs if we're exiting
	if (result.response === 'exit') {
		await logger.flush()
	}

	// Forward response to main thread
	parentPort.postMessage(result)

	// Stop living once work is done ;-;
	if (result.response === 'exit') {
		parentPort.close()
	}
})
