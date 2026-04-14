/**
 * Flashcore v1 (spec rev 4.3) Compression Wrapper
 *
 * Adds gzip compression to values above a configurable threshold.
 * Compressed values are tagged with '__gz__:' prefix for identification.
 */

import { gzipSync, gunzipSync } from 'node:zlib'
import type { FlashcoreAdapter, BatchOperation } from 'robo.js/flashcore'
import { AdapterWrapper } from './base.js'

/**
 * Options for the compression wrapper.
 */
export interface CompressionOptions {
	/**
	 * Minimum size in bytes before compression is applied.
	 * Values smaller than this are stored uncompressed.
	 * Default: 512
	 */
	threshold?: number

	/**
	 * Compression level (1-9, higher = better compression but slower).
	 * Default: 6
	 */
	level?: number
}

// Tag prefix for compressed values
const COMPRESSED_PREFIX = '__gz__:'

/**
 * Compression wrapper for adapters.
 *
 * Values above the threshold are gzip compressed and stored
 * as base64-encoded strings with a prefix tag.
 */
export class CompressionAdapter<K extends string = string, V = unknown>
	extends AdapterWrapper<K, V>
{
	readonly name = 'CompressionAdapter'

	private threshold: number
	private level: number

	constructor(adapter: FlashcoreAdapter<K, V>, options: CompressionOptions = {}) {
		super(adapter)
		this.threshold = options.threshold ?? 512
		this.level = options.level ?? 6
	}

	// ─────────────────────────────────────────────────────────────
	// Overridden Methods
	// ─────────────────────────────────────────────────────────────

	async get(key: K): Promise<V | undefined> {
		const stored = await this.next.get(key)
		return this.decompress(stored)
	}

	async set(key: K, value: V): Promise<boolean> {
		const compressed = this.compress(value)
		return this.next.set(key, compressed as V)
	}

	// ─────────────────────────────────────────────────────────────
	// Override optional methods that need compression handling
	// ─────────────────────────────────────────────────────────────

	get setIfNotExists(): ((key: K, value: V) => Promise<boolean> | boolean) | undefined {
		if (!this.next.setIfNotExists) return undefined

		return (key: K, value: V) => {
			const compressed = this.compress(value)
			return this.next.setIfNotExists!(key, compressed as V)
		}
	}

	get compareAndSwap(): ((key: K, expected: V, next: V) => Promise<boolean> | boolean) | undefined {
		if (!this.next.compareAndSwap) return undefined

		return async (key: K, expected: V, next: V) => {
			// We need to compare against the stored (possibly compressed) form
			const compressedExpected = this.compress(expected)
			const compressedNext = this.compress(next)
			return this.next.compareAndSwap!(key, compressedExpected as V, compressedNext as V)
		}
	}

	get atomicBatch(): ((ops: BatchOperation<K, V>[]) => Promise<void> | void) | undefined {
		if (!this.next.atomicBatch) return undefined

		return (ops: BatchOperation<K, V>[]) => {
			// Compress values in set operations
			const transformedOps = ops.map(op => {
				if (op.type === 'set') {
					return {
						...op,
						value: this.compress(op.value) as V
					}
				}
				return op
			})
			return this.next.atomicBatch!(transformedOps)
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Compression Logic
	// ─────────────────────────────────────────────────────────────

	/**
	 * Compress a value if it exceeds the threshold.
	 */
	private compress(value: V): V | string {
		const json = JSON.stringify(value)

		// Only compress if above threshold
		if (json.length < this.threshold) {
			return value
		}

		try {
			const compressed = gzipSync(json, { level: this.level })
			return COMPRESSED_PREFIX + compressed.toString('base64')
		} catch {
			// Compression failed, store uncompressed
			return value
		}
	}

	/**
	 * Decompress a value if it has the compression tag.
	 */
	private decompress(stored: V | undefined): V | undefined {
		if (stored === undefined) {
			return undefined
		}

		// Check if this is a compressed string
		if (typeof stored === 'string' && stored.startsWith(COMPRESSED_PREFIX)) {
			try {
				const base64 = stored.slice(COMPRESSED_PREFIX.length)
				const decompressed = gunzipSync(Uint8Array.from(Buffer.from(base64, 'base64')))
				return JSON.parse(decompressed.toString()) as V
			} catch {
				// Decompression failed, return as-is
				return stored
			}
		}

		return stored
	}

	// ─────────────────────────────────────────────────────────────
	// Utilities
	// ─────────────────────────────────────────────────────────────

	/**
	 * Check if a stored value is compressed.
	 */
	isCompressed(stored: unknown): boolean {
		return typeof stored === 'string' && stored.startsWith(COMPRESSED_PREFIX)
	}

	/**
	 * Get the current threshold.
	 */
	getThreshold(): number {
		return this.threshold
	}

	/**
	 * Set a new threshold (affects future writes only).
	 */
	setThreshold(threshold: number): void {
		this.threshold = threshold
	}

	/**
	 * Get the current compression configuration.
	 */
	getConfig(): { threshold: number; level: number } {
		return {
			threshold: this.threshold,
			level: this.level
		}
	}
}

/**
 * Create a new CompressionAdapter wrapping another adapter.
 */
export function createCompressionAdapter<K extends string = string, V = unknown>(
	adapter: FlashcoreAdapter<K, V>,
	options?: CompressionOptions
): CompressionAdapter<K, V> {
	return new CompressionAdapter<K, V>(adapter, options)
}
