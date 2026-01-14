/**
 * Integration tests for serialized tool execution
 *
 * Verifies that tools execute in correct FIFO order when serialized,
 * and that concurrent tool calls don't interfere with each other.
 */

import { jest } from '@jest/globals'
import { SerialExecutionQueue } from '../../src/tools/runtime/serializer.js'
import { fsReadTool } from '../../src/tools/fs/read.js'
import { fsWriteTool } from '../../src/tools/fs/write.js'
import { fsStatTool } from '../../src/tools/fs/stat.js'
import type { ToolContext } from '../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy } from '../../src/types/index.js'

/**
 * Create a provider that tracks operation timing
 */
function createTimingProvider(): {
	provider: ExecutionProvider
	files: Map<string, string>
	operations: Array<{ op: string; path: string; startTime: number; endTime: number }>
} {
	const files = new Map<string, string>()
	const operations: Array<{ op: string; path: string; startTime: number; endTime: number }> = []

	const provider: ExecutionProvider = {
		readFile: jest.fn(async (path: string) => {
			const startTime = Date.now()
			// Simulate some async work
			await delay(10)
			const endTime = Date.now()
			operations.push({ op: 'read', path, startTime, endTime })

			const content = files.get(path)
			if (!content) throw new Error(`File not found: ${path}`)
			return content
		}),

		writeFile: jest.fn(async (path: string, content: string) => {
			const startTime = Date.now()
			await delay(10)
			files.set(path, content)
			const endTime = Date.now()
			operations.push({ op: 'write', path, startTime, endTime })
		}),

		deletePath: jest.fn(async (path: string) => {
			const startTime = Date.now()
			await delay(5)
			files.delete(path)
			const endTime = Date.now()
			operations.push({ op: 'delete', path, startTime, endTime })
		}),

		exists: jest.fn(async (path: string) => {
			return files.has(path)
		}),

		stat: jest.fn(async (path: string) => {
			const startTime = Date.now()
			await delay(5)
			const content = files.get(path)
			const endTime = Date.now()
			operations.push({ op: 'stat', path, startTime, endTime })

			if (!content) throw new Error(`File not found: ${path}`)
			return { size: content.length, isDirectory: false }
		}),

		list: jest.fn(async () => []),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {})
	} as unknown as ExecutionProvider

	return { provider, files, operations }
}

function createContext(provider: ExecutionProvider): ToolContext {
	return {
		provider,
		policy: {
			autoApprove: true,
			maxIterations: 10,
			commandAllowlist: [],
			denyPaths: []
		},
		runId: 'serialization-test'
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('Serialization Integration: FIFO Order', () => {
	it('should execute queued operations in order', async () => {
		const queue = new SerialExecutionQueue()
		const { provider, files, operations } = createTimingProvider()
		const context = createContext(provider)

		// Pre-populate a file
		files.set('/file.txt', 'initial')

		// Queue multiple operations - they should execute in order
		const op1 = queue.enqueue(() => fsReadTool.execute({ path: '/file.txt' }, context))
		const op2 = queue.enqueue(() => fsWriteTool.execute({ path: '/file.txt', content: 'modified' }, context))
		const op3 = queue.enqueue(() => fsReadTool.execute({ path: '/file.txt' }, context))

		const results = await Promise.all([op1, op2, op3])

		// All operations should succeed
		expect(results[0].success).toBe(true)
		expect(results[1].success).toBe(true)
		expect(results[2].success).toBe(true)

		// First read should get 'initial'
		expect(results[0].data?.content).toBe('initial')

		// Third read should get 'modified' (after write)
		expect(results[2].data?.content).toBe('modified')

		// Verify operations executed in order (each starts after previous ends)
		for (let i = 1; i < operations.length; i++) {
			expect(operations[i].startTime).toBeGreaterThanOrEqual(operations[i - 1].endTime)
		}
	})

	it('should not interleave concurrent tool calls', async () => {
		const queue = new SerialExecutionQueue()
		const { provider, files, operations } = createTimingProvider()
		const context = createContext(provider)

		files.set('/a.txt', 'A')
		files.set('/b.txt', 'B')
		files.set('/c.txt', 'C')

		// Launch multiple reads "concurrently"
		const promises = [
			queue.enqueue(() => fsReadTool.execute({ path: '/a.txt' }, context)),
			queue.enqueue(() => fsReadTool.execute({ path: '/b.txt' }, context)),
			queue.enqueue(() => fsReadTool.execute({ path: '/c.txt' }, context))
		]

		const results = await Promise.all(promises)

		// All should succeed
		expect(results.map((r) => r.success)).toEqual([true, true, true])

		// No overlapping time ranges
		for (let i = 1; i < operations.length; i++) {
			// Each operation should start after the previous one ended
			expect(operations[i].startTime).toBeGreaterThanOrEqual(operations[i - 1].endTime)
		}
	})

	it('should maintain order with varying operation durations', async () => {
		const queue = new SerialExecutionQueue()
		const executionOrder: number[] = []

		// Tasks with varying durations
		const task1 = queue.enqueue(async () => {
			await delay(30)
			executionOrder.push(1)
			return 1
		})

		const task2 = queue.enqueue(async () => {
			await delay(10)
			executionOrder.push(2)
			return 2
		})

		const task3 = queue.enqueue(async () => {
			await delay(20)
			executionOrder.push(3)
			return 3
		})

		await Promise.all([task1, task2, task3])

		// Should execute in queue order, not completion time order
		expect(executionOrder).toEqual([1, 2, 3])
	})
})

describe('Serialization Integration: Error Handling', () => {
	it('should continue processing after a failed operation', async () => {
		const queue = new SerialExecutionQueue()
		const { provider, files } = createTimingProvider()
		const context = createContext(provider)

		files.set('/exists.txt', 'content')

		// First op fails (file doesn't exist)
		const op1 = queue.enqueue(() => fsReadTool.execute({ path: '/missing.txt' }, context))

		// Second op should still work
		const op2 = queue.enqueue(() => fsReadTool.execute({ path: '/exists.txt' }, context))

		const [result1, result2] = await Promise.all([op1, op2])

		expect(result1.success).toBe(false)
		expect(result2.success).toBe(true)
		expect(result2.data?.content).toBe('content')
	})

	it('should propagate errors correctly to callers', async () => {
		const queue = new SerialExecutionQueue()

		const errorOp = queue.enqueue(async () => {
			throw new Error('Intentional test error')
		})

		await expect(errorOp).rejects.toThrow('Intentional test error')

		// Queue should still be functional
		const successOp = queue.enqueue(async () => 'success')
		await expect(successOp).resolves.toBe('success')
	})

	it('should not block queue on rejection', async () => {
		const queue = new SerialExecutionQueue()
		const results: string[] = []

		const op1 = queue
			.enqueue(async () => {
				results.push('op1-start')
				throw new Error('op1 failed')
			})
			.catch(() => {
				results.push('op1-caught')
			})

		const op2 = queue.enqueue(async () => {
			results.push('op2-executed')
			return 'op2-done'
		})

		await op1
		const result2 = await op2

		expect(results).toContain('op1-start')
		expect(results).toContain('op1-caught')
		expect(results).toContain('op2-executed')
		expect(result2).toBe('op2-done')
	})
})

describe('Serialization Integration: Queue Statistics', () => {
	it('should track queue length correctly', async () => {
		const queue = new SerialExecutionQueue()

		expect(queue.getStats().queueLength).toBe(0)

		// Start a slow task
		const slow = queue.enqueue(() => delay(50))

		// Add more tasks while slow is running
		await delay(5) // Let slow task start
		const task2 = queue.enqueue(() => delay(10))
		const task3 = queue.enqueue(() => delay(10))

		// Should have 2 tasks waiting
		expect(queue.getStats().queueLength).toBe(2)
		expect(queue.getStats().isExecuting).toBe(true)

		await Promise.all([slow, task2, task3])

		expect(queue.getStats().queueLength).toBe(0)
		expect(queue.getStats().totalProcessed).toBe(3)
	})

	it('should report idle state correctly', async () => {
		const queue = new SerialExecutionQueue()

		expect(queue.isIdle()).toBe(true)

		const task = queue.enqueue(() => delay(20))
		expect(queue.isIdle()).toBe(false)

		await task
		expect(queue.isIdle()).toBe(true)
	})
})

describe('Serialization Integration: Real Tool Scenarios', () => {
	it('should handle read-modify-write pattern correctly', async () => {
		const queue = new SerialExecutionQueue()
		const { provider, files } = createTimingProvider()
		const context = createContext(provider)

		files.set('/counter.txt', '0')

		// Simulate multiple "increment" operations
		const increment = async () => {
			const readResult = await fsReadTool.execute({ path: '/counter.txt' }, context)
			const current = parseInt(readResult.data?.content ?? '0', 10)
			await fsWriteTool.execute({ path: '/counter.txt', content: String(current + 1) }, context)
		}

		// Queue 5 increments
		await queue.enqueue(increment)
		await queue.enqueue(increment)
		await queue.enqueue(increment)
		await queue.enqueue(increment)
		await queue.enqueue(increment)

		// Final value should be 5 (no race conditions due to serialization)
		const finalRead = await fsReadTool.execute({ path: '/counter.txt' }, context)
		expect(finalRead.data?.content).toBe('5')
	})

	it('should handle rapid sequential file operations', async () => {
		const queue = new SerialExecutionQueue()
		const { provider, files } = createTimingProvider()
		const context = createContext(provider)

		// Queue many rapid operations
		const operations = Array.from({ length: 20 }, (_, i) =>
			queue.enqueue(() => fsWriteTool.execute({ path: `/file${i}.txt`, content: `content${i}` }, context))
		)

		await Promise.all(operations)

		// All files should exist with correct content
		for (let i = 0; i < 20; i++) {
			expect(files.get(`/file${i}.txt`)).toBe(`content${i}`)
		}
	})

	it('should serialize stat-then-read pattern', async () => {
		const queue = new SerialExecutionQueue()
		const { provider, files, operations } = createTimingProvider()
		const context = createContext(provider)

		const largeContent = 'x'.repeat(10000)
		files.set('/large.txt', largeContent)

		// Queue stat followed by conditional read
		const checkAndRead = queue.enqueue(async () => {
			const statResult = await fsStatTool.execute({ path: '/large.txt' }, context)
			if (statResult.success && statResult.data!.size > 1000) {
				// Large file - just stat
				return { type: 'stat-only', size: statResult.data!.size }
			} else {
				// Small file - read it
				const readResult = await fsReadTool.execute({ path: '/large.txt' }, context)
				return { type: 'full-read', content: readResult.data?.content }
			}
		})

		const result = await checkAndRead
		expect(result).toEqual({ type: 'stat-only', size: 10000 })
	})
})

describe('Serialization Integration: Multiple Queues', () => {
	it('should maintain independent order per queue', async () => {
		const queue1 = new SerialExecutionQueue()
		const queue2 = new SerialExecutionQueue()

		const results1: number[] = []
		const results2: number[] = []

		// Queue1 tasks
		queue1.enqueue(async () => {
			await delay(30)
			results1.push(1)
		})
		queue1.enqueue(async () => {
			await delay(10)
			results1.push(2)
		})

		// Queue2 tasks (start at same time)
		queue2.enqueue(async () => {
			await delay(10)
			results2.push(1)
		})
		queue2.enqueue(async () => {
			await delay(30)
			results2.push(2)
		})

		// Wait for both queues
		await Promise.all([queue1.enqueue(async () => {}), queue2.enqueue(async () => {})])

		// Each queue should maintain FIFO order
		expect(results1).toEqual([1, 2])
		expect(results2).toEqual([1, 2])
	})
})
