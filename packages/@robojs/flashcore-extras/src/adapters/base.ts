/**
 * Flashcore v1 (spec rev 4.3) Adapter Wrapper Base Class
 *
 * Provides a passthrough implementation for all adapter methods,
 * allowing wrappers to override only what they need.
 */

import type {
	FlashcoreAdapter,
	AdapterTransaction,
	BatchOperation,
	AdapterCapabilitiesReport
} from 'robo.js/flashcore'

/**
 * Base class for adapter wrappers.
 *
 * Implements the decorator pattern: wraps an underlying adapter
 * and passes through all method calls by default. Subclasses
 * override specific methods to add behavior.
 *
 * Correctly propagates optional capabilities from the wrapped adapter.
 */
export abstract class AdapterWrapper<K extends string = string, V = unknown>
	implements FlashcoreAdapter<K, V>
{
	/**
	 * Human-readable name for this wrapper.
	 * Subclasses should override this.
	 */
	readonly name: string = 'AdapterWrapper'

	constructor(protected readonly next: FlashcoreAdapter<K, V>) {}

	// ─────────────────────────────────────────────────────────────
	// Required Methods - Passthrough
	// ─────────────────────────────────────────────────────────────

	get(key: K): Promise<V | undefined> | V | undefined {
		return this.next.get(key)
	}

	set(key: K, value: V): Promise<boolean> | boolean {
		return this.next.set(key, value)
	}

	delete(key: K): Promise<boolean> | boolean {
		return this.next.delete(key)
	}

	has(key: K): Promise<boolean> | boolean {
		return this.next.has(key)
	}

	clear(): Promise<boolean> | Promise<void> | boolean | void {
		return this.next.clear()
	}

	// ─────────────────────────────────────────────────────────────
	// Lifecycle - Passthrough
	// ─────────────────────────────────────────────────────────────

	init?(): Promise<void> | void {
		return this.next.init?.()
	}

	shutdown?(): Promise<void> | void {
		return this.next.shutdown?.()
	}

	// ─────────────────────────────────────────────────────────────
	// Optional Capabilities - Propagated from wrapped adapter
	// ─────────────────────────────────────────────────────────────

	/**
	 * Scan for keys with a prefix.
	 * Propagates from underlying adapter if available.
	 */
	get scan(): ((prefix: K) => Promise<K[]> | K[] | AsyncIterable<K> | Promise<AsyncIterable<K>>) | undefined {
		if (!this.next.scan) return undefined
		return (prefix: K) => this.next.scan!(prefix)
	}

	/**
	 * Set if not exists.
	 * Propagates from underlying adapter if available.
	 */
	get setIfNotExists(): ((key: K, value: V) => Promise<boolean> | boolean) | undefined {
		if (!this.next.setIfNotExists) return undefined
		return (key: K, value: V) => this.next.setIfNotExists!(key, value)
	}

	/**
	 * Compare and swap.
	 * Propagates from underlying adapter if available.
	 */
	get compareAndSwap(): ((key: K, expected: V, next: V) => Promise<boolean> | boolean) | undefined {
		if (!this.next.compareAndSwap) return undefined
		return (key: K, expected: V, next: V) => this.next.compareAndSwap!(key, expected, next)
	}

	/**
	 * Atomic batch operations.
	 * Propagates from underlying adapter if available.
	 */
	get atomicBatch(): ((ops: BatchOperation<K, V>[]) => Promise<void> | void) | undefined {
		if (!this.next.atomicBatch) return undefined
		return (ops: BatchOperation<K, V>[]) => this.next.atomicBatch!(ops)
	}

	/**
	 * Native transaction API.
	 * Propagates from underlying adapter if available.
	 */
	get transaction(): ((fn: (tx: AdapterTransaction<K, V>) => Promise<void>) => Promise<void>) | undefined {
		if (!this.next.transaction) return undefined
		return (fn: (tx: AdapterTransaction<K, V>) => Promise<void>) => this.next.transaction!(fn)
	}

	/**
	 * Maximum value size.
	 * Propagates from underlying adapter if available.
	 */
	get maxValueSize(): number | undefined {
		return this.next.maxValueSize
	}

	/**
	 * Extended capabilities.
	 * Propagates from underlying adapter if available.
	 */
	capabilities?(): Partial<AdapterCapabilitiesReport> {
		return this.next.capabilities?.() ?? {}
	}

	// ─────────────────────────────────────────────────────────────
	// Helper Methods for Subclasses
	// ─────────────────────────────────────────────────────────────

	/**
	 * Get the underlying (wrapped) adapter.
	 */
	protected getWrappedAdapter(): FlashcoreAdapter<K, V> {
		return this.next
	}

	/**
	 * Get the innermost adapter by unwrapping all wrappers.
	 */
	protected getInnermostAdapter(): FlashcoreAdapter<K, V> {
		let adapter: FlashcoreAdapter<K, V> = this.next
		while (adapter instanceof AdapterWrapper) {
			adapter = adapter.next
		}
		return adapter
	}
}
