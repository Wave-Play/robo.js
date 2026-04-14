/**
 * Flashcore v1 (spec rev 4.3) Phase 0 Tests - Scan Normalization
 *
 * Tests the scanKeys() helper for normalizing array/async-iterable adapter responses.
 */

import {
	scanKeys,
	scanKeysToArray,
	hasScanCapability,
	MemoryAdapter,
	type FlashcoreAdapter
} from '../helpers/flashcore-compat.js'

describe('Scan Normalization', () => {
	describe('scanKeys()', () => {
		it('should yield keys from array-returning scan', async () => {
			const adapter = new MemoryAdapter()
			adapter.set('user:1', 'alice')
			adapter.set('user:2', 'bob')
			adapter.set('post:1', 'content')

			const keys: string[] = []
			for await (const key of scanKeys(adapter, 'user:')) {
				keys.push(key)
			}

			expect(keys).toHaveLength(2)
			expect(keys).toContain('user:1')
			expect(keys).toContain('user:2')
		})

		it('should yield nothing for adapter without scan', async () => {
			const minimalAdapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {}
				// No scan method
			}

			const keys: string[] = []
			for await (const key of scanKeys(minimalAdapter, 'prefix:')) {
				keys.push(key)
			}

			expect(keys).toHaveLength(0)
		})

		it('should handle async-iterable scan', async () => {
			// Adapter that returns async iterable
			const adapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {},
				scan: async function* (prefix: string) {
					const allKeys = ['user:1', 'user:2', 'post:1']
					for (const key of allKeys) {
						if (key.startsWith(prefix)) {
							yield key
						}
					}
				}
			}

			const keys: string[] = []
			for await (const key of scanKeys(adapter, 'user:')) {
				keys.push(key)
			}

			expect(keys).toHaveLength(2)
			expect(keys).toContain('user:1')
			expect(keys).toContain('user:2')
		})

		it('should handle Promise<Array> scan', async () => {
			const adapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {},
				scan: async (prefix: string) => {
					return ['async:1', 'async:2', 'other:1'].filter((k) => k.startsWith(prefix))
				}
			}

			const keys: string[] = []
			for await (const key of scanKeys(adapter, 'async:')) {
				keys.push(key)
			}

			expect(keys).toHaveLength(2)
			expect(keys).toContain('async:1')
			expect(keys).toContain('async:2')
		})

		it('should handle Promise<AsyncIterable> scan', async () => {
			const adapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {},
				scan: async (prefix: string) => {
					// Return a promise that resolves to an async iterable
					return (async function* () {
						const keys = ['prom:1', 'prom:2', 'other:1']
						for (const key of keys) {
							if (key.startsWith(prefix)) {
								yield key
							}
						}
					})()
				}
			}

			const keys: string[] = []
			for await (const key of scanKeys(adapter, 'prom:')) {
				keys.push(key)
			}

			expect(keys).toHaveLength(2)
		})

		it('should handle empty results', async () => {
			const adapter = new MemoryAdapter()
			adapter.set('user:1', 'alice')

			const keys: string[] = []
			for await (const key of scanKeys(adapter, 'nonexistent:')) {
				keys.push(key)
			}

			expect(keys).toHaveLength(0)
		})
	})

	describe('scanKeysToArray()', () => {
		it('should collect all keys into an array', async () => {
			const adapter = new MemoryAdapter()
			adapter.set('item:1', 'a')
			adapter.set('item:2', 'b')
			adapter.set('item:3', 'c')

			const keys = await scanKeysToArray(adapter, 'item:')

			expect(keys).toHaveLength(3)
			expect(keys).toContain('item:1')
			expect(keys).toContain('item:2')
			expect(keys).toContain('item:3')
		})

		it('should return empty array for no matches', async () => {
			const adapter = new MemoryAdapter()
			adapter.set('foo:1', 'x')

			const keys = await scanKeysToArray(adapter, 'bar:')

			expect(keys).toEqual([])
		})
	})

	describe('hasScanCapability()', () => {
		it('should return true for adapters with scan', () => {
			const adapter = new MemoryAdapter()
			expect(hasScanCapability(adapter)).toBe(true)
		})

		it('should return false for adapters without scan', () => {
			const minimalAdapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {}
			}

			expect(hasScanCapability(minimalAdapter)).toBe(false)
		})
	})

	describe('Edge cases', () => {
		it('should handle scan returning empty array', async () => {
			const adapter: FlashcoreAdapter = {
				get: () => undefined,
				set: () => true,
				delete: () => true,
				has: () => false,
				clear: () => {},
				scan: () => []
			}

			const keys: string[] = []
			for await (const key of scanKeys(adapter, 'any:')) {
				keys.push(key)
			}

			expect(keys).toEqual([])
		})

		it('should work with prefix matching special chars', async () => {
			const adapter = new MemoryAdapter()
			adapter.set('_model:User:catalog', 'data')
			adapter.set('_model:Post:catalog', 'data')
			adapter.set('user:1', 'alice')

			const modelKeys: string[] = []
			for await (const key of scanKeys(adapter, '_model:')) {
				modelKeys.push(key)
			}

			expect(modelKeys).toHaveLength(2)
			expect(modelKeys.every((k) => k.startsWith('_model:'))).toBe(true)
		})
	})
})
