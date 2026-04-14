/**
 * Phase 6: IndexPersistenceManager Tests
 *
 * Tests for index persistence with dirty tracking and flush strategies.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { IndexPersistenceManager } from '../../../src/flashcore/index/persistence.js'
import { CuckooFilter } from '../../../src/flashcore/index/filter.js'
import { SortedIndex } from '../../../src/flashcore/index/sorted.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'

describe('IndexPersistenceManager', () => {
	let adapter: MemoryAdapter
	let manager: IndexPersistenceManager

	beforeEach(() => {
		adapter = new MemoryAdapter()
		manager = new IndexPersistenceManager(adapter)
	})

	afterEach(async () => {
		await manager.shutdown()
	})

	describe('dirty tracking', () => {
		it('should track dirty filters', () => {
			const filter = new CuckooFilter()
			filter.add('item1')

			manager.registerFilter('User', filter)
			expect(manager.hasDirty()).toBe(false)

			manager.markFilterDirty('User')
			expect(manager.hasDirty()).toBe(true)
			expect(manager.getDirtyCount()).toBe(1)
		})

		it('should track dirty sorted indexes', () => {
			const index = new SortedIndex('createdAt')
			index.insert(Date.now(), 'id1')

			manager.registerSortedIndex('User', 'createdAt', index)
			expect(manager.hasDirty()).toBe(false)

			manager.markIndexDirty('User', 'createdAt')
			expect(manager.hasDirty()).toBe(true)
			expect(manager.getDirtyCount()).toBe(1)
		})

		it('should track multiple dirty entries', () => {
			const filter = new CuckooFilter()
			const index1 = new SortedIndex('createdAt')
			const index2 = new SortedIndex('score')

			manager.registerFilter('User', filter)
			manager.registerSortedIndex('User', 'createdAt', index1)
			manager.registerSortedIndex('User', 'score', index2)

			manager.markFilterDirty('User')
			manager.markIndexDirty('User', 'createdAt')
			manager.markIndexDirty('User', 'score')

			expect(manager.getDirtyCount()).toBe(3)
		})

		it('should deduplicate dirty marks for same entry', () => {
			const filter = new CuckooFilter()
			manager.registerFilter('User', filter)

			manager.markFilterDirty('User')
			manager.markFilterDirty('User')
			manager.markFilterDirty('User')

			expect(manager.getDirtyCount()).toBe(1)
		})
	})

	describe('flush operations', () => {
		it('should flush dirty filters to storage', async () => {
			const filter = new CuckooFilter()
			filter.add('item1')
			filter.add('item2')

			manager.registerFilter('User', filter)
			manager.markFilterDirty('User')

			const result = await manager.flushAll()

			expect(result.flushed).toBe(1)
			expect(result.errors).toHaveLength(0)
			expect(manager.hasDirty()).toBe(false)

			// Verify data was persisted
			const stored = await adapter.get('_model:User:filter')
			expect(stored).toBeDefined()
		})

		it('should flush dirty sorted indexes to storage', async () => {
			const index = new SortedIndex('score')
			index.insert(100, 'id1')
			index.insert(200, 'id2')

			manager.registerSortedIndex('User', 'score', index)
			manager.markIndexDirty('User', 'score')

			const result = await manager.flushAll()

			expect(result.flushed).toBe(1)
			expect(result.errors).toHaveLength(0)

			// Verify data was persisted
			const stored = await adapter.get('_model:User:idx:score')
			expect(stored).toBeDefined()
		})

		it('should flush all dirty entries at once', async () => {
			const filter = new CuckooFilter()
			filter.add('item1')
			const index = new SortedIndex('score')
			index.insert(100, 'id1')

			manager.registerFilter('User', filter)
			manager.registerSortedIndex('User', 'score', index)

			manager.markFilterDirty('User')
			manager.markIndexDirty('User', 'score')

			const result = await manager.flushAll()

			expect(result.flushed).toBe(2)
			expect(manager.hasDirty()).toBe(false)
		})

		it('should flush specific model only', async () => {
			const filter1 = new CuckooFilter()
			const filter2 = new CuckooFilter()

			manager.registerFilter('User', filter1)
			manager.registerFilter('Post', filter2)

			manager.markFilterDirty('User')
			manager.markFilterDirty('Post')

			expect(manager.getDirtyCount()).toBe(2)

			const result = await manager.flushModel('User')

			expect(result.flushed).toBe(1)
			expect(manager.getDirtyCount()).toBe(1) // Post still dirty
		})

		it('should report duration', async () => {
			const filter = new CuckooFilter()
			manager.registerFilter('User', filter)
			manager.markFilterDirty('User')

			const result = await manager.flushAll()

			expect(result.durationMs).toBeGreaterThanOrEqual(0)
		})

		it('should handle empty flush gracefully', async () => {
			const result = await manager.flushAll()

			expect(result.flushed).toBe(0)
			expect(result.errors).toHaveLength(0)
		})
	})

	describe('flush strategies', () => {
		it('should support immediate strategy', async () => {
			const immediateManager = new IndexPersistenceManager(adapter, { strategy: 'immediate' })
			const filter = new CuckooFilter()
			filter.add('item1')

			immediateManager.registerFilter('User', filter)
			immediateManager.markFilterDirty('User')

			// Wait a tick for async flush
			await new Promise((resolve) => setTimeout(resolve, 10))

			// Should have flushed automatically
			const stored = await adapter.get('_model:User:filter')
			expect(stored).toBeDefined()

			await immediateManager.shutdown()
		})

		it('should support batched strategy with threshold', async () => {
			const batchedManager = new IndexPersistenceManager(adapter, {
				strategy: 'batched',
				batchSize: 3
			})

			// Register multiple filters
			for (let i = 0; i < 5; i++) {
				const filter = new CuckooFilter()
				filter.add(`item${i}`)
				batchedManager.registerFilter(`Model${i}`, filter)
			}

			// Mark less than batch size dirty
			batchedManager.markFilterDirty('Model0')
			batchedManager.markFilterDirty('Model1')

			// Should not auto-flush yet
			expect(batchedManager.getDirtyCount()).toBe(2)

			// Mark one more to exceed threshold
			batchedManager.markFilterDirty('Model2')

			// Wait for async flush
			await new Promise((resolve) => setTimeout(resolve, 10))

			// Should have flushed
			expect(batchedManager.hasDirty()).toBe(false)

			await batchedManager.shutdown()
		})

		it('should support periodic strategy', async () => {
			jest.useFakeTimers()

			const periodicManager = new IndexPersistenceManager(adapter, {
				strategy: 'periodic',
				intervalMs: 100
			})
			periodicManager.init()

			const filter = new CuckooFilter()
			filter.add('item1')
			periodicManager.registerFilter('User', filter)
			periodicManager.markFilterDirty('User')

			expect(periodicManager.hasDirty()).toBe(true)

			// Advance timers
			jest.advanceTimersByTime(150)

			// Wait for async operations
			await Promise.resolve()

			await periodicManager.shutdown()
			jest.useRealTimers()
		})
	})

	describe('epoch tracking', () => {
		it('should increment epoch on dirty mark', () => {
			const filter = new CuckooFilter()
			manager.registerFilter('User', filter)

			const epoch1 = manager.getEpoch('User')
			manager.markFilterDirty('User')
			const epoch2 = manager.getEpoch('User')

			expect(epoch2).toBe(epoch1 + 1)
		})

		it('should persist epoch data', async () => {
			const filter = new CuckooFilter()
			manager.registerFilter('User', filter)
			manager.markFilterDirty('User')

			await manager.persistEpoch('User')

			const epochData = await adapter.get('_model:User:epoch')
			expect(epochData).toBeDefined()
			expect((epochData as { epoch: number }).epoch).toBe(manager.getEpoch('User'))
		})

		it('should load epoch data', async () => {
			await adapter.set('_model:User:epoch', {
				version: 1,
				epoch: 42,
				persistedAt: Date.now(),
				modelName: 'User'
			})

			const loaded = await manager.loadEpoch('User')

			expect(loaded).toBeDefined()
			expect(loaded!.epoch).toBe(42)
			expect(manager.getEpoch('User')).toBe(42)
		})

		it('should detect stale indexes', async () => {
			const filter = new CuckooFilter()
			manager.registerFilter('User', filter)

			// No persisted epoch = stale
			const stale1 = await manager.isStale('User')
			expect(stale1).toBe(true)

			// Persist epoch
			await manager.persistEpoch('User')

			// Same epoch = not stale
			const stale2 = await manager.isStale('User')
			expect(stale2).toBe(false)

			// Mark dirty (increments epoch)
			manager.markFilterDirty('User')

			// Epoch mismatch = stale
			const stale3 = await manager.isStale('User')
			expect(stale3).toBe(true)
		})
	})

	describe('namespaced models', () => {
		it('should track dirty entries with namespace', () => {
			const filter = new CuckooFilter()
			manager.registerFilter('User', filter, 'prod')
			manager.markFilterDirty('User', 'prod')

			expect(manager.hasDirty()).toBe(true)
		})

		it('should flush namespaced entries', async () => {
			const filter = new CuckooFilter()
			filter.add('item1')
			manager.registerFilter('User', filter, 'prod')
			manager.markFilterDirty('User', 'prod')

			await manager.flushAll()

			// Note: The storage key would include namespace
			expect(manager.hasDirty()).toBe(false)
		})

		it('should track epoch with namespace', () => {
			const filter = new CuckooFilter()
			manager.registerFilter('User', filter, 'prod')
			manager.markFilterDirty('User', 'prod')

			const epoch = manager.getEpoch('User', 'prod')
			expect(epoch).toBe(2) // register + markDirty
		})
	})

	describe('concurrent flush handling', () => {
		it('should coalesce concurrent flush requests', async () => {
			const filter = new CuckooFilter()
			filter.add('item1')
			manager.registerFilter('User', filter)
			manager.markFilterDirty('User')

			// Start multiple flushes concurrently
			const results = await Promise.all([manager.flushAll(), manager.flushAll(), manager.flushAll()])

			// All should return results (coalesced)
			for (const result of results) {
				expect(result).toBeDefined()
			}

			expect(manager.hasDirty()).toBe(false)
		})
	})

	describe('shutdown', () => {
		it('should flush on shutdown', async () => {
			const filter = new CuckooFilter()
			filter.add('item1')
			manager.registerFilter('User', filter)
			manager.markFilterDirty('User')

			expect(manager.hasDirty()).toBe(true)

			await manager.shutdown()

			// Data should be persisted
			const stored = await adapter.get('_model:User:filter')
			expect(stored).toBeDefined()
		})

		it('should clear state after shutdown', async () => {
			const filter = new CuckooFilter()
			manager.registerFilter('User', filter)
			manager.markFilterDirty('User')

			await manager.shutdown()

			expect(manager.hasDirty()).toBe(false)
			expect(manager.getDirtyCount()).toBe(0)
		})
	})

	describe('atomic batch', () => {
		it('should use atomicBatch when available', async () => {
			// Create adapter with atomicBatch support
			const ops: unknown[] = []
			const batchAdapter = Object.assign(Object.create(Object.getPrototypeOf(adapter)), adapter, {
				atomicBatch: async (operations: unknown[]) => {
					ops.push(...operations)
				}
			})

			const batchManager = new IndexPersistenceManager(batchAdapter)

			const filter1 = new CuckooFilter()
			const filter2 = new CuckooFilter()
			filter1.add('item1')
			filter2.add('item2')

			batchManager.registerFilter('User', filter1)
			batchManager.registerFilter('Post', filter2)
			batchManager.markFilterDirty('User')
			batchManager.markFilterDirty('Post')

			await batchManager.flushAll()

			// Should have used batch operation
			expect(ops.length).toBe(6)
			expect(ops).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: 'set', key: '_model:User:filter' }),
					expect.objectContaining({ type: 'set', key: '_model:Post:filter' }),
					expect.objectContaining({ type: 'set', key: '_model:User:epoch' }),
					expect.objectContaining({ type: 'set', key: '_model:Post:epoch' })
				])
			)

			await batchManager.shutdown()
		})
	})
})
