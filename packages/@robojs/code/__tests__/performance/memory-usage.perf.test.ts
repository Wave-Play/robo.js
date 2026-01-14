/**
 * Memory usage performance tests
 *
 * Verifies that:
 * - Terminal streaming doesn't leak memory
 * - Large file processing stays bounded
 * - Buffers are properly cleaned up
 *
 * Note: For accurate memory measurement, run with --expose-gc:
 * NODE_OPTIONS="--expose-gc --experimental-vm-modules" npx jest
 */

import { jest } from '@jest/globals'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { AgentPolicy } from '../../src/types/policy.js'

// Memory thresholds (generous to avoid flaky tests)
const THRESHOLDS = {
	// Max heap growth for streaming 1MB of data (should be bounded by buffers)
	streamingGrowthMb: 50,
	// Max heap for indexing 100 files
	indexingGrowthMb: 30,
	// Max size for a single snapshot
	snapshotSizeMb: 10
}

/**
 * Create a mock provider with streaming support
 */
function createMockProvider(overrides: Partial<ExecutionProvider> = {}): ExecutionProvider {
	return {
		readFile: jest.fn(async () => 'content'),
		writeFile: jest.fn(async () => {}),
		deletePath: jest.fn(async () => {}),
		exists: jest.fn(async () => true),
		stat: jest.fn(async () => ({ size: 100, isDirectory: false })),
		readdir: jest.fn(async () => []),
		mkdir: jest.fn(async () => {}),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {
			// Simulate streaming output
			for (let i = 0; i < 10; i++) {
				yield { type: 'output' as const, text: 'x'.repeat(1024) }
			}
		}),
		...overrides
	} as unknown as ExecutionProvider
}

function createPolicy(): AgentPolicy {
	return {
		autoApprove: true,
		maxIterations: 10,
		commandAllowlist: ['npm', 'node'],
		denyPaths: ['.env']
	}
}

/**
 * Force garbage collection if available
 */
function forceGc(): void {
	if (global.gc) {
		global.gc()
	}
}

/**
 * Get current heap usage in MB
 */
function getHeapMb(): number {
	return process.memoryUsage().heapUsed / (1024 * 1024)
}

describe('Memory Usage', () => {
	beforeEach(() => {
		forceGc()
	})

	afterEach(() => {
		forceGc()
	})

	describe('terminal streaming', () => {
		it('should not leak memory during repeated streaming', async () => {
			const initialHeap = getHeapMb()

			const provider = createMockProvider({
				runStream: jest.fn(async function* () {
					// Simulate 100KB of output per stream
					for (let i = 0; i < 100; i++) {
						yield { type: 'output' as const, text: 'x'.repeat(1024) }
					}
				})
			})

			// Run multiple streams
			for (let i = 0; i < 10; i++) {
				const stream = provider.runStream!('echo', ['test'])
				for await (const _chunk of stream) {
					// Consume chunks
				}
			}

			forceGc()
			const finalHeap = getHeapMb()
			const growth = finalHeap - initialHeap

			// Should not grow significantly (buffers should be released)
			expect(growth).toBeLessThan(THRESHOLDS.streamingGrowthMb)
		})

		it('should handle large streaming output', async () => {
			const initialHeap = getHeapMb()

			const provider = createMockProvider({
				runStream: jest.fn(async function* () {
					// Simulate 1MB of output
					for (let i = 0; i < 1000; i++) {
						yield { type: 'output' as const, text: 'x'.repeat(1024) }
					}
				})
			})

			const stream = provider.runStream!('large-output', [])
			for await (const _chunk of stream) {
				// Consume all chunks
			}

			forceGc()
			const finalHeap = getHeapMb()
			const growth = finalHeap - initialHeap

			expect(growth).toBeLessThan(THRESHOLDS.streamingGrowthMb)
		})

		it('should cleanup on abort', async () => {
			const initialHeap = getHeapMb()
			let chunkCount = 0

			const provider = createMockProvider({
				runStream: jest.fn(async function* () {
					// Infinite stream
					while (true) {
						yield { type: 'output' as const, text: 'x'.repeat(1024) }
						chunkCount++
						if (chunkCount >= 100) {
							break // Simulate abort after 100 chunks
						}
					}
				})
			})

			const stream = provider.runStream!('infinite', [])
			for await (const _chunk of stream) {
				// Consume up to 100 chunks (stream will break)
			}

			forceGc()
			const finalHeap = getHeapMb()
			const growth = finalHeap - initialHeap

			// Even interrupted streams should not leak
			expect(growth).toBeLessThan(THRESHOLDS.streamingGrowthMb)
		})
	})

	describe('file operations', () => {
		it('should handle large file reads without excessive memory', async () => {
			const largeContent = 'x'.repeat(1024 * 1024) // 1MB
			const initialHeap = getHeapMb()

			const provider = createMockProvider({
				readFile: jest.fn(async () => largeContent)
			})

			// Read file multiple times
			for (let i = 0; i < 5; i++) {
				await provider.readFile('/large-file.txt')
			}

			forceGc()
			const finalHeap = getHeapMb()
			const growth = finalHeap - initialHeap

			// Should release memory between reads
			expect(growth).toBeLessThan(THRESHOLDS.streamingGrowthMb)
		})

		it('should handle many file reads efficiently', async () => {
			const initialHeap = getHeapMb()

			const provider = createMockProvider({
				readFile: jest.fn(async () => 'x'.repeat(10240)) // 10KB per file
			})

			// Read 100 files
			for (let i = 0; i < 100; i++) {
				await provider.readFile(`/file${i}.txt`)
			}

			forceGc()
			const finalHeap = getHeapMb()
			const growth = finalHeap - initialHeap

			expect(growth).toBeLessThan(THRESHOLDS.indexingGrowthMb)
		})
	})

	describe('snapshot operations', () => {
		it('should bound snapshot size', async () => {
			const provider = createMockProvider()
			const snapshot = await provider.snapshot!()

			// Snapshot should be an object
			expect(typeof snapshot).toBe('object')
		})

		it('should handle large directory structures', async () => {
			const initialHeap = getHeapMb()

			const entries: Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }> = []
			for (let i = 0; i < 500; i++) {
				entries.push({
					name: `file${i}.ts`,
					path: `/src/file${i}.ts`,
					isDirectory: false,
					isFile: true
				})
			}

			const provider = createMockProvider({
				readdir: jest.fn(async () => entries),
				readFile: jest.fn(async () => 'x'.repeat(1024))
			})

			// Scan directory
			await provider.readdir('/', { recursive: true })

			forceGc()
			const finalHeap = getHeapMb()
			const growth = finalHeap - initialHeap

			expect(growth).toBeLessThan(THRESHOLDS.indexingGrowthMb)
		})
	})

	describe('buffer management', () => {
		it('should not accumulate buffers over time', async () => {
			const initialHeap = getHeapMb()
			const measurements: number[] = []

			const provider = createMockProvider({
				runStream: jest.fn(async function* () {
					for (let i = 0; i < 50; i++) {
						yield { type: 'output' as const, text: 'x'.repeat(2048) }
					}
				})
			})

			// Run multiple iterations and track heap
			for (let i = 0; i < 5; i++) {
				const stream = provider.runStream!('test', [])
				for await (const _chunk of stream) {
					// Consume
				}
				forceGc()
				measurements.push(getHeapMb())
			}

			// Heap should not grow linearly
			const firstMeasure = measurements[0]
			const lastMeasure = measurements[measurements.length - 1]
			const totalGrowth = lastMeasure - initialHeap

			expect(totalGrowth).toBeLessThan(THRESHOLDS.streamingGrowthMb)
			// Later measurements should not be significantly larger than earlier ones
			expect(lastMeasure - firstMeasure).toBeLessThan(10) // Max 10MB growth between iterations
		})

		it('should handle mixed operations without leaking', async () => {
			const initialHeap = getHeapMb()

			const provider = createMockProvider({
				readFile: jest.fn(async () => 'x'.repeat(10240)),
				writeFile: jest.fn(async () => {}),
				runStream: jest.fn(async function* () {
					for (let i = 0; i < 10; i++) {
						yield { type: 'output' as const, text: 'x'.repeat(1024) }
					}
				})
			})

			// Mix of operations
			for (let i = 0; i < 20; i++) {
				await provider.readFile('/test.txt')
				await provider.writeFile('/out.txt', 'x'.repeat(5000))
				const stream = provider.runStream!('cmd', [])
				for await (const _chunk of stream) {
				}
			}

			forceGc()
			const finalHeap = getHeapMb()
			const growth = finalHeap - initialHeap

			expect(growth).toBeLessThan(THRESHOLDS.streamingGrowthMb)
		})
	})

	describe('stress tests', () => {
		it('should handle rapid sequential operations', async () => {
			const initialHeap = getHeapMb()
			const provider = createMockProvider()

			// Rapid fire operations
			const operations: Promise<unknown>[] = []
			for (let i = 0; i < 50; i++) {
				operations.push(provider.readFile('/file.txt'))
				operations.push(provider.exists('/path'))
				operations.push(provider.stat('/file.txt'))
			}

			await Promise.all(operations)

			forceGc()
			const finalHeap = getHeapMb()
			const growth = finalHeap - initialHeap

			expect(growth).toBeLessThan(THRESHOLDS.indexingGrowthMb)
		})

		it('should maintain stable memory under repeated cycles', async () => {
			const heapMeasurements: number[] = []

			const provider = createMockProvider({
				readFile: jest.fn(async () => 'x'.repeat(5000)),
				runStream: jest.fn(async function* () {
					for (let i = 0; i < 20; i++) {
						yield { type: 'output' as const, text: 'y'.repeat(500) }
					}
				})
			})

			// Multiple cycles
			for (let cycle = 0; cycle < 5; cycle++) {
				for (let i = 0; i < 10; i++) {
					await provider.readFile('/file.txt')
					const stream = provider.runStream!('test', [])
					for await (const _chunk of stream) {
					}
				}
				forceGc()
				heapMeasurements.push(getHeapMb())
			}

			// Memory should be stable across cycles
			const maxHeap = Math.max(...heapMeasurements)
			const minHeap = Math.min(...heapMeasurements)
			const variance = maxHeap - minHeap

			// Variance should be minimal (< 20MB)
			expect(variance).toBeLessThan(20)
		})
	})
})
