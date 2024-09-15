import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { __DIRNAME } from './utils.js'
import { logger } from '../../core/logger.js'
import { SpiritMessage } from 'src/types/index.js'
import { nameGenerator } from './name-generator.js'
import { color, composeColors } from '../../core/color.js'
import { Mode } from '../../core/mode.js'

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

export class Spirits {
	private spirits: Record<string, Spirit> = {}
	private taskQueue: Task[] = []
	private spiritIndex = 0

	// There are always a limited number of spirits running at once
	private activeSpirits: Spirit[] = []
	private nextActiveIndex = 0

	constructor(public size = 3) {
		for (let i = 0; i < size; i++) {
			this.newSpirit()
		}
	}

	public newSpirit(oldSpirit?: Spirit) {
		const index = oldSpirit ? this.activeSpirits.indexOf(oldSpirit) : this.activeSpirits.length
		const spiritId = `${this.spiritIndex++}-${nameGenerator()}-${['a', 'b', 'c'][index]}`
		const mode = Mode.get()
		const worker = new Worker(path.join(__DIRNAME, '..', 'spirit.js'), {
			workerData: { mode, spiritId }
		})
		const newSpirit: Spirit = { id: spiritId, task: null, worker }
		this.spirits[newSpirit.id] = newSpirit

		worker.on('message', (message: SpiritMessage) => {
			const spirit = this.spirits[newSpirit.id]
			logger.debug(`Spirit (${composeColors(color.bold, color.cyan)(spirit.id)}) sent message:`, message)
			if (message.payload === 'exit') {
				spirit.task?.resolve(spirit.id)
				spirit.isTerminated = true
				this.newSpirit(spirit)
				this.tryNextTask()
			} else if (message.payload === 'ok') {
				spirit.task?.resolve(spirit.id)
			}
		})

		worker.on('exit', async (exitCode: number) => {
			logger.debug(`Spirit (${composeColors(color.bold, color.cyan)(spiritId)}) exited with code ${exitCode}`)

			// No need to handle this if the spirit is already terminated elsewhere
			const spirit = this.spirits[newSpirit.id]
			if (spirit.isTerminated) {
				return
			}

			// Delegate exit callback and check if we should retry
			const retry = spirit.task?.onExit?.(exitCode)
			spirit.isTerminated = true

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
			const spirit = this.spirits[newSpirit.id]
			spirit.task?.reject(err)
			spirit.isTerminated = true

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

			// Strip functions before sending task to worker
			const workerTask: Task = { ...task }
			delete workerTask.onExit
			delete workerTask.onRetry
			delete workerTask.resolve
			delete workerTask.reject
			logger.debug(`Sending task to spirit ${composeColors(color.bold, color.cyan)(spirit.id)}:`, workerTask)
			spirit.worker.postMessage(workerTask)
		}

		// Round-robin scheduling
		this.nextActiveIndex = (this.nextActiveIndex + 1) % this.size
	}

	public async stop(spiritId: string, force = false) {
		const spirit = this.get(spiritId)
		if (spirit.isTerminated) {
			return Promise.resolve()
		}
		logger.debug(`Stopping spirit ${composeColors(color.bold, color.cyan)(spiritId)} (force: ${force})`)

		// If the worker isn't doing anything or if forced, terminate it immediately
		if (force || !spirit.task) {
			spirit.worker.terminate()
			return Promise.resolve()
		}

		// If the worker is busy, send a "stop" message to it and let it terminate itself
		return new Promise<void>((resolve) => {
			spirit.worker.once('exit', resolve)
			spirit.worker.on('message', (message: SpiritMessage) => {
				if (message.payload === 'exit') {
					spirit.task?.resolve()
					spirit.isTerminated = true
					resolve()
					this.newSpirit(spirit)
					this.tryNextTask()
				}
			})
			spirit.worker.postMessage({ event: 'stop' })
		})
	}

	public async stopAll() {
		const promises = Object.values(this.spirits).map((spirit) => this.stop(spirit.id))
		return Promise.all(promises)
	}
}
