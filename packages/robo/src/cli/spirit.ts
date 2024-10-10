import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { color, composeColors } from '../core/color.js'
import { logger } from '../core/logger.js'
import { setMode } from '../core/mode.js'
import { removeInstances } from '../core/state.js'
import type { SpiritMessage } from '../types/index.js'

// This should only be run in a worker thread
if (isMainThread) {
	logger.error('Spirit file should never be imported from the main thread!')
	process.exit(1)
}

// Inherit mode for this thread
if (workerData.mode) {
	setMode(workerData.mode)
}

// This is used to wait for the state to be loaded before continuing
let isRobo = false
let stateLoadResolve: () => void
const stateLoad = new Promise<void>((resolve) => {
	stateLoadResolve = resolve
})

interface BuildPayload {
	files: string[]
	mode?: string
}

/**
 * Spirits continue living in the background until their job is done.
 * Each job may be different, and some don't end until told to do so.
 */
async function run(message: SpiritMessage): Promise<unknown> {
	if (message.event === 'build') {
		const { buildAction } = await import('./commands/build/index.js')
		const payload = message.payload as BuildPayload
		await buildAction(payload.files, {
			dev: true,
			mode: payload.mode,
			verbose: message.verbose
		})
		return 'exit'
	} else if (message.event === 'get-state') {
		const { state } = await import('../core/state.js')
		return removeInstances(state)
	} else if (message.event === 'restart') {
		if (!isRobo) {
			return 'exit'
		}

		const { Robo } = await import('../core/robo.js')
		Robo.restart()
		return 'ok'
	} else if (message.event === 'set-state') {
		const { loadState } = await import('../core/state.js')
		loadState(message.state)
		stateLoadResolve()
		return 'ok'
	} else if (message.event === 'start') {
		const { Robo } = await import('../core/robo.js')
		Robo.start({ stateLoad }).catch((error) => {
			logger.error(error)
			logger.wait(
				`Robo failed to start, please check the logs for more information. Waiting for changes before retrying...`
			)
			process.exit(1)
		})
		isRobo = true
		return 'ok'
	} else if (message.event === 'stop') {
		if (!isRobo) {
			return 'exit'
		}

		const { Robo } = await import('../core/robo.js')
		Robo.stop()
		return 'ok'
	} else {
		throw `Unknown Spirit message event: ${message.event}`
	}
}

parentPort.on('message', async (message: SpiritMessage) => {
	// Update logger only if this spirit isn't already a Robo
	if (!isRobo) {
		logger({
			level: message.verbose ? 'debug' : 'info'
		})
	}
	logger.debug(`Spirit (${composeColors(color.bold, color.cyan)(workerData.spiritId)}) received message:`, message)

	// Handle message and send response (if any) back to main thread
	let result: SpiritMessage
	try {
		const payload = await run(message)
		result = { event: message.event, payload }
	} catch (error) {
		result = { error, payload: 'exit' }
	}
	logger.debug(`Spirit (${composeColors(color.bold, color.cyan)(workerData.spiritId)}) sending response:`, result)

	// Preemptively flush logs if we're exiting
	if (result.payload === 'exit') {
		await logger.flush()
	}

	// Forward response to main thread
	parentPort.postMessage(result)

	// Stop living once work is done ;-;
	if (result.payload === 'exit') {
		parentPort.close()
		process.exit()
	}
})
