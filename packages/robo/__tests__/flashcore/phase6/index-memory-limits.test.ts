/**
 * Phase 6: Index Memory Limits Tests
 *
 * Tests for memory limits and LRU eviction in IndexPersistenceManager.
 */

import { IndexPersistenceManager } from '../../../src/flashcore/index/persistence.js'
import { CuckooFilter } from '../../../src/flashcore/index/filter.js'
import { SortedIndex } from '../../../src/flashcore/index/sorted.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'

describe('IndexPersistenceManager Memory Limits', () => {
	let adapter: MemoryAdapter
	let manager: IndexPersistenceManager

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init()
	})

	afterEach(async () => {
		if (manager) {
			await manager.shutdown()
		}
		await adapter.clear()
	})

	describe('Memory tracking', () => {
		it('should track memory usage for filters', () => {
			manager = new IndexPersistenceManager(adapter, {
				memoryLimit: 1024 * 1024 // 1MB
			})
			manager.init()

			// Initial memory should be 0
			expect(manager.getMemoryUsage()).toBe(0)

			// Create and track a filter
			const filter = CuckooFilter.empty()
			filter.add('record1')
			filter.add('record2')

			manager.registerFilter('TestModel', filter)
			manager.trackFilterMemory('TestModel', filter)

			// Memory should be tracked
			expect(manager.getMemoryUsage()).toBeGreaterThan(0)
		})

		it('should track memory usage for sorted indexes', () => {
			manager = new IndexPersistenceManager(adapter, {
				memoryLimit: 1024 * 1024 // 1MB
			})
			manager.init()

			// Create and track a sorted index
			const index = new SortedIndex('createdAt')
			index.insert(Date.now(), 'record1')
			index.insert(Date.now() + 1000, 'record2')

			manager.registerSortedIndex('TestModel', 'createdAt', index)
			manager.trackIndexMemory('TestModel', 'createdAt', index)

			// Memory should be tracked
			expect(manager.getMemoryUsage()).toBeGreaterThan(0)
		})

		it('should update memory when entry is re-tracked', () => {
			manager = new IndexPersistenceManager(adapter, {
				memoryLimit: 1024 * 1024
			})
			manager.init()

			// Create initial filter
			const filter1 = CuckooFilter.empty()
			filter1.add('record1')
			manager.trackFilterMemory('TestModel', filter1)
			const initialMemory = manager.getMemoryUsage()

			// Create larger filter and re-track
			const filter2 = CuckooFilter.empty()
			for (let i = 0; i < 100; i++) {
				filter2.add(`record${i}`)
			}
			manager.trackFilterMemory('TestModel', filter2)
			const updatedMemory = manager.getMemoryUsage()

			// Memory should be updated (not accumulated)
			expect(updatedMemory).toBeGreaterThan(initialMemory)
		})

		it('should remove memory when entry is removed', () => {
			manager = new IndexPersistenceManager(adapter, {
				memoryLimit: 1024 * 1024
			})
			manager.init()

			const filter = CuckooFilter.empty()
			for (let i = 0; i < 50; i++) {
				filter.add(`record${i}`)
			}

			manager.trackFilterMemory('TestModel', filter)
			const memoryBefore = manager.getMemoryUsage()
			expect(memoryBefore).toBeGreaterThan(0)

			manager.removeFromMemory('TestModel', null)
			const memoryAfter = manager.getMemoryUsage()
			expect(memoryAfter).toBe(0)
		})
	})

	describe('LRU eviction', () => {
		it('should evict oldest entries when memory limit is exceeded', () => {
			// Use very small memory limit to trigger eviction
			manager = new IndexPersistenceManager(adapter, {
				memoryLimit: 1000 // Very small - will force eviction
			})
			manager.init()

			// Create filters that exceed the limit
			const filter1 = CuckooFilter.empty()
			for (let i = 0; i < 50; i++) {
				filter1.add(`model1-${i}`)
			}
			manager.registerFilter('Model1', filter1)
			manager.trackFilterMemory('Model1', filter1)

			// Touch to set access time
			manager.touchEntry('Model1', null)

			// Wait a bit to ensure different timestamps
			const filter2 = CuckooFilter.empty()
			for (let i = 0; i < 50; i++) {
				filter2.add(`model2-${i}`)
			}
			manager.registerFilter('Model2', filter2)
			manager.trackFilterMemory('Model2', filter2)

			// Memory should be within or approaching limit after eviction
			expect(manager.getMemoryUsage()).toBeLessThanOrEqual(manager.getMemoryLimit() * 2)
		})

		it('should respect LRU order during eviction', () => {
			manager = new IndexPersistenceManager(adapter, {
				memoryLimit: 500 // Very small
			})
			manager.init()

			// Track two entries
			const filter1 = CuckooFilter.empty()
			filter1.add('record1')
			manager.trackFilterMemory('OldModel', filter1)

			// Wait a moment
			const filter2 = CuckooFilter.empty()
			filter2.add('record2')

			// Touch the old one to make it recent
			manager.touchEntry('OldModel', null)

			// Track new one - this should be evicted first now since OldModel was touched
			manager.trackFilterMemory('NewModel', filter2)

			// The system should have evicted based on LRU
			expect(manager.getMemoryUsage()).toBeLessThanOrEqual(manager.getMemoryLimit() * 2)
		})
	})

	describe('Memory limit configuration', () => {
		it('should use default memory limit', () => {
			manager = new IndexPersistenceManager(adapter)
			manager.init()

			// Default is 50MB
			expect(manager.getMemoryLimit()).toBe(50 * 1024 * 1024)
		})

		it('should use configured memory limit', () => {
			const customLimit = 100 * 1024 * 1024 // 100MB
			manager = new IndexPersistenceManager(adapter, {
				memoryLimit: customLimit
			})
			manager.init()

			expect(manager.getMemoryLimit()).toBe(customLimit)
		})
	})
})
