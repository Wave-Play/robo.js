/**
 * Flashcore v1 (spec rev 4.3) LRU Cache Wrapper
 *
 * Adds an in-memory LRU cache layer to any adapter.
 * Reduces reads to the underlying adapter for frequently accessed keys.
 */

import type { FlashcoreAdapter, BatchOperation } from 'robo.js/flashcore'
import { AdapterWrapper } from './base.js'

/**
 * Options for the LRU cache wrapper.
 */
export interface CacheOptions {
	/**
	 * Maximum number of entries in the cache.
	 * Default: 1000
	 */
	maxSize?: number

	/**
	 * Maximum age of cache entries in milliseconds.
	 * Entries older than this are considered stale.
	 * Default: 0 (no expiration)
	 */
	maxAge?: number

	/**
	 * Track cache statistics (hits, misses).
	 * Default: true
	 */
	trackStats?: boolean

	/**
	 * Callback invoked on cache hit (for metrics tracking).
	 */
	onCacheHit?: () => void

	/**
	 * Callback invoked on cache miss (for metrics tracking).
	 */
	onCacheMiss?: () => void
}

interface CacheEntry<V> {
	value: V
	timestamp: number
}

/**
 * Cache statistics.
 */
export interface CacheStats {
	hits: number
	misses: number
	size: number
	evictions: number
}

/**
 * LRU cache wrapper for adapters.
 *
 * Uses a Map for O(1) access with LRU eviction based on insertion order.
 * Map maintains insertion order, so deleting and re-setting moves to end.
 */
export class CacheAdapter<K extends string = string, V = unknown>
	extends AdapterWrapper<K, V>
{
	readonly name = 'CacheAdapter'

	private cache = new Map<K, CacheEntry<V>>()
	private maxSize: number
	private maxAge: number
	private trackStats: boolean
	private onCacheHit?: () => void
	private onCacheMiss?: () => void
	private stats: CacheStats = { hits: 0, misses: 0, size: 0, evictions: 0 }

	constructor(adapter: FlashcoreAdapter<K, V>, options: CacheOptions = {}) {
		super(adapter)
		this.maxSize = options.maxSize ?? 1000
		this.maxAge = options.maxAge ?? 0
		this.trackStats = options.trackStats ?? true
		this.onCacheHit = options.onCacheHit
		this.onCacheMiss = options.onCacheMiss
	}

	// ─────────────────────────────────────────────────────────────
	// Overridden Methods
	// ─────────────────────────────────────────────────────────────

	async get(key: K): Promise<V | undefined> {
		const cached = this.cache.get(key)

		if (cached !== undefined) {
			// Check if entry is still valid
			if (this.maxAge === 0 || Date.now() - cached.timestamp < this.maxAge) {
				// Move to end (most recently used)
				this.cache.delete(key)
				this.cache.set(key, cached)

				if (this.trackStats) {
					this.stats.hits++
					this.onCacheHit?.()
				}
				return cached.value
			} else {
				// Entry is stale, remove it
				this.cache.delete(key)
				this.stats.size--
			}
		}

		// Cache miss - fetch from underlying adapter
		if (this.trackStats) {
			this.stats.misses++
			this.onCacheMiss?.()
		}
		const value = await this.next.get(key)

		if (value !== undefined) {
			this.cacheSet(key, value)
		}

		return value
	}

	async set(key: K, value: V): Promise<boolean> {
		const result = await this.next.set(key, value)

		if (result) {
			// Update cache on successful write
			this.cacheSet(key, value)
		}

		return result
	}

	async delete(key: K): Promise<boolean> {
		// Remove from cache first
		if (this.cache.has(key)) {
			this.cache.delete(key)
			this.stats.size--
		}

		return this.next.delete(key)
	}

	async has(key: K): Promise<boolean> {
		// Check cache first
		const cached = this.cache.get(key)
		if (cached !== undefined) {
			if (this.maxAge === 0 || Date.now() - cached.timestamp < this.maxAge) {
				return true
			}
			// Stale entry
			this.cache.delete(key)
			this.stats.size--
		}

		// Fall through to underlying adapter
		return this.next.has(key)
	}

	async clear(): Promise<void> {
		// Clear cache
		this.cache.clear()
		this.stats.size = 0

		// Clear underlying adapter
		await this.next.clear()
	}

	// ─────────────────────────────────────────────────────────────
	// Override atomic batch to maintain cache consistency
	// ─────────────────────────────────────────────────────────────

	get atomicBatch(): ((ops: BatchOperation<K, V>[]) => Promise<void> | void) | undefined {
		if (!this.next.atomicBatch) return undefined

		return async (ops: BatchOperation<K, V>[]) => {
			await this.next.atomicBatch!(ops)

			// Update cache to reflect batch operations
			for (const op of ops) {
				if (op.type === 'set') {
					this.cacheSet(op.key, op.value)
				} else if (op.type === 'delete') {
					if (this.cache.has(op.key)) {
						this.cache.delete(op.key)
						this.stats.size--
					}
				}
			}
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Cache Management
	// ─────────────────────────────────────────────────────────────

	/**
	 * Add an entry to the cache with LRU eviction.
	 */
	private cacheSet(key: K, value: V): void {
		// If key already exists, delete to update position
		if (this.cache.has(key)) {
			this.cache.delete(key)
		} else {
			// Evict oldest entry if at capacity
			if (this.cache.size >= this.maxSize) {
				// Get first key (oldest due to Map insertion order)
				const oldestKey = this.cache.keys().next().value
				if (oldestKey !== undefined) {
					this.cache.delete(oldestKey)
					this.stats.evictions++
				}
			} else {
				this.stats.size++
			}
		}

		this.cache.set(key, {
			value,
			timestamp: Date.now()
		})
	}

	/**
	 * Invalidate a specific cache entry.
	 */
	invalidate(key: K): void {
		if (this.cache.has(key)) {
			this.cache.delete(key)
			this.stats.size--
		}
	}

	/**
	 * Invalidate all cache entries with a given prefix.
	 */
	invalidatePrefix(prefix: string): void {
		for (const key of this.cache.keys()) {
			if (String(key).startsWith(prefix)) {
				this.cache.delete(key)
				this.stats.size--
			}
		}
	}

	/**
	 * Get cache statistics.
	 */
	getStats(): CacheStats {
		return { ...this.stats }
	}

	/**
	 * Reset cache statistics.
	 */
	resetStats(): void {
		this.stats.hits = 0
		this.stats.misses = 0
		this.stats.evictions = 0
		// Note: size is not reset as it reflects actual cache state
	}

	/**
	 * Get current cache size.
	 */
	getCacheSize(): number {
		return this.cache.size
	}

	/**
	 * Prune expired entries from the cache.
	 */
	prune(): number {
		if (this.maxAge === 0) return 0

		const now = Date.now()
		let pruned = 0

		for (const [key, entry] of this.cache) {
			if (now - entry.timestamp >= this.maxAge) {
				this.cache.delete(key)
				pruned++
			}
		}

		this.stats.size -= pruned
		return pruned
	}

	/**
	 * Get the current cache configuration.
	 */
	getConfig(): { maxSize: number; maxAge: number } {
		return {
			maxSize: this.maxSize,
			maxAge: this.maxAge
		}
	}
}

/**
 * Create a new CacheAdapter wrapping another adapter.
 */
export function createCacheAdapter<K extends string = string, V = unknown>(
	adapter: FlashcoreAdapter<K, V>,
	options?: CacheOptions
): CacheAdapter<K, V> {
	return new CacheAdapter<K, V>(adapter, options)
}
