/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Wrapper Transparency Tests
 *
 * Tests that wrappers don't change data semantics.
 */

// Uses Jest globals
import { MemoryAdapter } from 'robo.js/flashcore'
import { CacheAdapter } from '../../src/adapters/cache.js'
import { CompressionAdapter } from '../../src/adapters/compression.js'
import { EncryptionAdapter } from '../../src/adapters/encryption.js'
import { ResilienceAdapter } from '../../src/adapters/resilience.js'
import { AdapterBuilder } from '../../src/adapters/builder.js'
import type { FlashcoreAdapter } from 'robo.js/flashcore'

describe('Wrapper Transparency', () => {
	const testData: Record<string, unknown> = {
		string: 'hello world',
		number: 42,
		boolean: true,
		null: null,
		nested: {
			array: [1, 2, 3],
			object: { deep: { nested: 'value' } }
		},
		unicode: '日本語 🎉'
	}

	const testCases: Array<{
		name: string
		createAdapter: () => FlashcoreAdapter
	}> = [
		{
			name: 'CacheAdapter',
			createAdapter: () => new CacheAdapter(new MemoryAdapter())
		},
		{
			name: 'CompressionAdapter',
			createAdapter: () => new CompressionAdapter(new MemoryAdapter(), { threshold: 10 })
		},
		{
			name: 'EncryptionAdapter',
			createAdapter: () => new EncryptionAdapter(new MemoryAdapter(), {
				key: 'test-key-for-encryption-testing'
			})
		},
		{
			name: 'ResilienceAdapter',
			createAdapter: () => new ResilienceAdapter(new MemoryAdapter())
		},
		{
			name: 'Stacked Wrappers',
			createAdapter: () => new AdapterBuilder(new MemoryAdapter())
				.withResilience()
				.withCompression({ threshold: 10 })
				.withEncryption({ key: 'stack-test-key-for-encryption' })
				.withCache({ maxSize: 100 })
				.build()
		}
	]

	describe.each(testCases)('$name', ({ createAdapter }) => {
		let adapter: FlashcoreAdapter

		beforeEach(() => {
			adapter = createAdapter()
		})

		it('should round-trip complex data correctly', async () => {
			await adapter.set('complex', testData)
			const result = await adapter.get('complex')
			expect(result).toEqual(testData)
		})

		it('should preserve null values', async () => {
			await adapter.set('null', null)
			expect(await adapter.get('null')).toBe(null)
		})

		it('should preserve zero', async () => {
			await adapter.set('zero', 0)
			expect(await adapter.get('zero')).toBe(0)
		})

		it('should preserve empty string', async () => {
			await adapter.set('empty', '')
			expect(await adapter.get('empty')).toBe('')
		})

		it('should preserve false', async () => {
			await adapter.set('false', false)
			expect(await adapter.get('false')).toBe(false)
		})

		it('should return undefined for non-existent keys', async () => {
			const result = await adapter.get('nonexistent')
			expect(result).toBeUndefined()
		})

		it('should correctly report has() for existing keys', async () => {
			await adapter.set('exists', 'value')
			expect(await adapter.has('exists')).toBe(true)
		})

		it('should correctly report has() for non-existent keys', async () => {
			expect(await adapter.has('nonexistent')).toBe(false)
		})

		it('should correctly report has() for falsy values', async () => {
			await adapter.set('zero', 0)
			await adapter.set('false', false)
			await adapter.set('empty', '')
			await adapter.set('null', null)

			expect(await adapter.has('zero')).toBe(true)
			expect(await adapter.has('false')).toBe(true)
			expect(await adapter.has('empty')).toBe(true)
			expect(await adapter.has('null')).toBe(true)
		})

		it('should delete keys correctly', async () => {
			await adapter.set('toDelete', 'value')
			await adapter.delete('toDelete')
			expect(await adapter.has('toDelete')).toBe(false)
		})

		it('should clear all keys', async () => {
			await adapter.set('a', 1)
			await adapter.set('b', 2)
			await adapter.clear()
			expect(await adapter.has('a')).toBe(false)
			expect(await adapter.has('b')).toBe(false)
		})
	})

	describe('Capability Propagation', () => {
		it('should propagate scan from MemoryAdapter', async () => {
			const wrapped = new CacheAdapter(
				new CompressionAdapter(
					new EncryptionAdapter(
						new ResilienceAdapter(
							new MemoryAdapter()
						),
						{ key: 'propagation-test-encryption' }
					)
				)
			)

			expect(wrapped.scan).toBeDefined()
		})

		it('should propagate setIfNotExists from MemoryAdapter', async () => {
			const wrapped = new CacheAdapter(new MemoryAdapter())
			expect(wrapped.setIfNotExists).toBeDefined()
		})

		it('should propagate compareAndSwap from MemoryAdapter', async () => {
			const wrapped = new CacheAdapter(new MemoryAdapter())
			expect(wrapped.compareAndSwap).toBeDefined()
		})

		it('should propagate atomicBatch from MemoryAdapter', async () => {
			const wrapped = new CacheAdapter(new MemoryAdapter())
			expect(wrapped.atomicBatch).toBeDefined()
		})

		it('should work through stacked wrappers', async () => {
			const stacked = new AdapterBuilder(new MemoryAdapter())
				.withResilience()
				.withCompression()
				.withEncryption({ key: 'stacked-capability-test-key' })
				.withCache()
				.build()

			// All capabilities should propagate
			expect(stacked.scan).toBeDefined()
			expect(stacked.setIfNotExists).toBeDefined()

			// Test that they actually work
			await stacked.set('user:1', { id: 1 })
			await stacked.set('user:2', { id: 2 })
			await stacked.set('post:1', { id: 1 })

			const keys = await stacked.scan!('user:') as string[]
			expect(keys.sort()).toEqual(['user:1', 'user:2'].sort())

			const sne = await stacked.setIfNotExists!('new', 'value')
			expect(sne).toBe(true)

			const sne2 = await stacked.setIfNotExists!('new', 'other')
			expect(sne2).toBe(false)
		})
	})

	describe('Wrapper Order Independence', () => {
		it('should produce same results regardless of wrapper order', async () => {
			const order1 = new AdapterBuilder(new MemoryAdapter())
				.withCompression({ threshold: 10 })
				.withEncryption({ key: 'order-test-key-encryption' })
				.build()

			const order2 = new AdapterBuilder(new MemoryAdapter())
				.withEncryption({ key: 'order-test-key-encryption' })
				.withCompression({ threshold: 10 })
				.build()

			const value = { data: 'test data for order independence' }

			await order1.set('key', value)
			await order2.set('key', value)

			expect(await order1.get('key')).toEqual(value)
			expect(await order2.get('key')).toEqual(value)
		})
	})
})
