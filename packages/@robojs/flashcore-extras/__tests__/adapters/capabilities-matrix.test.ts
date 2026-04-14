/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Capabilities Matrix Tests
 *
 * Tests capability detection across different adapter configurations.
 */

import { FlashcoreSystem, MemoryAdapter, normalizeCapabilities } from 'robo.js/flashcore'
import { AdapterBuilder } from '../../src/adapters/builder.js'
import { CacheAdapter } from '../../src/adapters/cache.js'
import { CompressionAdapter } from '../../src/adapters/compression.js'
import { EncryptionAdapter } from '../../src/adapters/encryption.js'
import { ResilienceAdapter } from '../../src/adapters/resilience.js'
import type { FlashcoreAdapter, BatchOperation, AdapterTransaction } from 'robo.js/flashcore'

/**
 * Minimal adapter with only required methods.
 */
class MinimalAdapter implements FlashcoreAdapter {
	readonly name = 'MinimalAdapter'
	private store = new Map<string, unknown>()

	async get(key: string) {
		return this.store.get(key)
	}

	async set(key: string, value: unknown) {
		this.store.set(key, value)
		return true
	}

	async delete(key: string) {
		return this.store.delete(key)
	}

	async has(key: string) {
		return this.store.has(key)
	}

	async clear() {
		this.store.clear()
	}
}

/**
 * Adapter with scan capability only.
 */
class ScanOnlyAdapter implements FlashcoreAdapter {
	readonly name = 'ScanOnlyAdapter'
	private data = new Map<string, unknown>()

	async get(key: string) {
		return this.data.get(key)
	}

	async set(key: string, value: unknown) {
		this.data.set(key, value)
		return true
	}

	async delete(key: string) {
		return this.data.delete(key)
	}

	async has(key: string) {
		return this.data.has(key)
	}

	async clear() {
		this.data.clear()
	}

	async scan(prefix: string): Promise<string[]> {
		const keys: string[] = []
		for (const key of this.data.keys()) {
			if (key.startsWith(prefix)) {
				keys.push(key)
			}
		}
		return keys
	}
}

/**
 * Adapter with setIfNotExists capability only.
 */
class SetIfNotExistsAdapter implements FlashcoreAdapter {
	readonly name = 'SetIfNotExistsAdapter'
	private data = new Map<string, unknown>()

	async get(key: string) {
		return this.data.get(key)
	}

	async set(key: string, value: unknown) {
		this.data.set(key, value)
		return true
	}

	async delete(key: string) {
		return this.data.delete(key)
	}

	async has(key: string) {
		return this.data.has(key)
	}

	async clear() {
		this.data.clear()
	}

	async setIfNotExists(key: string, value: unknown): Promise<boolean> {
		if (this.data.has(key)) {
			return false
		}
		this.data.set(key, value)
		return true
	}
}

/**
 * Adapter with compareAndSwap capability only.
 */
class CasAdapter implements FlashcoreAdapter {
	readonly name = 'CasAdapter'
	private data = new Map<string, unknown>()

	async get(key: string) {
		return this.data.get(key)
	}

	async set(key: string, value: unknown) {
		this.data.set(key, value)
		return true
	}

	async delete(key: string) {
		return this.data.delete(key)
	}

	async has(key: string) {
		return this.data.has(key)
	}

	async clear() {
		this.data.clear()
	}

	async compareAndSwap(key: string, expected: unknown, next: unknown): Promise<boolean> {
		const current = this.data.get(key)
		if (JSON.stringify(current) !== JSON.stringify(expected)) {
			return false
		}
		this.data.set(key, next)
		return true
	}
}

/**
 * Adapter with atomicBatch capability only.
 */
class BatchAdapter implements FlashcoreAdapter {
	readonly name = 'BatchAdapter'
	private data = new Map<string, unknown>()

	async get(key: string) {
		return this.data.get(key)
	}

	async set(key: string, value: unknown) {
		this.data.set(key, value)
		return true
	}

	async delete(key: string) {
		return this.data.delete(key)
	}

	async has(key: string) {
		return this.data.has(key)
	}

	async clear() {
		this.data.clear()
	}

	async atomicBatch(ops: BatchOperation[]): Promise<void> {
		for (const op of ops) {
			if (op.type === 'set') {
				this.data.set(op.key, op.value)
			} else if (op.type === 'delete') {
				this.data.delete(op.key)
			}
		}
	}
}

/**
 * Adapter with transaction capability.
 */
class TransactionAdapter implements FlashcoreAdapter {
	readonly name = 'TransactionAdapter'
	private data = new Map<string, unknown>()

	async get(key: string) {
		return this.data.get(key)
	}

	async set(key: string, value: unknown) {
		this.data.set(key, value)
		return true
	}

	async delete(key: string) {
		return this.data.delete(key)
	}

	async has(key: string) {
		return this.data.has(key)
	}

	async clear() {
		this.data.clear()
	}

	async transaction(fn: (tx: AdapterTransaction) => Promise<void>): Promise<void> {
		const staged = new Map<string, { type: 'set' | 'delete'; value?: unknown }>()
		const tx: AdapterTransaction = {
			get: async (key: string) => this.data.get(key),
			set: (key: string, value: unknown) => {
				staged.set(key, { type: 'set', value })
			},
			delete: (key: string) => {
				staged.set(key, { type: 'delete' })
			}
		}
		await fn(tx)
		// Commit staged operations
		for (const [key, op] of staged) {
			if (op.type === 'set') {
				this.data.set(key, op.value)
			} else {
				this.data.delete(key)
			}
		}
	}
}

/**
 * Fully-featured adapter with all capabilities.
 */
class FullFeaturedAdapter implements FlashcoreAdapter {
	readonly name = 'FullFeaturedAdapter'
	private data = new Map<string, unknown>()

	async get(key: string) {
		return this.data.get(key)
	}

	async set(key: string, value: unknown) {
		this.data.set(key, value)
		return true
	}

	async delete(key: string) {
		return this.data.delete(key)
	}

	async has(key: string) {
		return this.data.has(key)
	}

	async clear() {
		this.data.clear()
	}

	async scan(prefix: string): Promise<string[]> {
		return Array.from(this.data.keys()).filter(k => k.startsWith(prefix))
	}

	async setIfNotExists(key: string, value: unknown): Promise<boolean> {
		if (this.data.has(key)) return false
		this.data.set(key, value)
		return true
	}

	async compareAndSwap(key: string, expected: unknown, next: unknown): Promise<boolean> {
		if (JSON.stringify(this.data.get(key)) !== JSON.stringify(expected)) return false
		this.data.set(key, next)
		return true
	}

	async atomicBatch(ops: BatchOperation[]): Promise<void> {
		for (const op of ops) {
			if (op.type === 'set') this.data.set(op.key, op.value)
			else if (op.type === 'delete') this.data.delete(op.key)
		}
	}

	async transaction(fn: (tx: AdapterTransaction) => Promise<void>): Promise<void> {
		const staged = new Map<string, { type: 'set' | 'delete'; value?: unknown }>()
		const tx: AdapterTransaction = {
			get: async (key: string) => this.data.get(key),
			set: (key: string, value: unknown) => {
				staged.set(key, { type: 'set', value })
			},
			delete: (key: string) => {
				staged.set(key, { type: 'delete' })
			}
		}
		await fn(tx)
		for (const [key, op] of staged) {
			if (op.type === 'set') {
				this.data.set(key, op.value)
			} else {
				this.data.delete(key)
			}
		}
	}
}

describe('Capabilities Matrix', () => {
	describe('Minimal Adapter', () => {
		it('should have no optional capabilities', () => {
			const adapter = new MinimalAdapter()
			const caps = normalizeCapabilities(adapter)

			expect(caps.scan).toBe(false)
			expect(caps.setIfNotExists).toBe(false)
			expect(caps.compareAndSwap).toBe(false)
			expect(caps.atomicBatch).toBe(false)
			expect(caps.nativeTransactions).toBe(false)
		})
	})

	describe('Scan-Only Adapter', () => {
		it('should detect only scan capability', () => {
			const adapter = new ScanOnlyAdapter()
			const caps = normalizeCapabilities(adapter)

			expect(caps.scan).toBe(true)
			expect(caps.setIfNotExists).toBe(false)
			expect(caps.compareAndSwap).toBe(false)
			expect(caps.atomicBatch).toBe(false)
			expect(caps.nativeTransactions).toBe(false)
		})
	})

	describe('SetIfNotExists Adapter', () => {
		it('should detect only setIfNotExists capability', () => {
			const adapter = new SetIfNotExistsAdapter()
			const caps = normalizeCapabilities(adapter)

			expect(caps.scan).toBe(false)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(false)
			expect(caps.atomicBatch).toBe(false)
			expect(caps.nativeTransactions).toBe(false)
		})
	})

	describe('CAS Adapter', () => {
		it('should detect only compareAndSwap capability', () => {
			const adapter = new CasAdapter()
			const caps = normalizeCapabilities(adapter)

			expect(caps.scan).toBe(false)
			expect(caps.setIfNotExists).toBe(false)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.atomicBatch).toBe(false)
			expect(caps.nativeTransactions).toBe(false)
		})
	})

	describe('Batch Adapter', () => {
		it('should detect only atomicBatch capability', () => {
			const adapter = new BatchAdapter()
			const caps = normalizeCapabilities(adapter)

			expect(caps.scan).toBe(false)
			expect(caps.setIfNotExists).toBe(false)
			expect(caps.compareAndSwap).toBe(false)
			expect(caps.atomicBatch).toBe(true)
			expect(caps.nativeTransactions).toBe(false)
		})
	})

	describe('Transaction Adapter', () => {
		it('should detect only nativeTransactions capability', () => {
			const adapter = new TransactionAdapter()
			const caps = normalizeCapabilities(adapter)

			expect(caps.scan).toBe(false)
			expect(caps.setIfNotExists).toBe(false)
			expect(caps.compareAndSwap).toBe(false)
			expect(caps.atomicBatch).toBe(false)
			expect(caps.nativeTransactions).toBe(true)
		})
	})

	describe('Full Featured Adapter', () => {
		it('should detect all capabilities', () => {
			const adapter = new FullFeaturedAdapter()
			const caps = normalizeCapabilities(adapter)

			expect(caps.scan).toBe(true)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.atomicBatch).toBe(true)
			expect(caps.nativeTransactions).toBe(true)
		})
	})

	describe('Memory Adapter', () => {
		it('should have expected capabilities', () => {
			const adapter = new MemoryAdapter()
			const caps = normalizeCapabilities(adapter)

			// MemoryAdapter should have all optional capabilities
			expect(caps.scan).toBe(true)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.atomicBatch).toBe(true)
		})
	})

	describe('Capability Propagation Through Wrappers', () => {
		it('should propagate capabilities through CacheAdapter', () => {
			const inner = new FullFeaturedAdapter()
			const wrapped = new CacheAdapter(inner)
			const caps = normalizeCapabilities(wrapped)

			expect(caps.scan).toBe(true)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.atomicBatch).toBe(true)
		})

		it('should propagate capabilities through CompressionAdapter', () => {
			const inner = new FullFeaturedAdapter()
			const wrapped = new CompressionAdapter(inner)
			const caps = normalizeCapabilities(wrapped)

			expect(caps.scan).toBe(true)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.atomicBatch).toBe(true)
		})

		it('should propagate capabilities through EncryptionAdapter', () => {
			const inner = new FullFeaturedAdapter()
			const wrapped = new EncryptionAdapter(inner, { key: 'test-encryption-key-for-caps' })
			const caps = normalizeCapabilities(wrapped)

			expect(caps.scan).toBe(true)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.atomicBatch).toBe(true)
		})

		it('should propagate capabilities through ResilienceAdapter', () => {
			const inner = new FullFeaturedAdapter()
			const wrapped = new ResilienceAdapter(inner)
			const caps = normalizeCapabilities(wrapped)

			expect(caps.scan).toBe(true)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.atomicBatch).toBe(true)
		})

		it('should propagate limited capabilities from minimal adapter', () => {
			const inner = new MinimalAdapter()
			const wrapped = new CacheAdapter(
				new CompressionAdapter(
					new EncryptionAdapter(
						new ResilienceAdapter(inner),
						{ key: 'test-min-adapter-key' }
					)
				)
			)
			const caps = normalizeCapabilities(wrapped)

			// MinimalAdapter has no optional capabilities
			expect(caps.scan).toBe(false)
			expect(caps.setIfNotExists).toBe(false)
			expect(caps.compareAndSwap).toBe(false)
			expect(caps.atomicBatch).toBe(false)
		})

		it('should propagate through AdapterBuilder', () => {
			const stacked = new AdapterBuilder(new FullFeaturedAdapter())
				.withResilience()
				.withCompression()
				.withEncryption({ key: 'builder-caps-test-key' })
				.withCache()
				.build()

			const caps = normalizeCapabilities(stacked)

			expect(caps.scan).toBe(true)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.atomicBatch).toBe(true)
		})
	})

	describe('System API Capabilities', () => {
		beforeEach(async () => {
			await FlashcoreSystem._reset()
		})

		it('should expose capabilities via Flashcore.$.capabilities()', async () => {
			await FlashcoreSystem.init({ adapter: new MemoryAdapter() })

			const caps = FlashcoreSystem.capabilities()

			expect(caps).toHaveProperty('scan')
			expect(caps).toHaveProperty('setIfNotExists')
			expect(caps).toHaveProperty('compareAndSwap')
			expect(caps).toHaveProperty('atomicBatch')
			expect(typeof caps.scan).toBe('boolean')
		})

		it('should reflect adapter capabilities accurately', async () => {
			await FlashcoreSystem.init({ adapter: new ScanOnlyAdapter() })

			const caps = FlashcoreSystem.capabilities()

			expect(caps.scan).toBe(true)
			expect(caps.setIfNotExists).toBe(false)
		})

		it('should throw if not initialized', () => {
			expect(() => FlashcoreSystem.capabilities()).toThrow('not initialized')
		})
	})
})
