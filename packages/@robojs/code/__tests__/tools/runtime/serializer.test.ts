/**
 * Unit tests for serial execution queue
 */

import { SerialExecutionQueue, createSerialQueue } from '../../../src/tools/runtime/serializer.js'

describe('SerialExecutionQueue', () => {
	let queue: SerialExecutionQueue

	beforeEach(() => {
		queue = new SerialExecutionQueue()
	})

	describe('basic execution', () => {
		it('should execute tasks in FIFO order', async () => {
			const results: number[] = []

			const task1 = queue.enqueue(async () => {
				await delay(20)
				results.push(1)
				return 1
			})

			const task2 = queue.enqueue(async () => {
				await delay(10)
				results.push(2)
				return 2
			})

			const task3 = queue.enqueue(async () => {
				results.push(3)
				return 3
			})

			await Promise.all([task1, task2, task3])

			// Even though task3 has no delay, it should execute last
			expect(results).toEqual([1, 2, 3])
		})

		it('should execute one task at a time', async () => {
			let concurrentCount = 0
			let maxConcurrent = 0

			const createTask = (id: number) => async () => {
				concurrentCount++
				maxConcurrent = Math.max(maxConcurrent, concurrentCount)
				await delay(10)
				concurrentCount--
				return id
			}

			const promises = [
				queue.enqueue(createTask(1)),
				queue.enqueue(createTask(2)),
				queue.enqueue(createTask(3)),
				queue.enqueue(createTask(4)),
				queue.enqueue(createTask(5))
			]

			await Promise.all(promises)

			// Only one task should run at a time
			expect(maxConcurrent).toBe(1)
		})

		it('should return correct result for each task', async () => {
			const results = await Promise.all([
				queue.enqueue(async () => 'first'),
				queue.enqueue(async () => 'second'),
				queue.enqueue(async () => 'third')
			])

			expect(results).toEqual(['first', 'second', 'third'])
		})
	})

	describe('error handling', () => {
		it('should propagate errors correctly', async () => {
			const error = new Error('Test error')

			await expect(
				queue.enqueue(async () => {
					throw error
				})
			).rejects.toThrow('Test error')
		})

		it('should continue processing after a failed task', async () => {
			const results: string[] = []

			const task1 = queue
				.enqueue(async () => {
					results.push('task1-start')
					throw new Error('task1 failed')
				})
				.catch(() => {
					results.push('task1-caught')
				})

			const task2 = queue.enqueue(async () => {
				results.push('task2-executed')
				return 'success'
			})

			await task1
			const result = await task2

			// Queue should continue processing - all events should occur
			expect(results).toContain('task1-start')
			expect(results).toContain('task1-caught')
			expect(results).toContain('task2-executed')
			expect(result).toBe('success')
		})

		it('should not block queue on rejection', async () => {
			const rejectedTask = queue.enqueue(async () => {
				throw new Error('Rejected')
			})

			const successTask = queue.enqueue(async () => 'success')

			await expect(rejectedTask).rejects.toThrow('Rejected')
			await expect(successTask).resolves.toBe('success')
		})
	})

	describe('queue state', () => {
		it('should report correct queue stats', async () => {
			expect(queue.getStats().queueLength).toBe(0)

			const task1 = queue.enqueue(() => delay(50))
			// First task starts executing immediately
			expect(queue.getStats().isExecuting).toBe(true)

			const task2 = queue.enqueue(() => delay(50))
			expect(queue.getStats().queueLength).toBe(1)

			const task3 = queue.enqueue(() => delay(50))
			expect(queue.getStats().queueLength).toBe(2)

			await Promise.all([task1, task2, task3])
			expect(queue.getStats().queueLength).toBe(0)
			expect(queue.getStats().totalProcessed).toBe(3)
		})

		it('should report idle state correctly', async () => {
			expect(queue.isIdle()).toBe(true)

			const task = queue.enqueue(() => delay(20))
			expect(queue.isIdle()).toBe(false)

			await task
			expect(queue.isIdle()).toBe(true)
		})
	})

	describe('concurrency with multiple tasks', () => {
		it('should handle rapid sequential enqueueing', async () => {
			const results: number[] = []

			// Enqueue many tasks rapidly
			const promises = Array.from({ length: 100 }, (_, i) =>
				queue.enqueue(async () => {
					results.push(i)
					return i
				})
			)

			await Promise.all(promises)

			// All tasks should execute in order
			expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i))
		})

		it('should maintain order when tasks have varying durations', async () => {
			const executionOrder: number[] = []
			const delays = [30, 10, 50, 5, 20]

			const promises = delays.map((d, i) =>
				queue.enqueue(async () => {
					await delay(d)
					executionOrder.push(i)
					return i
				})
			)

			await Promise.all(promises)

			// Should execute in enqueue order, not completion time
			expect(executionOrder).toEqual([0, 1, 2, 3, 4])
		})
	})

	describe('async/await behavior', () => {
		it('should properly await async functions', async () => {
			let completed = false

			await queue.enqueue(async () => {
				await delay(20)
				completed = true
			})

			expect(completed).toBe(true)
		})

		it('should handle nested async operations', async () => {
			const result = await queue.enqueue(async () => {
				const inner = await Promise.resolve('inner')
				await delay(10)
				return `outer-${inner}`
			})

			expect(result).toBe('outer-inner')
		})
	})
})

describe('createSerialQueue', () => {
	it('should create a new queue instance', () => {
		const queue1 = createSerialQueue()
		const queue2 = createSerialQueue()

		expect(queue1).toBeInstanceOf(SerialExecutionQueue)
		expect(queue2).toBeInstanceOf(SerialExecutionQueue)
		expect(queue1).not.toBe(queue2)
	})
})

// Helper function
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
