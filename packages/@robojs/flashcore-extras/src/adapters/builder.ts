/**
 * Flashcore v1 (spec rev 4.3) Adapter Builder
 *
 * Provides a fluent API for composing adapter wrappers.
 */

import type { FlashcoreAdapter } from 'robo.js/flashcore'
import { CacheAdapter, type CacheOptions } from './cache.js'
import { CompressionAdapter, type CompressionOptions } from './compression.js'
import { EncryptionAdapter, type EncryptionOptions } from './encryption.js'
import { ResilienceAdapter, type ResilienceOptions } from './resilience.js'

/**
 * Builder for composing adapter wrappers.
 *
 * Wrappers are applied in the order they are called.
 * The innermost wrapper (first added) is closest to the base adapter.
 *
 * @example
 * ```typescript
 * const adapter = new AdapterBuilder(new RedisAdapter(redis))
 *   .withResilience({ maxRetries: 5 })
 *   .withCompression({ threshold: 512 })
 *   .withEncryption({ key: process.env.SECRET! })
 *   .withCache({ maxSize: 1000 })
 *   .build()
 *
 * // Data flow:
 * // get() → Cache → Encryption → Compression → Resilience → Redis
 * // set() → Cache → Encryption → Compression → Resilience → Redis
 * ```
 */
export class AdapterBuilder<K extends string = string, V = unknown> {
	private adapter: FlashcoreAdapter<K, V>
	private wrapperNames: string[] = []

	constructor(baseAdapter: FlashcoreAdapter<K, V>) {
		this.adapter = baseAdapter
	}

	/**
	 * Add an LRU cache layer.
	 *
	 * The cache is in-memory and reduces reads to the underlying adapter.
	 * Cache entries are invalidated on writes.
	 */
	withCache(options?: CacheOptions): this {
		this.adapter = new CacheAdapter(this.adapter, options)
		this.wrapperNames.push('cache')
		return this
	}

	/**
	 * Add gzip compression for values above a threshold.
	 *
	 * Compressed values are tagged with '__gz__:' prefix.
	 * Decompression is automatic on read.
	 */
	withCompression(options?: CompressionOptions): this {
		this.adapter = new CompressionAdapter(this.adapter, options)
		this.wrapperNames.push('compression')
		return this
	}

	/**
	 * Add AES-256 encryption for all values.
	 *
	 * Encrypted values are tagged with '__enc__:' prefix.
	 * Decryption is automatic on read.
	 *
	 * @param options - Must include `key` for encryption
	 */
	withEncryption(options: EncryptionOptions): this {
		this.adapter = new EncryptionAdapter(this.adapter, options)
		this.wrapperNames.push('encryption')
		return this
	}

	/**
	 * Add automatic retry with exponential backoff.
	 *
	 * Retries transient errors (network issues, timeouts, etc.)
	 * with configurable max retries and delay.
	 */
	withResilience(options?: ResilienceOptions): this {
		this.adapter = new ResilienceAdapter(this.adapter, options)
		this.wrapperNames.push('resilience')
		return this
	}

	/**
	 * Add a custom wrapper.
	 *
	 * Use this to add wrappers not included in the standard set.
	 */
	with(wrapper: (adapter: FlashcoreAdapter<K, V>) => FlashcoreAdapter<K, V>, name?: string): this {
		this.adapter = wrapper(this.adapter)
		this.wrapperNames.push(name ?? 'custom')
		return this
	}

	/**
	 * Build and return the composed adapter.
	 */
	build(): FlashcoreAdapter<K, V> {
		return this.adapter
	}

	/**
	 * Get the list of applied wrappers (in order from outer to inner).
	 */
	getWrapperNames(): string[] {
		// Reverse because wrappers are added inside-out
		return [...this.wrapperNames].reverse()
	}

	/**
	 * Get a description of the wrapper stack.
	 */
	describe(): string {
		const base = this.getBaseAdapterName()
		if (this.wrapperNames.length === 0) {
			return base
		}
		return `${this.getWrapperNames().join(' → ')} → ${base}`
	}

	/**
	 * Get the name of the base adapter.
	 */
	private getBaseAdapterName(): string {
		let adapter = this.adapter
		// Unwrap to find the base adapter
		while ('next' in adapter && adapter.next) {
			adapter = adapter.next as FlashcoreAdapter<K, V>
		}
		return adapter.name ?? 'UnknownAdapter'
	}
}

/**
 * Create a new AdapterBuilder with the given base adapter.
 *
 * @example
 * ```typescript
 * import { buildAdapter } from '@robojs/flashcore-extras/adapters'
 * import { MemoryAdapter } from 'robo.js/flashcore'
 *
 * const adapter = buildAdapter(new MemoryAdapter())
 *   .withCache({ maxSize: 500 })
 *   .withCompression()
 *   .build()
 * ```
 */
export function buildAdapter<K extends string = string, V = unknown>(
	baseAdapter: FlashcoreAdapter<K, V>
): AdapterBuilder<K, V> {
	return new AdapterBuilder<K, V>(baseAdapter)
}

/**
 * Recommended wrapper stacks for common use cases.
 */
export const AdapterPresets = {
	/**
	 * Production stack with all features.
	 *
	 * Order: Cache → Encryption → Compression → Resilience → Adapter
	 */
	production<K extends string = string, V = unknown>(
		adapter: FlashcoreAdapter<K, V>,
		options: {
			encryptionKey: string
			cacheSize?: number
			compressionThreshold?: number
			maxRetries?: number
		}
	): FlashcoreAdapter<K, V> {
		return new AdapterBuilder(adapter)
			.withResilience({ maxRetries: options.maxRetries ?? 3 })
			.withCompression({ threshold: options.compressionThreshold ?? 512 })
			.withEncryption({ key: options.encryptionKey })
			.withCache({ maxSize: options.cacheSize ?? 1000 })
			.build()
	},

	/**
	 * Development stack without encryption.
	 *
	 * Order: Cache → Compression → Adapter
	 */
	development<K extends string = string, V = unknown>(
		adapter: FlashcoreAdapter<K, V>,
		options?: {
			cacheSize?: number
			compressionThreshold?: number
		}
	): FlashcoreAdapter<K, V> {
		return new AdapterBuilder(adapter)
			.withCompression({ threshold: options?.compressionThreshold ?? 512 })
			.withCache({ maxSize: options?.cacheSize ?? 500 })
			.build()
	},

	/**
	 * Minimal stack for testing (just cache).
	 */
	testing<K extends string = string, V = unknown>(
		adapter: FlashcoreAdapter<K, V>
	): FlashcoreAdapter<K, V> {
		return new AdapterBuilder(adapter)
			.withCache({ maxSize: 100 })
			.build()
	},

	/**
	 * Resilient stack for unreliable backends.
	 *
	 * Order: Cache → Resilience → Adapter
	 */
	resilient<K extends string = string, V = unknown>(
		adapter: FlashcoreAdapter<K, V>,
		options?: {
			maxRetries?: number
			cacheSize?: number
		}
	): FlashcoreAdapter<K, V> {
		return new AdapterBuilder(adapter)
			.withResilience({ maxRetries: options?.maxRetries ?? 5 })
			.withCache({ maxSize: options?.cacheSize ?? 1000 })
			.build()
	},
}
