import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { EventEmitter } from 'node:events'

const workers: MockWorker[] = []

class MockWorker extends EventEmitter {
	public stdout = new EventEmitter()
	public stderr = new EventEmitter()
	public terminate = jest.fn(async () => 0)
	public postMessage = jest.fn()

	constructor(
		public readonly filePath: string,
		public readonly options: unknown
	) {
		super()
		workers.push(this)
	}
}

const logger = {
	debug: jest.fn(),
	error: jest.fn()
}

jest.unstable_mockModule('node:worker_threads', () => ({
	Worker: MockWorker
}))

jest.unstable_mockModule('../../src/core/logger.js', () => ({
	logger
}))

jest.unstable_mockModule('../../src/core/color.js', () => ({
	color: {
		bold: (value: string) => value,
		cyan: (value: string) => value
	},
	composeColors: () => (value: string) => value
}))

jest.unstable_mockModule('../../src/cli/utils/utils.js', () => ({
	__DIRNAME: '/tmp'
}))

jest.unstable_mockModule('../../src/cli/utils/name-generator.js', () => ({
	nameGenerator: () => 'mock-spirit'
}))

jest.unstable_mockModule('../../src/core/mode.js', () => ({
	Mode: {
		get: () => 'development'
	}
}))

jest.unstable_mockModule('../../src/core/env.js', () => ({
	Env: {
		data: () => ({})
	}
}))

const { createDisposableSpiritTask, runDisposableSpiritTask } = await import('../../src/cli/utils/spirits.js')

describe('runDisposableSpiritTask', () => {
	beforeEach(() => {
		workers.length = 0
		jest.clearAllMocks()
	})

	afterEach(() => {
		workers.length = 0
	})

	it('resolves on worker success, forwards output, and terminates the worker', async () => {
		const output = jest.fn()
		const promise = runDisposableSpiritTask(
			{
				event: 'build',
				payload: { files: [], mode: 'development' }
			},
			output
		)

		const worker = workers[0]
		worker.stdout.emit('data', Buffer.from('stdout'))
		worker.stderr.emit('data', Buffer.from('stderr'))
		worker.emit('message', { event: 'build', payload: 'exit' })

		await expect(promise).resolves.toBe('exit')
		expect(worker.postMessage).toHaveBeenCalledWith({
			event: 'build',
			payload: { files: [], mode: 'development' }
		})
		expect(worker.terminate).toHaveBeenCalled()
		expect(output).toHaveBeenCalledWith('stdout', 'stdout')
		expect(output).toHaveBeenCalledWith('stderr', 'stderr')
	})

	it('rejects when the worker reports an error', async () => {
		const promise = runDisposableSpiritTask({
			event: 'build',
			payload: { files: [], mode: 'development' }
		})

		const worker = workers[0]
		worker.emit('message', { event: 'build', payload: 'exit', error: new Error('build failed') })

		await expect(promise).rejects.toThrow('build failed')
		expect(worker.terminate).toHaveBeenCalled()
	})

	it('exposes a cancellable disposable task handle', async () => {
		const task = createDisposableSpiritTask({
			event: 'build',
			payload: { files: [], mode: 'development' }
		})

		await task.terminate()

		expect(task.workerId).toContain('mock-spirit')
		expect(workers[0].terminate).toHaveBeenCalled()
	})
})
