/**
 * Flashcore v1 (spec rev 4.3) Phase 0 Tests - Initialization and Configuration
 *
 * Tests Flashcore.$.init(), config access, and system API.
 */

import {
	Flashcore,
	FlashcoreSystem,
	FlashcoreError
} from '../helpers/flashcore-compat.js'
import { FileAdapter } from '../helpers/flashcore-compat.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'

describe('Flashcore Initialization', () => {
	afterEach(async () => {
		// Reset state between tests
		await FlashcoreSystem._reset()
	})

	describe('Flashcore.$.init()', () => {
		it('should initialize with default FileAdapter', async () => {
			await Flashcore.$.init()

			expect(Flashcore.$.isInitialized).toBe(true)
			expect(Flashcore.$.config.adapter).toBeInstanceOf(FileAdapter)
		})

		it('should initialize with custom adapter', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({ adapter })

			expect(Flashcore.$.config.adapter).toBe(adapter)
		})

		it('should be idempotent', async () => {
			const adapter = new MemoryAdapter()
			await Flashcore.$.init({ adapter })

			// Second call should not throw
			await Flashcore.$.init({ adapter: new MemoryAdapter() })

			// Should still be using first adapter
			expect(Flashcore.$.config.adapter).toBe(adapter)
		})

		it('should call adapter.init() exactly once', async () => {
			let initCount = 0
			const adapter: MemoryAdapter = new MemoryAdapter()
			const originalInit = adapter.init.bind(adapter)
			adapter.init = () => {
				initCount++
				originalInit()
			}

			await Flashcore.$.init({ adapter })
			await Flashcore.$.init({ adapter }) // Should be ignored

			expect(initCount).toBe(1)
		})

		it('should apply default config values', async () => {
			await Flashcore.$.init()

			expect(Flashcore.$.config.namespaceSeparator).toBe('/')
			expect(Flashcore.$.config.kvReadPreference).toBe('v1')
			expect(Flashcore.$.config.kvWriteMode).toBe('v1')
			expect(Flashcore.$.config.lazyLoading).toBe(true)
		})

		it('should merge custom config with defaults', async () => {
			await Flashcore.$.init({
				namespaceSeparator: '::',
				kvReadPreference: 'v1',
				kvWriteMode: 'dual'
			})

			expect(Flashcore.$.config.namespaceSeparator).toBe('::')
			expect(Flashcore.$.config.kvReadPreference).toBe('v1')
			expect(Flashcore.$.config.kvWriteMode).toBe('dual')
		})

		it('should reject invalid kvReadPreference/kvWriteMode combinations', async () => {
			// v1 read with legacy write can cause writes to not read back when both keys exist
			await expect(
				Flashcore.$.init({
					kvReadPreference: 'v1',
					kvWriteMode: 'legacy'
				})
			).rejects.toThrow(/kvReadPreference.*v1.*kvWriteMode.*legacy/i)

			// Reset for next test
			await FlashcoreSystem._reset()

			// legacy read with v1 write can cause writes to not read back when both keys exist
			await expect(
				Flashcore.$.init({
					kvReadPreference: 'legacy',
					kvWriteMode: 'v1'
				})
			).rejects.toThrow(/kvReadPreference.*legacy.*kvWriteMode.*v1/i)
		})

		it('should freeze config object', async () => {
			await Flashcore.$.init()

			expect(() => {
				// @ts-expect-error - intentionally testing immutability
				Flashcore.$.config.namespaceSeparator = 'changed'
			}).toThrow()
		})
	})

	describe('Flashcore.$.capabilities()', () => {
		it('should throw if not initialized', () => {
			expect(() => Flashcore.$.capabilities()).toThrow(FlashcoreError)
			expect(() => Flashcore.$.capabilities()).toThrow(/not initialized/i)
		})

		it('should return normalized capabilities after init', async () => {
			await Flashcore.$.init()

			const caps = Flashcore.$.capabilities()

			expect(caps.acid).toBe(false)
			expect(caps.walEnabled).toBe(true)
			expect(caps.scan).toBe(true)
			expect(caps.adapter).toBe('FileAdapter')
		})
	})

	describe('Flashcore.$.config', () => {
		it('should throw if not initialized', () => {
			expect(() => Flashcore.$.config).toThrow(FlashcoreError)
			expect(() => Flashcore.$.config).toThrow(/not initialized/i)
		})

		it('should return read-only config after init', async () => {
			await Flashcore.$.init({
				namespaceSeparator: '::'
			})

			expect(Flashcore.$.config.namespaceSeparator).toBe('::')
		})
	})

	describe('Flashcore.$.introspect()', () => {
		it('should throw if not initialized', async () => {
			await expect(Flashcore.$.introspect()).rejects.toThrow(FlashcoreError)
		})

		it('should return introspection data after init', async () => {
			await Flashcore.$.init()

			const intro = await Flashcore.$.introspect()

			expect(intro.models).toEqual([])
			expect(intro.kvNamespaces).toEqual([])
			expect(intro.storage.totalKeys).toBe(0)
			expect(intro.plugins).toEqual([])
			expect(intro.walStatus.pendingEntries).toBe(0)
		})
	})

	describe('Flashcore.$.metrics()', () => {
		it('should return metrics after init', async () => {
			await Flashcore.$.init()

			const metrics = Flashcore.$.metrics()

			expect(metrics.operations.create).toBe(0)
			expect(metrics.operations.update).toBe(0)
			expect(metrics.operations.delete).toBe(0)
			expect(metrics.cacheHits).toBe(0)
			expect(metrics.cacheMisses).toBe(0)
		})

		it('should reset metrics', async () => {
			await Flashcore.$.init()

			// Modify internal state (would normally happen through operations)
			Flashcore.$._incrementMetric('create')
			expect(Flashcore.$.metrics().operations.create).toBe(1)

			Flashcore.$.resetMetrics()
			expect(Flashcore.$.metrics().operations.create).toBe(0)
		})
	})

	describe('Flashcore.$.schema()', () => {
		it('should return schema helper with namespace', async () => {
			await Flashcore.$.init()

			const schema = Flashcore.$.schema('myPlugin')

			expect(schema.namespace).toBe('myPlugin')
		})

		it('should throw on model registration with empty schema', async () => {
			await Flashcore.$.init()

			const schema = Flashcore.$.schema('myPlugin')

			// Empty schema is invalid - requires a primary key
			expect(() => schema.model('User', {})).toThrow(/No primary key defined/i)
		})
	})
})
