import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { __DIRNAME } from './utils.js'
import { logger } from '../../core/logger.js'
import { SpiritMessage } from 'src/types/index.js'
import { nameGenerator } from './name-generator.js'

interface Task<T = unknown> {
	command: 'build' | 'start'
	verbose?: boolean
	resolve?: (value?: T) => void
	reject?: (reason: T) => void
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
		const worker = new Worker(path.join(__DIRNAME, '..', 'worker.js'), {
			workerData: { spiritId }
		})
		const newSpirit: Spirit = { id: spiritId, task: null, worker }
		this.spirits[newSpirit.id] = newSpirit

		worker.on('message', (message: SpiritMessage) => {
			const spirit = this.spirits[newSpirit.id]
			logger.debug(`Spirit (${spirit.id}) sent message:`, message)
			if (message.event === 'exit' || message.response === 'exit') {
				spirit.task?.resolve()
				spirit.isTerminated = true
				this.newSpirit(spirit)
				this.tryNextTask()
			} else if (message.response === 'ok') {
				spirit.task?.resolve(spirit.id)
			}
		})

		worker.on('exit', (exitCode: number) => {
			logger.debug(`Spirit (${spiritId}) exited with code ${exitCode}`)

			// No need to handle this if the spirit is already terminated elsewhere
			const spirit = this.spirits[newSpirit.id]
			if (spirit.isTerminated) {
				return
			}

			spirit.isTerminated = true
			if (exitCode === 0) {
				spirit.task?.resolve()
			} else {
				spirit.task?.reject(new Error(`Spirit exited with error code ${exitCode}`))
			}

			this.newSpirit(spirit)
			this.tryNextTask()
		})

		worker.on('error', (err) => {
			const spirit = this.spirits[newSpirit.id]
			spirit.task?.reject(err)

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
			this.taskQueue.push({ ...task, resolve: resolve as () => void, reject })
			this.tryNextTask()
		})
	}

	public get(spiritId: string) {
		return this.spirits[spiritId]
	}

	public send(spiritId: string, message: SpiritMessage) {
		logger.debug(`Sending message to spirit ${spiritId}:`, message)
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
			const workerTask: Task = { ...task, reject: undefined, resolve: undefined }
			logger.debug(`Sending task to spirit ${this.nextActiveIndex}:`, workerTask)
			spirit.worker.postMessage(workerTask)
		}

		// Round-robin scheduling
		this.nextActiveIndex = (this.nextActiveIndex + 1) % this.size
	}

	// New stop method to send shutdown signal to specific workers
	public async stop(spiritId: string, force?: boolean) {
		const spirit = this.get(spiritId)
		logger.debug(`Stopping spirit ${spiritId} (force: ${force})`)

		// If the worker isn't doing anything or if forced, terminate it immediately
		if (force || !spirit.task) {
			spirit.worker.terminate()
			return Promise.resolve()
		}

		// If the worker is busy, send a "stop" message to it and let it terminate itself
		return new Promise<void>((resolve) => {
			spirit.worker.once('exit', resolve)
			spirit.worker.on('message', (message: SpiritMessage) => {
				if (message.response === 'exit') {
					spirit.task?.resolve()
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
		const promises = Object.values(this.spirits).map((spirit) => this.stop(spirit.id))
		return Promise.all(promises)
	}
}
