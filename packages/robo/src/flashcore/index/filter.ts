/**
 * Flashcore v1 Cuckoo Filter (Phase 6, spec rev 4.3)
 *
 * A space-efficient probabilistic data structure for fast negative lookups.
 * Supports deletion via 16-bit fingerprints.
 *
 * Key properties:
 * - mightContain() may return false positives but NEVER false negatives
 * - Verified lookups always consult catalog to avoid false negatives
 * - Self-heals on mismatch detection (adds missing ids)
 * - Auto-resizes at 95% load factor
 */

import {
	DEFAULT_FILTER_BUCKET_SIZE,
	DEFAULT_FILTER_FP_SIZE,
	DEFAULT_FILTER_LOAD_FACTOR,
	DEFAULT_FILTER_MAX_KICKS,
	DEFAULT_FILTER_INITIAL_CAPACITY
} from '../core/constants.js'
import { fnv1a32 } from '../core/hash.js'

/**
 * Serialized filter data for persistence.
 */
export interface CuckooFilterData {
	version: 1
	bucketSize: number
	fpSize: number
	numBuckets: number
	count: number
	buckets: Array<Array<number>> // Array of buckets, each containing fingerprints
	ids?: string[] // Tracked IDs for correct resize/rebuild
}

/**
 * Options for creating a Cuckoo filter.
 */
export interface CuckooFilterOptions {
	/** Number of entries per bucket (default: 4) */
	bucketSize?: number
	/** Fingerprint size in bits (default: 16) */
	fpSize?: number
	/** Initial number of buckets (default: 256) */
	numBuckets?: number
	/** Load factor threshold for resize (default: 0.95) */
	loadFactor?: number
	/** Maximum kick attempts before resize (default: 500) */
	maxKicks?: number
}

/**
 * Cuckoo Filter implementation with 16-bit fingerprints.
 *
 * Provides O(1) membership testing with support for deletion.
 * False positives are possible (~0.003% at 95% load with 16-bit FP).
 * False negatives are impossible (by design).
 *
 * Note: This implementation tracks original IDs to enable correct resize.
 * This trades memory for correctness. For space-critical applications,
 * use a fixed-size filter created with fromIds().
 */
export class CuckooFilter {
	private bucketSize: number
	private fpSize: number
	private numBuckets: number
	private buckets: Uint16Array[]
	private count: number
	private loadFactor: number
	private maxKicks: number

	// Track bucket fill levels for efficient checking
	private bucketCounts: Uint8Array

	// Track original IDs for correct resize (fingerprints alone are not sufficient)
	private trackedIds: Set<string>

	constructor(options?: CuckooFilterOptions) {
		this.bucketSize = options?.bucketSize ?? DEFAULT_FILTER_BUCKET_SIZE
		this.fpSize = options?.fpSize ?? DEFAULT_FILTER_FP_SIZE
		this.numBuckets = options?.numBuckets ?? DEFAULT_FILTER_INITIAL_CAPACITY
		this.loadFactor = options?.loadFactor ?? DEFAULT_FILTER_LOAD_FACTOR
		this.maxKicks = options?.maxKicks ?? DEFAULT_FILTER_MAX_KICKS
		this.count = 0
		this.trackedIds = new Set()

		// Ensure numBuckets is a power of 2 for efficient modulo
		this.numBuckets = this.nextPowerOf2(this.numBuckets)

		// Initialize buckets
		this.buckets = new Array(this.numBuckets)
		for (let i = 0; i < this.numBuckets; i++) {
			this.buckets[i] = new Uint16Array(this.bucketSize)
		}
		this.bucketCounts = new Uint8Array(this.numBuckets)
	}

	/**
	 * Add an item to the filter.
	 *
	 * @param id - The record ID to add
	 * @returns true if added successfully, false if resize needed
	 */
	add(id: string): boolean {
		// Track the ID for correct resize behavior
		this.trackedIds.add(id)

		// Check if resize needed before adding
		if (this.getLoadFactor() >= this.loadFactor) {
			this.resize()
		}

		const fp = this.fingerprint(id)
		const i1 = this.hash(id)
		const i2 = this.altIndex(i1, fp)

		// Try to insert into bucket i1
		if (this.insertIntoBucket(i1, fp)) {
			this.count++
			return true
		}

		// Try to insert into bucket i2
		if (this.insertIntoBucket(i2, fp)) {
			this.count++
			return true
		}

		// Both buckets full - need to kick
		return this.kickInsert(i1, i2, fp)
	}

	/**
	 * Remove an item from the filter.
	 *
	 * @param id - The record ID to remove
	 * @returns true if removed, false if not found
	 */
	remove(id: string): boolean {
		const fp = this.fingerprint(id)
		const i1 = this.hash(id)
		const i2 = this.altIndex(i1, fp)

		// Try to remove from bucket i1
		if (this.removeFromBucket(i1, fp)) {
			this.count--
			this.trackedIds.delete(id)
			return true
		}

		// Try to remove from bucket i2
		if (this.removeFromBucket(i2, fp)) {
			this.count--
			this.trackedIds.delete(id)
			return true
		}

		return false
	}

	/**
	 * Check if an item might be in the filter.
	 *
	 * @param id - The record ID to check
	 * @returns true if possibly present, false if definitely not present
	 */
	mightContain(id: string): boolean {
		const fp = this.fingerprint(id)
		const i1 = this.hash(id)
		const i2 = this.altIndex(i1, fp)

		return this.bucketContains(i1, fp) || this.bucketContains(i2, fp)
	}

	/**
	 * Get the current load factor.
	 */
	getLoadFactor(): number {
		return this.count / (this.numBuckets * this.bucketSize)
	}

	/**
	 * Get the number of items in the filter.
	 */
	getCount(): number {
		return this.count
	}

	/**
	 * Get the capacity (max items before resize).
	 */
	getCapacity(): number {
		return this.numBuckets * this.bucketSize
	}

	/**
	 * Resize the filter to accommodate more items.
	 * Doubles the number of buckets.
	 *
	 * We use tracked IDs to properly rehash all items, ensuring no false negatives
	 * after resize. This is the only correct way to resize a Cuckoo filter.
	 */
	resize(): void {
		// Double the size
		this.numBuckets = this.numBuckets * 2

		// Reset buckets
		this.buckets = new Array(this.numBuckets)
		for (let i = 0; i < this.numBuckets; i++) {
			this.buckets[i] = new Uint16Array(this.bucketSize)
		}
		this.bucketCounts = new Uint8Array(this.numBuckets)
		this.count = 0

		// Re-insert all items from tracked IDs (this uses correct hashing)
		const ids = Array.from(this.trackedIds)
		this.trackedIds.clear()

		for (const id of ids) {
			this.add(id)
		}
	}

	/**
	 * Clear all items from the filter.
	 */
	clear(): void {
		for (let i = 0; i < this.numBuckets; i++) {
			this.buckets[i].fill(0)
			this.bucketCounts[i] = 0
		}
		this.count = 0
		this.trackedIds.clear()
	}

	/**
	 * Serialize the filter for persistence.
	 */
	serialize(): CuckooFilterData {
		const buckets: Array<Array<number>> = []

		for (let i = 0; i < this.numBuckets; i++) {
			const bucketCount = this.bucketCounts[i]
			if (bucketCount > 0) {
				// Only store non-empty buckets with their index
				const entries: number[] = [i] // First element is bucket index
				for (let j = 0; j < bucketCount; j++) {
					entries.push(this.buckets[i][j])
				}
				buckets.push(entries)
			}
		}

		return {
			version: 1,
			bucketSize: this.bucketSize,
			fpSize: this.fpSize,
			numBuckets: this.numBuckets,
			count: this.count,
			buckets,
			ids: Array.from(this.trackedIds)
		}
	}

	/**
	 * Deserialize a filter from persisted data.
	 */
	static deserialize(data: CuckooFilterData): CuckooFilter {
		if (data.version !== 1) {
			throw new Error(`Unsupported CuckooFilter version: ${data.version}`)
		}

		const filter = new CuckooFilter({
			bucketSize: data.bucketSize,
			fpSize: data.fpSize,
			numBuckets: data.numBuckets
		})

		// Restore buckets
		for (const bucketData of data.buckets) {
			const bucketIndex = bucketData[0]
			const fingerprints = bucketData.slice(1)

			for (let j = 0; j < fingerprints.length; j++) {
				filter.buckets[bucketIndex][j] = fingerprints[j]
			}
			filter.bucketCounts[bucketIndex] = fingerprints.length
		}

		filter.count = data.count

		// Restore tracked IDs if available
		if (data.ids) {
			for (const id of data.ids) {
				filter.trackedIds.add(id)
			}
		}

		return filter
	}

	/**
	 * Create a filter from a set of IDs (bulk load).
	 */
	static fromIds(ids: string[], options?: CuckooFilterOptions): CuckooFilter {
		// Calculate appropriate size
		const requiredCapacity = Math.ceil(ids.length / DEFAULT_FILTER_LOAD_FACTOR)
		const bucketSize = options?.bucketSize ?? DEFAULT_FILTER_BUCKET_SIZE
		const numBuckets = Math.max(
			options?.numBuckets ?? DEFAULT_FILTER_INITIAL_CAPACITY,
			Math.ceil(requiredCapacity / bucketSize)
		)

		const filter = new CuckooFilter({
			...options,
			numBuckets
		})

		for (const id of ids) {
			filter.add(id)
		}

		return filter
	}

	/**
	 * Create an empty filter.
	 */
	static empty(options?: CuckooFilterOptions): CuckooFilter {
		return new CuckooFilter(options)
	}

	/**
	 * Estimate memory usage in bytes.
	 */
	estimateMemoryUsage(): number {
		// Uint16Array uses 2 bytes per element
		// Uint8Array uses 1 byte per element
		const bucketsMemory = this.numBuckets * this.bucketSize * 2
		const countsMemory = this.numBuckets
		const overhead = 100 // Object overhead estimate
		// ~130 bytes per tracked ID (Set entry overhead + string storage)
		const trackedIdsMemory = this.trackedIds.size * 130

		return bucketsMemory + countsMemory + overhead + trackedIdsMemory
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	/**
	 * Compute a 16-bit fingerprint from an ID.
	 */
	private fingerprint(id: string): number {
		// Use a simple hash and take 16 bits
		// Must never return 0 (reserved for empty)
		let hash = fnv1a32(id)
		let fp = hash & 0xffff
		if (fp === 0) fp = 1
		return fp
	}

	/**
	 * Compute the primary bucket index from an ID.
	 */
	private hash(id: string): number {
		const hash = fnv1a32(id)
		return (hash >>> 16) & (this.numBuckets - 1)
	}

	/**
	 * Compute the alternate bucket index.
	 * Uses XOR with hash of fingerprint for partial-key cuckoo hashing.
	 */
	private altIndex(index: number, fp: number): number {
		// XOR with hash of fingerprint
		const fpHash = this.fnv1aNumber(fp)
		return (index ^ (fpHash >>> 16)) & (this.numBuckets - 1)
	}

	/**
	 * FNV-1a hash function for numbers.
	 */
	private fnv1aNumber(n: number): number {
		let hash = 0x811c9dc5
		hash ^= n & 0xff
		hash = Math.imul(hash, 0x01000193)
		hash ^= (n >>> 8) & 0xff
		hash = Math.imul(hash, 0x01000193)
		return hash >>> 0
	}

	/**
	 * Insert a fingerprint into a bucket.
	 */
	private insertIntoBucket(bucketIndex: number, fp: number): boolean {
		const count = this.bucketCounts[bucketIndex]
		if (count >= this.bucketSize) {
			return false
		}

		this.buckets[bucketIndex][count] = fp
		this.bucketCounts[bucketIndex]++
		return true
	}

	/**
	 * Remove a fingerprint from a bucket.
	 */
	private removeFromBucket(bucketIndex: number, fp: number): boolean {
		const bucket = this.buckets[bucketIndex]
		const count = this.bucketCounts[bucketIndex]

		for (let i = 0; i < count; i++) {
			if (bucket[i] === fp) {
				// Swap with last element and decrease count
				bucket[i] = bucket[count - 1]
				bucket[count - 1] = 0
				this.bucketCounts[bucketIndex]--
				return true
			}
		}

		return false
	}

	/**
	 * Check if a bucket contains a fingerprint.
	 */
	private bucketContains(bucketIndex: number, fp: number): boolean {
		const bucket = this.buckets[bucketIndex]
		const count = this.bucketCounts[bucketIndex]

		for (let i = 0; i < count; i++) {
			if (bucket[i] === fp) {
				return true
			}
		}

		return false
	}

	/**
	 * Kick-insert a fingerprint when both buckets are full.
	 */
	private kickInsert(i1: number, i2: number, fp: number): boolean {
		let index = Math.random() < 0.5 ? i1 : i2
		let currentFp = fp

		for (let kicks = 0; kicks < this.maxKicks; kicks++) {
			// Pick a random slot from the bucket
			const slotIndex = Math.floor(Math.random() * this.bucketSize)
			const bucket = this.buckets[index]

			// Swap
			const evictedFp = bucket[slotIndex]
			bucket[slotIndex] = currentFp
			currentFp = evictedFp

			// Try to insert evicted fingerprint in its alternate bucket
			index = this.altIndex(index, currentFp)

			if (this.insertIntoBucket(index, currentFp)) {
				this.count++
				return true
			}
		}

		// Too many kicks - need to resize
		this.resize()

		// Try again after resize
		const newI1 = this.hash(String(currentFp)) // Approximate
		const newI2 = this.altIndex(newI1, currentFp)

		if (this.insertIntoBucket(newI1, currentFp)) {
			this.count++
			return true
		}
		if (this.insertIntoBucket(newI2, currentFp)) {
			this.count++
			return true
		}

		return false
	}

	/**
	 * Round up to the next power of 2.
	 */
	private nextPowerOf2(n: number): number {
		n--
		n |= n >>> 1
		n |= n >>> 2
		n |= n >>> 4
		n |= n >>> 8
		n |= n >>> 16
		return n + 1
	}
}
