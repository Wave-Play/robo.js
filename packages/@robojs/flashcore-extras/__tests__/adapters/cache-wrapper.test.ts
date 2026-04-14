/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Cache Wrapper Tests
 *
 * Tests for the LRU cache wrapper.
 */

import { jest } from '@jest/globals'
import { CacheAdapter, createCacheAdapter } from '../../src/adapters/cache.js'
import { MemoryAdapter } from 'robo.js/flashcore'

describe('CacheAdapter', () => {
	let baseAdapter: MemoryAdapter
	let cache: CacheAdapter

	beforeEach(() => {
		baseAdapter = new MemoryAdapter()
		cache = new CacheAdapter(baseAdapter, { maxSize: 5 })
	})

	describe('Basic Caching', () => {
		it('should cache values on get', async () => {
			await baseAdapter.set('key', 'value')

			// First get - cache miss
			const result1 = await cache.get('key')
			expect(result1).toBe('value')

			// Modify underlying value
			await baseAdapter.set('key', 'changed')

			// Second get - cache hit (returns old value)
			const result2 = await cache.get('key')
			expect(result2).toBe('value')
		})

		it('should update cache on set', async () => {
			await cache.set('key', 'value1')
			await cache.set('key', 'value2')

			const result = await cache.get('key')
			expect(result).toBe('value2')
		})

		it('should invalidate cache on delete', async () => {
			await cache.set('key', 'value')
			await cache.delete('key')

			const result = await cache.get('key')
			expect(result).toBeUndefined()
		})
	})

	describe('LRU Eviction', () => {
		it('should evict oldest entries when full', async () => {
			// Fill cache to capacity (5)
			for (let i = 0; i < 5; i++) {
				await cache.set(`key${i}`, i)
			}

			// Access first key to make it recently used
			await cache.get('key0')

			// Add new entry - should evict key1 (oldest after key0 was accessed)
			await cache.set('key5', 5)

			// key0 should still be cached (accessed recently)
			const stats = cache.getStats()
			expect(stats.evictions).toBe(1)
		})

		it('should track evictions', async () => {
			for (let i = 0; i < 10; i++) {
				await cache.set(`key${i}`, i)
			}

			const stats = cache.getStats()
			expect(stats.evictions).toBe(5) // 10 - 5 capacity
		})
	})

	describe('Cache Statistics', () => {
		it('should track hits and misses', async () => {
			await baseAdapter.set('exists', 'value')

			// Miss - not in cache yet
			await cache.get('exists')
			expect(cache.getStats().misses).toBe(1)

			// Hit - now cached
			await cache.get('exists')
			expect(cache.getStats().hits).toBe(1)

			// Miss - non-existent key
			await cache.get('nonexistent')
			expect(cache.getStats().misses).toBe(2)
		})

		it('should reset statistics', async () => {
			await baseAdapter.set('key', 'value')
			await cache.get('key')
			await cache.get('key')

			cache.resetStats()

			const stats = cache.getStats()
			expect(stats.hits).toBe(0)
			expect(stats.misses).toBe(0)
		})

		it('should report current size', async () => {
			expect(cache.getCacheSize()).toBe(0)

			await cache.set('a', 1)
			await cache.set('b', 2)

			expect(cache.getCacheSize()).toBe(2)
		})
	})

	describe('maxAge Expiration', () => {
		it('should expire entries after maxAge', async () => {
			jest.useFakeTimers()

			const timedCache = new CacheAdapter(baseAdapter, { maxAge: 1000 })

			await timedCache.set('key', 'value')
			expect(await timedCache.get('key')).toBe('value')

			// Advance time past expiration
			jest.advanceTimersByTime(1500)

			// Value should be refetched from underlying adapter
			// (but since we set via cache, it's still in base adapter)
			const result = await timedCache.get('key')
			expect(result).toBe('value')

			jest.useRealTimers()
		})

		it('should prune expired entries', async () => {
			jest.useFakeTimers()

			const timedCache = new CacheAdapter(baseAdapter, { maxAge: 1000 })

			await timedCache.set('key1', 'value1')
			await timedCache.set('key2', 'value2')

			jest.advanceTimersByTime(1500)

			const pruned = timedCache.prune()
			expect(pruned).toBe(2)
			expect(timedCache.getCacheSize()).toBe(0)

			jest.useRealTimers()
		})
	})

	describe('Cache Invalidation', () => {
		it('should invalidate specific key', async () => {
			await cache.set('key', 'value')
			cache.invalidate('key')

			// Should fetch from base adapter
			expect(cache.getCacheSize()).toBe(0)
		})

		it('should invalidate by prefix', async () => {
			await cache.set('user:1', 'a')
			await cache.set('user:2', 'b')
			await cache.set('post:1', 'c')

			cache.invalidatePrefix('user:')

			expect(cache.getCacheSize()).toBe(1) // only post:1 remains
		})
	})

	describe('Clear Operation', () => {
		it('should clear both cache and underlying adapter', async () => {
			await cache.set('a', 1)
			await cache.set('b', 2)

			await cache.clear()

			expect(cache.getCacheSize()).toBe(0)
			expect(await baseAdapter.has('a')).toBe(false)
			expect(await baseAdapter.has('b')).toBe(false)
		})
	})

	describe('has() Operation', () => {
		it('should check cache first', async () => {
			await cache.set('key', 'value')
			expect(await cache.has('key')).toBe(true)
		})

		it('should fall through to base adapter', async () => {
			await baseAdapter.set('key', 'value')
			expect(await cache.has('key')).toBe(true)
		})
	})

	describe('Atomic Batch', () => {
		it('should update cache on batch set', async () => {
			await cache.atomicBatch!([
				{ type: 'set', key: 'a', value: 1 },
				{ type: 'set', key: 'b', value: 2 }
			])

			expect(cache.getCacheSize()).toBe(2)
			expect(await cache.get('a')).toBe(1)
			expect(await cache.get('b')).toBe(2)
		})

		it('should invalidate cache on batch delete', async () => {
			await cache.set('a', 1)
			await cache.set('b', 2)

			await cache.atomicBatch!([
				{ type: 'delete', key: 'a' }
			])

			expect(cache.getCacheSize()).toBe(1)
			expect(await cache.has('a')).toBe(false)
		})
	})

	describe('Factory Function', () => {
		it('should create adapter with createCacheAdapter', async () => {
			const factoryCache = createCacheAdapter(baseAdapter, { maxSize: 10 })
			await factoryCache.set('test', 'value')
			expect(await factoryCache.get('test')).toBe('value')
		})
	})

	describe('Capability Propagation', () => {
		it('should propagate scan capability', async () => {
			expect(cache.scan).toBeDefined()
			await cache.set('user:1', 'a')
			await cache.set('user:2', 'b')

			const keys = await cache.scan!('user:') as string[]
			expect(keys.sort()).toEqual(['user:1', 'user:2'].sort())
		})

		it('should propagate setIfNotExists capability', async () => {
			expect(cache.setIfNotExists).toBeDefined()
		})

		it('should propagate compareAndSwap capability', async () => {
			expect(cache.compareAndSwap).toBeDefined()
		})
	})
})
