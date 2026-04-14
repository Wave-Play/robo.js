import path from 'node:path'
import { Worker, type WorkerOptions } from 'node:worker_threads'
import { __DIRNAME } from './utils.js'
import { logger } from '../../core/logger.js'
import { SpiritMessage } from 'src/types/index.js'
import { nameGenerator } from './name-generator.js'
import { color, composeColors } from '../../core/color.js'
import { Mode } from '../../core/mode.js'
import { Env } from '../../core/env.js'

interface Task<T = unknown> extends SpiritMessage {
	onExit?: (exitCode: number) => boolean | void
	onRetry?: (value: T) => void
	payload?: unknown
	reject?: (reason: T) => void
	resolve?: (value?: T) => void
	verbose?: boolean
}

interface Spirit {
	id: string
	isTerminated?: boolean
	task: Task | null
	worker: Worker
}

type SpiritOutputCallback = (data: string, stream: 'stdout' | 'stderr') => void

interface CreatedSpiritWorker {
	id: string
	worker: Worker
	cleanup: () => void
}

export interface DisposableSpiritTask<T = unknown> {
	workerId: string
	promise: Promise<T>
	terminate: () => Promise<void>
}

let spiritWorkerIndex = 0

function nextSpiritId(index: number) {
	const suffix = String.fromCharCode(97 + (index % 26))
	return `${spiritWorkerIndex++}-${nameGenerator()}-${suffix}`
}

function createSpiritWorker(
	index: number,
	outputCallback?: SpiritOutputCallback
): CreatedSpiritWorker {
	const spiritId = nextSpiritId(index)
	const mode = Mode.get()

	const envData = Env.data() ?? {}
	const env = { ...envData }

	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined && (key.startsWith('ROBO_') || key.startsWith('DISCORD_') || key.startsWith('__ROBO_'))) {
			env[key] = value
		}
	}

	const workerOptions: WorkerOptions = {
		workerData: { env, mode, spiritId }
	}

	if (outputCallback) {
		workerOptions.stdout = true
		workerOptions.stderr = true
	}

	const worker = new Worker(path.join(__DIRNAME, '..', 'spirit.js'), workerOptions)

	if (outputCallback) {
		worker.stdout.on('data', (chunk: Buffer) => {
			try {
				outputCallback(chunk.toString(), 'stdout')
			} catch {
				// Best-effort only
			}
		})
		worker.stderr.on('data', (chunk: Buffer) => {
			try {
				outputCallback(chunk.toString(), 'stderr')
			} catch {
				// Best-effort only
			}
		})
	}

	return {
		id: spiritId,
		worker,
		cleanup: () => {
			if (outputCallback) {
				worker.stdout.removeAllListeners('data')
				worker.stderr.removeAllListeners('data')
			}
		}
	}
}

function createWorkerTask<T = unknown>(task: Task<T>): Task<T> {
	const workerTask: Task<T> = { ...task }
	delete workerTask.onExit
	delete workerTask.onRetry
	delete workerTask.resolve
	delete workerTask.reject
	return workerTask
}

export function createDisposableSpiritTask<T = unknown>(
	task: Task<T>,
	outputCallback?: SpiritOutputCallback
): DisposableSpiritTask<T> {
	const { id, worker, cleanup } = createSpiritWorker(0, outputCallback)
	let terminated = false

	const promise = new Promise<T>((resolve, reject) => {
		let settled = false
		let response: SpiritMessage | undefined

		const finalize = async (handler: () => void) => {
			if (settled || terminated) {
				return
			}
			settled = true
			cleanup()
			try {
				await worker.terminate()
			} catch {
				// Worker may have already exited
			}
			handler()
		}

		worker.once('message', async (message: SpiritMessage) => {
			logger.debug(`Disposable spirit (${composeColors(color.bold, color.cyan)(id)}) sent message:`, message)
			response = message
			if (message.error) {
				await finalize(() => reject(message.error))
				return
			}
			await finalize(() => resolve(message.payload as T))
		})

		worker.once('error', async (error) => {
			logger.error(error)
			await finalize(() => reject(error))
		})

		worker.once('exit', async (exitCode: number) => {
			logger.debug(`Disposable spirit (${composeColors(color.bold, color.cyan)(id)}) exited with code ${exitCode}`)

			if (settled) {
				return
			}

			await finalize(() => {
				if (response?.error) {
					reject(response.error)
				} else if (exitCode === 0 && response) {
					resolve(response.payload as T)
				} else {
					reject(new Error(`Spirit exited with error code ${exitCode}`))
				}
			})
		})

		const workerTask = createWorkerTask(task)
		logger.debug(`Sending task to disposable spirit ${composeColors(color.bold, color.cyan)(id)}:`, workerTask)
		worker.postMessage(workerTask)
	})

	return {
		workerId: id,
		promise,
		terminate: async () => {
			if (terminated) {
				return
			}
			terminated = true
			cleanup()
			try {
				await worker.terminate()
			} catch {
				// Worker may have already exited
			}
		}
	}
}

export async function runDisposableSpiritTask<T = unknown>(
	task: Task<T>,
	outputCallback?: SpiritOutputCallback
): Promise<T> {
	return createDisposableSpiritTask(task, outputCallback).promise
}

export class Spirits {
	private spirits: Record<string, Spirit> = {}
	private taskQueue: Task[] = []
	private isShuttingDown = false

	// There are always a limited number of spirits running at once
	private activeSpirits: Spirit[] = []
	private nextActiveIndex = 0

	private outputCallback?: (data: string, stream: 'stdout' | 'stderr') => void

	constructor(public size = 3, outputCallback?: (data: string, stream: 'stdout' | 'stderr') => void) {
		this.outputCallback = outputCallback
		for (let i = 0; i < size; i++) {
			this.newSpirit()
		}
	}

	public newSpirit(oldSpirit?: Spirit) {
		const index = oldSpirit ? this.activeSpirits.indexOf(oldSpirit) : this.activeSpirits.length
		const { id: spiritId, worker, cleanup } = createSpiritWorker(index, this.outputCallback)
		const newSpirit: Spirit = { id: spiritId, task: null, worker }
		this.spirits[newSpirit.id] = newSpirit

		if (oldSpirit) {
			delete this.spirits[oldSpirit.id]
		}

		worker.on('message', (message: SpiritMessage) => {
			const spirit = this.spirits[newSpirit.id]
			if (!spirit) return
			logger.debug(`Spirit (${composeColors(color.bold, color.cyan)(spirit.id)}) sent message:`, message)

			if (message.error) {
				spirit.task?.reject(message.error)
			}

			if (message.payload === 'exit') {
				if (!message.error) {
					spirit.task?.resolve(spirit.id)
				}
				spirit.isTerminated = true
				this.newSpirit(spirit)
				this.tryNextTask()
			} else if (message.payload === 'ok') {
				if (!message.error) {
					spirit.task?.resolve(spirit.id)
				}
			}
		})

		worker.on('exit', async (exitCode: number) => {
			logger.debug(`Spirit (${composeColors(color.bold, color.cyan)(spiritId)}) exited with code ${exitCode}`)

			cleanup()

			// No need to handle this if the spirit is already terminated elsewhere
			const spirit = this.spirits[newSpirit.id]
			if (!spirit || spirit.isTerminated) {
				return
			}

			// Delegate exit callback and check if we should retry
			const retry = spirit.task?.onExit?.(exitCode)
			spirit.isTerminated = true

			// Don't create new spirits or retry tasks during shutdown
			if (this.isShuttingDown) {
				if (exitCode === 0) {
					spirit.task?.resolve(spirit.id)
				} else {
					spirit.task?.reject(new Error(`Spirit exited with error code ${exitCode}`))
				}
				return
			}

			if (retry) {
				this.newSpirit(spirit)
				const value = await this.newTask(spirit.task)
				spirit.task?.onRetry?.(value)
				return
			}

			if (exitCode === 0) {
				spirit.task?.resolve(spirit.id)
			} else {
				spirit.task?.reject(new Error(`Spirit exited with error code ${exitCode}`))
			}

			this.newSpirit(spirit)
			this.tryNextTask()
		})

		worker.on('error', async (err) => {
			logger.error(err)

			cleanup()

			const spirit = this.spirits[newSpirit.id]
			if (!spirit) return
			spirit.task?.reject(err)
			spirit.isTerminated = true

			// Don't create new spirits or retry tasks during shutdown
			if (this.isShuttingDown) {
				return
			}

			// Delegate exit callback and check if we should retry
			const retry = spirit.task?.onExit?.(1)

			if (retry) {
				this.newSpirit(spirit)
				const value = await this.newTask(spirit.task)
				spirit.task?.onRetry?.(value)
				return
			}

			this.newSpirit(spirit)
			this.tryNextTask()
		})

		// If old spirit was passed, swap it out for the new one, otherwise push it to the end
		if (oldSpirit) {
			this.activeSpirits[index] = newSpirit
		} else {
			this.activeSpirits.push(newSpirit)
		}
	}

	public async newTask<T = unknown>(task: Task<T>) {
		logger.debug(`New spirit task:`, task)
		return new Promise<T>((resolve, reject) => {
			this.taskQueue.push({
				...task,
				onRetry: task.onRetry as () => void,
				resolve: resolve as () => void,
				reject
			})
			this.tryNextTask()
		})
	}

	public exec<T>(spiritId: string | null, message: SpiritMessage): Promise<T> {
		return new Promise((resolve, reject) => {
			// Lack of spirit id likely means a dependency spirit failed to start
			if (!spiritId) {
				logger.debug(`No spirit id provided, skipping exec message:`, message)
				resolve(null)
				return
			}

			logger.debug(`Executing message on spirit (${composeColors(color.bold, color.cyan)(spiritId)}):`, message)
			const spirit = this.get(spiritId)
			if (!spirit) {
				return reject(new Error(`Spirit ${spiritId} not found`))
			}

			if (spirit.isTerminated) {
				resolve(null)
				return
			}

			// Listen for similar messages from the spirit
			const callback = (response: SpiritMessage) => {
				if (response.event === message.event) {
					spirit.worker.off('message', callback)
					resolve(response.payload as T)
				}
			}

			spirit.worker.on('message', callback)
			spirit.worker.postMessage(message)
		})
	}

	public get(spiritId: string) {
		return this.spirits[spiritId]
	}

	public off(spiritId: string, callback: (message: SpiritMessage) => void | Promise<void>) {
		this.get(spiritId)?.worker?.off('message', callback)
	}

	public on(spiritId: string, callback: (message: SpiritMessage) => void | Promise<void>) {
		this.get(spiritId)?.worker?.on('message', callback)
	}

	public send(spiritId: string, message: SpiritMessage) {
		logger.debug(`Sending message to spirit ${composeColors(color.bold, color.cyan)(spiritId)}:`, message)
		this.get(spiritId).worker.postMessage(message)
	}

	private tryNextTask() {
		if (this.taskQueue.length <= 0) {
			logger.debug('No tasks left in queue')
			return
		}

		const spirit = this.activeSpirits[this.nextActiveIndex]
		if (spirit.task === null) {
			// Spirit is free, send it the next task!
			const task = this.taskQueue.shift()
			spirit.task = task

			const workerTask = createWorkerTask(task)
			logger.debug(`Sending task to spirit ${composeColors(color.bold, color.cyan)(spirit.id)}:`, workerTask)
			spirit.worker.postMessage(workerTask)
		}

		// Round-robin scheduling
		this.nextActiveIndex = (this.nextActiveIndex + 1) % this.size
	}

	public async stop(spiritId: string, force = false) {
		const spirit = this.get(spiritId)
		if (!spirit || spirit.isTerminated) {
			return
		}
		logger.debug(`Stopping spirit ${composeColors(color.bold, color.cyan)(spiritId)} (force: ${force})`)

		// If the worker isn't doing anything or if forced, terminate it immediately
		if (force || !spirit.task) {
			await spirit.worker.terminate()
			return
		}

		// If the worker is busy, send a "stop" message to it and let it terminate itself
		return new Promise<void>((resolve) => {
			// Always wait for the worker to actually exit before resolving
			// This ensures all logs are written before we continue
			spirit.worker.once('exit', () => {
				resolve()
				// Only create replacement spirits if not shutting down and not already replaced
				if (!this.isShuttingDown && !spirit.isTerminated) {
					this.newSpirit(spirit)
					this.tryNextTask()
				}
			})
			spirit.worker.on('message', (message: SpiritMessage) => {
				if (message.payload === 'exit') {
					spirit.task?.resolve()
					spirit.isTerminated = true
					// Don't resolve here - wait for the 'exit' event above
				}
			})
			spirit.worker.postMessage({ event: 'stop' })
		})
	}

	public async stopAll() {
		this.isShuttingDown = true
		const promises = Object.values(this.spirits).map((spirit) => this.stop(spirit.id))
		return Promise.all(promises)
	}
}
