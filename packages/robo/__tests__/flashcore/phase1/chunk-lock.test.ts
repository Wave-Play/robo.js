/**
 * Flashcore v1 (spec rev 4.3) Phase 1 Tests - Chunk Lock
 *
 * Tests mutual exclusion, no deadlocks, proper queue handling.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'
import { AsyncMutex, ChunkLockManager } from '../../../src/flashcore/model/locks.js'

describe('Chunk Lock', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('AsyncMutex', () => {
		it('should acquire and release lock', async () => {
			const mutex = new AsyncMutex()

			await mutex.acquire()
			expect(mutex.isLocked()).toBe(true)

			mutex.release()
			expect(mutex.isLocked()).toBe(false)
		})

		it('should queue concurrent acquisitions', async () => {
			const mutex = new AsyncMutex()
			const order: number[] = []

			// First acquire
			await mutex.acquire()
			order.push(1)

			// These should queue
			const p2 = mutex.acquire().then(() => {
				order.push(2)
				mutex.release()
			})
			const p3 = mutex.acquire().then(() => {
				order.push(3)
				mutex.release()
			})

			// Release first lock
			mutex.release()

			// Wait for all to complete
			await Promise.all([p2, p3])

			expect(order).toEqual([1, 2, 3])
		})

		it('should execute withLock in order', async () => {
			const mutex = new AsyncMutex()
			const results: number[] = []

			const tasks = Array.from({ length: 10 }, (_, i) =>
				mutex.withLock(async () => {
					await new Promise(resolve => setTimeout(resolve, 5))
					results.push(i)
				})
			)

			await Promise.all(tasks)

			// Should execute in order
			expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
		})

		it('should release lock on error', async () => {
			const mutex = new AsyncMutex()

			try {
				await mutex.withLock(async () => {
					throw new Error('Test error')
				})
			} catch {
				// Expected
			}

			// Lock should be released
			expect(mutex.isLocked()).toBe(false)

			// Should be able to acquire again
			await mutex.acquire()
			expect(mutex.isLocked()).toBe(true)
			mutex.release()
		})

		it('should prevent deadlocks with multiple releases', async () => {
			const mutex = new AsyncMutex()

			await mutex.acquire()
			mutex.release()
			mutex.release() // Extra release should be safe

			// Should still work
			await mutex.acquire()
			expect(mutex.isLocked()).toBe(true)
			mutex.release()
		})
	})

	describe('ChunkLockManager', () => {
		it('should manage locks per chunk', async () => {
			const manager = new ChunkLockManager()
			const results: string[] = []

			const tasks = [
				manager.withChunkLock('model1', 0, async () => {
					await new Promise(resolve => setTimeout(resolve, 10))
					results.push('model1:chunk0')
				}),
				manager.withChunkLock('model1', 1, async () => {
					results.push('model1:chunk1')
				}),
				manager.withChunkLock('model2', 0, async () => {
					results.push('model2:chunk0')
				})
			]

			await Promise.all(tasks)

			// All should complete (different locks don't block each other)
			expect(results).toContain('model1:chunk0')
			expect(results).toContain('model1:chunk1')
			expect(results).toContain('model2:chunk0')
		})

		it('should serialize access to same chunk', async () => {
			const manager = new ChunkLockManager()
			const order: number[] = []

			const tasks = Array.from({ length: 5 }, (_, i) =>
				manager.withChunkLock('model', 0, async () => {
					await new Promise(resolve => setTimeout(resolve, 5))
					order.push(i)
				})
			)

			await Promise.all(tasks)

			// Should execute in order
			expect(order).toEqual([0, 1, 2, 3, 4])
		})

		it('should allow parallel access to different chunks', async () => {
			const manager = new ChunkLockManager()
			let maxConcurrent = 0
			let current = 0

			const tasks = Array.from({ length: 10 }, (_, i) =>
				manager.withChunkLock('model', i % 3, async () => {
					current++
					maxConcurrent = Math.max(maxConcurrent, current)
					await new Promise(resolve => setTimeout(resolve, 20))
					current--
				})
			)

			await Promise.all(tasks)

			// Should have some parallelism (up to 3 chunks)
			expect(maxConcurrent).toBeGreaterThan(1)
			expect(maxConcurrent).toBeLessThanOrEqual(3)
		})
	})

	describe('Chunk Lock Integration', () => {
		it('should prevent lost updates on same record', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; counter: number }>('User', {
				id: f.id(),
				counter: f.number().default(0)
			})

			// Cast to allow omitting counter which has default
			await (User.create as (data: { id: string }) => Promise<{ id: string; counter: number }>)({ id: 'user-1' })

			// Multiple updates to same record
			const updates = Array.from({ length: 20 }, async (_, i) => {
				return User.update({
					where: { id: 'user-1' },
					data: { counter: i }
				})
			})

			await Promise.all(updates)

			// Record should exist with some value
			const user = await User.findUnique({ where: { id: 'user-1' } })
			expect(user).not.toBeNull()
			expect(typeof user?.counter).toBe('number')
		})

		it('should prevent data corruption on concurrent chunk writes', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create records that will likely be in same chunk
			const creates = Array.from({ length: 50 }, (_, i) =>
				User.create({ id: `user-${i}`, name: `Name ${i}` })
			)

			await Promise.all(creates)

			// Verify all records are intact
			for (let i = 0; i < 50; i++) {
				const user = await User.findUnique({ where: { id: `user-${i}` } })
				expect(user?.name).toBe(`Name ${i}`)
			}
		})

		it('should handle rapid create-delete cycles', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Rapid create and delete
			const operations = Array.from({ length: 30 }, async (_, i) => {
				const id = `user-${i}`
				await User.create({ id, name: `Name ${i}` })
				if (i % 2 === 0) {
					await User.delete({ where: { id } })
				}
			})

			await Promise.all(operations)

			// Even-numbered users should be deleted
			for (let i = 0; i < 30; i++) {
				const user = await User.findUnique({ where: { id: `user-${i}` } })
				if (i % 2 === 0) {
					expect(user).toBeNull()
				} else {
					expect(user?.name).toBe(`Name ${i}`)
				}
			}
		})

		it('should not deadlock with nested operations', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create followed by immediate read (nested locking scenario)
			const operations = Array.from({ length: 20 }, async (_, i) => {
				const created = await User.create({ name: `User ${i}` })
				const found = await User.findUnique({ where: { id: created.id } })
				return found
			})

			const results = await Promise.all(operations)

			expect(results).toHaveLength(20)
			results.forEach((r, i) => {
				expect(r?.name).toBe(`User ${i}`)
			})
		})
	})

	describe('Error Recovery', () => {
		it('should recover from failed chunk operations', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create a record
			await User.create({ id: 'user-1', name: 'Alice' })

			// Try to create duplicate (will fail)
			try {
				await User.create({ id: 'user-1', name: 'Bob' })
			} catch {
				// Expected
			}

			// Original record should still be intact
			const user = await User.findUnique({ where: { id: 'user-1' } })
			expect(user?.name).toBe('Alice')

			// Should still be able to create new records
			await User.create({ id: 'user-2', name: 'Charlie' })
			const user2 = await User.findUnique({ where: { id: 'user-2' } })
			expect(user2?.name).toBe('Charlie')
		})

		it('should not leave orphaned locks after errors', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Multiple failing operations
			const failingOps = Array.from({ length: 5 }, () =>
				User.create({ id: 'same-id', name: 'Test' }).catch((): null => null)
			)

			await Promise.all(failingOps)

			// Should still be able to do normal operations
			const creates = Array.from({ length: 10 }, (_, i) =>
				User.create({ id: `user-${i}`, name: `User ${i}` })
			)

			const results = await Promise.all(creates)
			expect(results).toHaveLength(10)
		})
	})
})
