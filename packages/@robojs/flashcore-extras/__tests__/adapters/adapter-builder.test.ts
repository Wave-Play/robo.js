/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - AdapterBuilder Tests
 *
 * Tests the fluent AdapterBuilder API for stacking wrappers.
 */

// Uses Jest globals
import { AdapterBuilder, AdapterPresets, buildAdapter } from '../../src/adapters/builder.js'
import { MemoryAdapter } from 'robo.js/flashcore'
import { CacheAdapter } from '../../src/adapters/cache.js'
import { CompressionAdapter } from '../../src/adapters/compression.js'
import { EncryptionAdapter } from '../../src/adapters/encryption.js'
import { ResilienceAdapter } from '../../src/adapters/resilience.js'

describe('AdapterBuilder', () => {
	describe('Basic Building', () => {
		it('should return base adapter when no wrappers added', () => {
			const base = new MemoryAdapter()
			const result = new AdapterBuilder(base).build()

			expect(result).toBe(base)
		})

		it('should accept any adapter as base', () => {
			const base = new MemoryAdapter()
			const builder = new AdapterBuilder(base)

			expect(builder.build()).toBe(base)
		})
	})

	describe('Single Wrapper', () => {
		it('should add CacheAdapter', () => {
			const result = new AdapterBuilder(new MemoryAdapter())
				.withCache()
				.build()

			expect(result).toBeInstanceOf(CacheAdapter)
		})

		it('should add CompressionAdapter', () => {
			const result = new AdapterBuilder(new MemoryAdapter())
				.withCompression()
				.build()

			expect(result).toBeInstanceOf(CompressionAdapter)
		})

		it('should add EncryptionAdapter', () => {
			const result = new AdapterBuilder(new MemoryAdapter())
				.withEncryption({ key: 'test-key-for-encryption' })
				.build()

			expect(result).toBeInstanceOf(EncryptionAdapter)
		})

		it('should add ResilienceAdapter', () => {
			const result = new AdapterBuilder(new MemoryAdapter())
				.withResilience()
				.build()

			expect(result).toBeInstanceOf(ResilienceAdapter)
		})
	})

	describe('Wrapper Options', () => {
		it('should pass cache options', () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCache({ maxSize: 500, maxAge: 60000 })
				.build() as CacheAdapter

			const config = adapter.getConfig()
			expect(config.maxSize).toBe(500)
			expect(config.maxAge).toBe(60000)
		})

		it('should pass compression options', () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCompression({ threshold: 256, level: 9 })
				.build() as CompressionAdapter

			const config = adapter.getConfig()
			expect(config.threshold).toBe(256)
			expect(config.level).toBe(9)
		})

		it('should pass encryption options', () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withEncryption({ key: 'my-secret-key', algorithm: 'aes-256-cbc' })
				.build() as EncryptionAdapter

			const config = adapter.getConfig()
			expect(config.algorithm).toBe('aes-256-cbc')
		})

		it('should pass resilience options', () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withResilience({ maxRetries: 5, retryBaseDelay: 200 })
				.build() as ResilienceAdapter

			const config = adapter.getConfig()
			expect(config.maxRetries).toBe(5)
			expect(config.retryBaseDelay).toBe(200)
		})
	})

	describe('Fluent Chaining', () => {
		it('should support method chaining', () => {
			const builder = new AdapterBuilder(new MemoryAdapter())

			const chain1 = builder.withCache()
			expect(chain1).toBe(builder)

			const chain2 = chain1.withCompression()
			expect(chain2).toBe(builder)

			const chain3 = chain2.withEncryption({ key: 'test-key' })
			expect(chain3).toBe(builder)

			const chain4 = chain3.withResilience()
			expect(chain4).toBe(builder)
		})

		it('should build stacked wrappers', () => {
			const result = new AdapterBuilder(new MemoryAdapter())
				.withResilience()
				.withCompression()
				.withCache()
				.build()

			// Outermost wrapper should be CacheAdapter (last added)
			expect(result).toBeInstanceOf(CacheAdapter)
		})
	})

	describe('Wrapper Order', () => {
		it('should apply wrappers in order (last added is outermost)', async () => {
			// Order: resilience -> compression -> cache
			// Data flow: app -> cache -> compression -> resilience -> base
			const result = new AdapterBuilder(new MemoryAdapter())
				.withResilience()
				.withCompression()
				.withCache()
				.build()

			// CacheAdapter is the outermost
			expect(result).toBeInstanceOf(CacheAdapter)

			// Test that data flows through correctly
			await result.set('key', 'value')
			expect(await result.get('key')).toBe('value')
		})

		it('should preserve wrapper order with encryption', async () => {
			// Order: resilience -> compression -> encryption -> cache
			const result = new AdapterBuilder(new MemoryAdapter())
				.withResilience()
				.withCompression({ threshold: 10 })
				.withEncryption({ key: 'order-test-key-for-encryption' })
				.withCache()
				.build()

			expect(result).toBeInstanceOf(CacheAdapter)

			// Data should round-trip correctly through all layers
			const testData = { nested: { value: 'test' }, array: [1, 2, 3] }
			await result.set('complex', testData)
			expect(await result.get('complex')).toEqual(testData)
		})
	})

	describe('Data Transparency', () => {
		it('should round-trip data through all wrappers', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withResilience()
				.withCompression({ threshold: 10 })
				.withEncryption({ key: 'transparency-test-key' })
				.withCache({ maxSize: 100 })
				.build()

			const testCases = [
				{ key: 'string', value: 'hello world' },
				{ key: 'number', value: 42 },
				{ key: 'boolean', value: true },
				{ key: 'null', value: null },
				{ key: 'object', value: { a: 1, b: 2 } },
				{ key: 'array', value: [1, 2, 3] },
				{ key: 'nested', value: { deep: { nested: { value: 'found' } } } },
				{ key: 'unicode', value: '日本語 🎉' }
			]

			for (const { key, value } of testCases) {
				await adapter.set(key, value)
				expect(await adapter.get(key)).toEqual(value)
			}
		})

		it('should preserve has() semantics', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCache()
				.withCompression()
				.build()

			expect(await adapter.has('missing')).toBe(false)

			await adapter.set('exists', 'value')
			expect(await adapter.has('exists')).toBe(true)

			await adapter.delete('exists')
			expect(await adapter.has('exists')).toBe(false)
		})

		it('should preserve clear() semantics', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCache()
				.build()

			await adapter.set('a', 1)
			await adapter.set('b', 2)

			await adapter.clear()

			expect(await adapter.has('a')).toBe(false)
			expect(await adapter.has('b')).toBe(false)
		})
	})

	describe('Capability Propagation', () => {
		it('should propagate scan capability', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCache()
				.withCompression()
				.build()

			expect(adapter.scan).toBeDefined()

			await adapter.set('user:1', { id: 1 })
			await adapter.set('user:2', { id: 2 })
			await adapter.set('post:1', { id: 1 })

			const keys = await adapter.scan!('user:') as string[]
			expect(keys.sort()).toEqual(['user:1', 'user:2'].sort())
		})

		it('should propagate setIfNotExists capability', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCache()
				.build()

			expect(adapter.setIfNotExists).toBeDefined()

			const result1 = await adapter.setIfNotExists!('key', 'first')
			expect(result1).toBe(true)

			const result2 = await adapter.setIfNotExists!('key', 'second')
			expect(result2).toBe(false)

			expect(await adapter.get('key')).toBe('first')
		})

		it('should propagate compareAndSwap capability', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withResilience()
				.build()

			expect(adapter.compareAndSwap).toBeDefined()

			await adapter.set('counter', 0)

			const success = await adapter.compareAndSwap!('counter', 0, 1)
			expect(success).toBe(true)
			expect(await adapter.get('counter')).toBe(1)

			const fail = await adapter.compareAndSwap!('counter', 0, 2)
			expect(fail).toBe(false)
			expect(await adapter.get('counter')).toBe(1)
		})

		it('should propagate atomicBatch capability', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCompression()
				.build()

			expect(adapter.atomicBatch).toBeDefined()

			await adapter.atomicBatch!([
				{ type: 'set', key: 'a', value: 1 },
				{ type: 'set', key: 'b', value: 2 },
				{ type: 'set', key: 'c', value: 3 }
			])

			expect(await adapter.get('a')).toBe(1)
			expect(await adapter.get('b')).toBe(2)
			expect(await adapter.get('c')).toBe(3)
		})
	})

	describe('Factory Function', () => {
		it('should create builder via buildAdapter()', () => {
			const builder = buildAdapter(new MemoryAdapter())

			expect(builder).toBeInstanceOf(AdapterBuilder)
		})

		it('should support chaining from factory', () => {
			const adapter = buildAdapter(new MemoryAdapter())
				.withCache()
				.build()

			expect(adapter).toBeInstanceOf(CacheAdapter)
		})
	})

	describe('AdapterPresets', () => {
		it('should create production preset', async () => {
			const adapter = AdapterPresets.production(new MemoryAdapter(), {
				encryptionKey: 'production-test-key-for-encryption'
			})

			// Production should have resilience, compression, encryption, cache
			await adapter.set('test', 'value')
			expect(await adapter.get('test')).toBe('value')
		})

		it('should create development preset', async () => {
			const adapter = AdapterPresets.development(new MemoryAdapter())

			// Development should have just cache
			expect(adapter).toBeInstanceOf(CacheAdapter)

			await adapter.set('dev', 'test')
			expect(await adapter.get('dev')).toBe('test')
		})

		it('should create testing preset', async () => {
			const adapter = AdapterPresets.testing(new MemoryAdapter())

			// Testing preset has just a cache wrapper (lightweight for tests)
			expect(adapter).toBeInstanceOf(CacheAdapter)

			await adapter.set('test', 'value')
			expect(await adapter.get('test')).toBe('value')
		})

		it('should create resilient preset', async () => {
			const adapter = AdapterPresets.resilient(new MemoryAdapter())

			// Resilient preset has: Cache → Resilience → Adapter
			// So the outermost is CacheAdapter
			expect(adapter).toBeInstanceOf(CacheAdapter)

			await adapter.set('resilient', 'data')
			expect(await adapter.get('resilient')).toBe('data')
		})
	})

	describe('Edge Cases', () => {
		it('should handle empty values', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCompression()
				.withEncryption({ key: 'edge-case-key' })
				.build()

			await adapter.set('empty-string', '')
			await adapter.set('zero', 0)
			await adapter.set('false', false)

			expect(await adapter.get('empty-string')).toBe('')
			expect(await adapter.get('zero')).toBe(0)
			expect(await adapter.get('false')).toBe(false)
		})

		it('should handle undefined/missing keys', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCache()
				.build()

			expect(await adapter.get('nonexistent')).toBeUndefined()
		})

		it('should handle delete on missing key', async () => {
			const adapter = new AdapterBuilder(new MemoryAdapter())
				.withCache()
				.build()

			const result = await adapter.delete('missing')
			expect(result).toBe(false)
		})

		it('should handle multiple builds from same builder', () => {
			const builder = new AdapterBuilder(new MemoryAdapter()).withCache()

			const adapter1 = builder.build()
			const adapter2 = builder.build()

			// Each build returns the same stacked adapter
			expect(adapter1).toBe(adapter2)
		})
	})
})
