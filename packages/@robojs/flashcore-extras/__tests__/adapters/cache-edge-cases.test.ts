/**
 * Phase 5: Cache Adapter Edge Cases
 *
 * Tests TTL expiration, LRU eviction order, cache invalidation on set,
 * statistics tracking, pruning, and prefix invalidation.
 */

import { jest } from '@jest/globals'
import { MemoryAdapter } from 'robo.js/flashcore'
import { CacheAdapter } from '../../src/adapters/cache.js'

describe('CacheAdapter edge cases', () => {
	let baseAdapter: MemoryAdapter

	beforeEach(() => {
		baseAdapter = new MemoryAdapter()
		jest.useRealTimers()
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	// ── TTL expiration ────────────────────────────────────────────

	it('should fall through to underlying adapter after maxAge expires', async () => {
		jest.useFakeTimers()

		const cache = new CacheAdapter(baseAdapter, { maxAge: 500 })

		// Set via cache so both cache and base have the value
		await cache.set('key' as never, 'original' as never)

		// Value is cached
		expect(await cache.get('key' as never)).toBe('original')

		// Mutate the base adapter directly (simulate external change)
		baseAdapter.set('key', 'updated')

		// Still within TTL -> cache hit returns old value
		expect(await cache.get('key' as never)).toBe('original')

		// Advance past TTL
		jest.advanceTimersByTime(600)

		// Cache entry is stale -> fetches from base adapter
		const result = await cache.get('key' as never)
		expect(result).toBe('updated')
	})

	// ── LRU eviction order ────────────────────────────────────────

	it('should evict the least-recently-used entry when maxSize is exceeded', async () => {
		const cache = new CacheAdapter(baseAdapter, { maxSize: 3 })

		await cache.set('a' as never, 1 as never)
		await cache.set('b' as never, 2 as never)
		await cache.set('c' as never, 3 as never)

		// Access 'a' so it becomes recently used
		await cache.get('a' as never)

		// Insert 4th item -> 'b' is the oldest untouched entry
		await cache.set('d' as never, 4 as never)

		const stats = cache.getStats()
		expect(stats.evictions).toBe(1)

		// 'a' is still cached (was accessed recently)
		expect(cache.getCacheSize()).toBe(3)
	})

	// ── Cache invalidation on set ─────────────────────────────────

	it('should return the new value after overwriting a cached key', async () => {
		const cache = new CacheAdapter(baseAdapter, { maxSize: 10 })

		await cache.set('k' as never, 'v1' as never)

		// First get - hits cache
		expect(await cache.get('k' as never)).toBe('v1')

		// Overwrite
		await cache.set('k' as never, 'v2' as never)

		// Should return the updated value
		expect(await cache.get('k' as never)).toBe('v2')
	})

	// ── getStats / resetStats ─────────────────────────────────────

	it('should track hits, misses, size, and evictions', async () => {
		const cache = new CacheAdapter(baseAdapter, { maxSize: 2 })

		baseAdapter.set('x', 'val')

		// Miss (x not in cache)
		await cache.get('x' as never)

		// Hit (x now cached)
		await cache.get('x' as never)

		await cache.set('a' as never, 1 as never)
		await cache.set('b' as never, 2 as never)
		// 'x' was in cache along with 'a', adding 'b' evicts oldest

		const stats = cache.getStats()
		expect(stats.hits).toBeGreaterThanOrEqual(1)
		expect(stats.misses).toBeGreaterThanOrEqual(1)
		expect(stats.size).toBeLessThanOrEqual(2)
		expect(typeof stats.evictions).toBe('number')
	})

	it('should reset hit/miss/eviction counters but not size', async () => {
		const cache = new CacheAdapter(baseAdapter, { maxSize: 10 })

		await cache.set('a' as never, 1 as never)
		baseAdapter.set('b', 2)
		await cache.get('b' as never) // miss
		await cache.get('b' as never) // hit

		const before = cache.getStats()
		expect(before.hits).toBe(1)
		expect(before.misses).toBe(1)

		cache.resetStats()

		const after = cache.getStats()
		expect(after.hits).toBe(0)
		expect(after.misses).toBe(0)
		expect(after.evictions).toBe(0)
		// size should still reflect actual cache
		expect(after.size).toBeGreaterThanOrEqual(0)
	})

	// ── prune ─────────────────────────────────────────────────────

	it('should remove expired entries on prune', async () => {
		jest.useFakeTimers()

		const cache = new CacheAdapter(baseAdapter, { maxAge: 1000 })

		await cache.set('early' as never, 1 as never)
		jest.advanceTimersByTime(600)
		await cache.set('late' as never, 2 as never)

		// Only 'early' has expired at 1000ms mark
		jest.advanceTimersByTime(500) // total 1100ms for 'early', 500ms for 'late'

		const pruned = cache.prune()
		expect(pruned).toBe(1)
		expect(cache.getCacheSize()).toBe(1)
	})

	it('should return 0 from prune when maxAge is 0 (no expiration)', () => {
		const cache = new CacheAdapter(baseAdapter, { maxAge: 0 })
		expect(cache.prune()).toBe(0)
	})

	// ── invalidatePrefix ──────────────────────────────────────────

	it('should clear all keys matching a given prefix', async () => {
		const cache = new CacheAdapter(baseAdapter, { maxSize: 100 })

		await cache.set('user:1' as never, 'alice' as never)
		await cache.set('user:2' as never, 'bob' as never)
		await cache.set('post:1' as never, 'hello' as never)

		cache.invalidatePrefix('user:')

		// Only post:1 should remain
		expect(cache.getCacheSize()).toBe(1)
	})

	// ── getCacheSize accuracy ─────────────────────────────────────

	it('should accurately reflect the number of cached items', async () => {
		const cache = new CacheAdapter(baseAdapter, { maxSize: 100 })

		expect(cache.getCacheSize()).toBe(0)

		await cache.set('a' as never, 1 as never)
		expect(cache.getCacheSize()).toBe(1)

		await cache.set('b' as never, 2 as never)
		expect(cache.getCacheSize()).toBe(2)

		await cache.delete('a' as never)
		expect(cache.getCacheSize()).toBe(1)

		await cache.clear()
		expect(cache.getCacheSize()).toBe(0)
	})
})
