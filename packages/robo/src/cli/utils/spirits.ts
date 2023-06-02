import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { __DIRNAME } from './utils.js'
import { logger } from '../../core/logger.js'
import { SpiritMessage } from 'src/types/index.js'

interface Task<T = unknown> {
	command: 'build' | 'start'
	verbose?: boolean
	resolve?: (value?: T) => void
	reject?: (reason: T) => void
}

interface Spirit {
	currentTask: Task | null
	id: number
	isTerminated?: boolean
	worker: Worker
}

export class Spirits {
	private spirits: Record<number, Spirit> = {}
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
		const worker = new Worker(path.join(__DIRNAME, '..', 'worker.js'))
		const newSpirit: Spirit = { currentTask: null, id: this.spiritIndex++, worker }
		this.spirits[newSpirit.id] = newSpirit

		worker.on('message', (message: SpiritMessage) => {
			const spirit = this.spirits[newSpirit.id]
			logger.debug(`Spirit (${spirit.id}) sent message:`, message)
			if (message.event === 'exit' || message.response === 'exit') {
				spirit.currentTask?.resolve()
				spirit.isTerminated = true
				worker.terminate()
				this.newSpirit(spirit)
				this.tryNextTask()
			} else if (message.response === 'ok') {
				spirit.currentTask?.resolve(spirit.id)
			}
		})

		worker.on('exit', (exitCode: number) => {
			const spirit = this.spirits[newSpirit.id]
			// No need to handle this if the spirit is already terminated elsewhere
			if (spirit.isTerminated) {
				return
			}

			logger.debug(`Spirit (${spirit.id}) exited with code ${exitCode}`, spirit)
			spirit.isTerminated = true
			if (exitCode === 0) {
				spirit.currentTask?.resolve()
			} else {
				spirit.currentTask?.reject(new Error(`Spirit exited with error code ${exitCode}`))
			}

			this.newSpirit(spirit)
			this.tryNextTask()
		})

		worker.on('error', (err) => {
			const spirit = this.spirits[newSpirit.id]
			spirit.currentTask?.reject(err)

			this.newSpirit(spirit)
			this.tryNextTask()
		})

		// If old spirit was passed, swap it out for the new one, otherwise push it to the end
		if (oldSpirit) {
			const index = this.activeSpirits.indexOf(oldSpirit)
			this.activeSpirits[index] = newSpirit
		} else {
			this.activeSpirits.push(newSpirit)
		}
	}

	public async newTask<T = unknown>(task: Task<T>) {
		logger.debug(`New spirit task:`, task)
		return new Promise<T>((resolve, reject) => {
			this.taskQueue.push({ ...task, resolve: resolve as () => void, reject })
			this.tryNextTask()
		})
	}

	public get(spiritId: number) {
		return this.spirits[spiritId]
	}

	public send(spiritId: number, message: SpiritMessage) {
		logger.debug(`Sending message to spirit ${spiritId}:`, message)
		this.get(spiritId).worker.postMessage(message)
	}

	private tryNextTask() {
		if (this.taskQueue.length <= 0) {
			logger.debug('No tasks left in queue')
			return
		}

		const spirit = this.activeSpirits[this.nextActiveIndex]
		if (spirit.currentTask === null) {
			// Spirit is free, send it the next task!
			const task = this.taskQueue.shift()
			spirit.currentTask = task

			// Strip functions before sending task to worker
			const workerTask: Task = { ...task, reject: undefined, resolve: undefined }
			logger.debug(`Sending task to spirit ${this.nextActiveIndex}:`, workerTask)
			spirit.worker.postMessage(workerTask)
		}

		// Round-robin scheduling
		this.nextActiveIndex = (this.nextActiveIndex + 1) % this.size
	}

	// New stop method to send shutdown signal to specific workers
	public async stop(spiritId: number, force?: boolean) {
		const spirit = this.get(spiritId)

		// If the worker isn't doing anything or if forced, terminate it immediately
		if (force || !spirit.currentTask) {
			spirit.worker.terminate()
			return Promise.resolve()
		}

		// If the worker is busy, send a "stop" message to it and let it terminate itself
		return new Promise<void>((resolve) => {
			spirit.worker.once('exit', resolve)
			spirit.worker.on('message', (message: SpiritMessage) => {
				if (message.response === 'exit') {
					spirit.currentTask?.resolve()
					spirit.worker.terminate()
					resolve()
					this.newSpirit(spirit)
					this.tryNextTask()
				}
			})
			spirit.worker.postMessage({ command: 'stop' })
		})
	}

	// New stopAll method to shutdown all workers
	public async stopAll() {
		for (let i = 0; i < this.size; i++) {
			await this.stop(i)
		}
	}
}
