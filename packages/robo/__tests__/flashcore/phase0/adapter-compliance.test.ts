/**
 * Flashcore v1 (spec rev 4.3) Phase 0 Tests - Adapter Compliance
 *
 * Tests MemoryAdapter and KeyvAdapter against the adapter interface.
 */

import {
	MemoryAdapter,
	createMemoryAdapter,
	KeyvAdapter,
	createKeyvAdapter,
	LegacyFileAdapter,
	normalizeCapabilities
} from '../helpers/flashcore-compat.js'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('MemoryAdapter', () => {
	let adapter: MemoryAdapter

	beforeEach(() => {
		adapter = new MemoryAdapter()
	})

	describe('Required Methods', () => {
		it('should get/set values', () => {
			adapter.set('key1', 'value1')
			expect(adapter.get('key1')).toBe('value1')
		})

		it('should return undefined for missing keys', () => {
			expect(adapter.get('nonexistent')).toBeUndefined()
		})

		it('should handle various value types', () => {
			adapter.set('string', 'hello')
			adapter.set('number', 42)
			adapter.set('boolean', true)
			adapter.set('null', null)
			adapter.set('object', { nested: { value: 1 } })
			adapter.set('array', [1, 2, 3])

			expect(adapter.get('string')).toBe('hello')
			expect(adapter.get('number')).toBe(42)
			expect(adapter.get('boolean')).toBe(true)
			expect(adapter.get('null')).toBeNull()
			expect(adapter.get('object')).toEqual({ nested: { value: 1 } })
			expect(adapter.get('array')).toEqual([1, 2, 3])
		})

		it('should delete keys and return correct boolean', () => {
			adapter.set('key', 'value')
			expect(adapter.delete('key')).toBe(true)
			expect(adapter.delete('key')).toBe(false) // Already deleted
			expect(adapter.get('key')).toBeUndefined()
		})

		it('should check key existence correctly', () => {
			adapter.set('key', 'value')
			expect(adapter.has('key')).toBe(true)
			expect(adapter.has('nonexistent')).toBe(false)
		})

		it('should return true for falsy values in has()', () => {
			adapter.set('zero', 0)
			adapter.set('false', false)
			adapter.set('empty', '')
			adapter.set('null', null)

			expect(adapter.has('zero')).toBe(true)
			expect(adapter.has('false')).toBe(true)
			expect(adapter.has('empty')).toBe(true)
			expect(adapter.has('null')).toBe(true)
		})

		it('should clear all data', () => {
			adapter.set('key1', 'value1')
			adapter.set('key2', 'value2')

			adapter.clear()

			expect(adapter.has('key1')).toBe(false)
			expect(adapter.has('key2')).toBe(false)
			expect(adapter.size()).toBe(0)
		})
	})

	describe('Optional Capabilities', () => {
		it('should scan keys by prefix', () => {
			adapter.set('user:1', 'alice')
			adapter.set('user:2', 'bob')
			adapter.set('post:1', 'content')

			const userKeys = adapter.scan('user:')
			expect(userKeys).toHaveLength(2)
			expect(userKeys).toContain('user:1')
			expect(userKeys).toContain('user:2')

			const postKeys = adapter.scan('post:')
			expect(postKeys).toHaveLength(1)
			expect(postKeys).toContain('post:1')
		})

		it('should setIfNotExists atomically', () => {
			// First set should succeed
			expect(adapter.setIfNotExists('unique', 'first')).toBe(true)
			expect(adapter.get('unique')).toBe('first')

			// Second set should fail (key exists)
			expect(adapter.setIfNotExists('unique', 'second')).toBe(false)
			expect(adapter.get('unique')).toBe('first') // Unchanged
		})

		it('should compareAndSwap correctly', () => {
			adapter.set('versioned', { value: 1 })

			// Correct expected value - swap succeeds
			const success = adapter.compareAndSwap('versioned', { value: 1 }, { value: 2 })
			expect(success).toBe(true)
			expect(adapter.get('versioned')).toEqual({ value: 2 })

			// Wrong expected value - swap fails
			const failure = adapter.compareAndSwap('versioned', { value: 1 }, { value: 3 })
			expect(failure).toBe(false)
			expect(adapter.get('versioned')).toEqual({ value: 2 }) // Unchanged
		})

		it('should execute atomicBatch operations', () => {
			adapter.set('existing', { _version: 1, data: 'old' })

			adapter.atomicBatch([
				{ type: 'set', key: 'new1', value: 'value1' },
				{ type: 'set', key: 'new2', value: 'value2' },
				{ type: 'delete', key: 'toDelete' }
			])

			expect(adapter.get('new1')).toBe('value1')
			expect(adapter.get('new2')).toBe('value2')
			expect(adapter.has('toDelete')).toBe(false)
		})

		it('should validate check operations in atomicBatch', () => {
			adapter.set('checked', { _version: 1 })

			// Should fail due to version mismatch
			expect(() => {
				adapter.atomicBatch([
					{ type: 'check', key: 'checked', expectedVersion: 999 }, // Wrong version
					{ type: 'set', key: 'new', value: 'data' }
				])
			}).toThrow(/version check failed/)

			// Should not have applied the set
			expect(adapter.has('new')).toBe(false)
		})
	})

	describe('Capability Detection', () => {
		it('should report full capabilities', () => {
			const caps = normalizeCapabilities(adapter)

			expect(caps.acid).toBe(true) // Has atomicBatch
			expect(caps.walEnabled).toBe(true) // Has scan
			expect(caps.atomicBatch).toBe(true)
			expect(caps.nativeTransactions).toBe(false)
			expect(caps.setIfNotExists).toBe(true)
			expect(caps.compareAndSwap).toBe(true)
			expect(caps.scan).toBe(true)
			expect(caps.adapter).toBe('MemoryAdapter')
			expect(caps.isolation).toBe('serializable')
		})
	})

	describe('Testing Utilities', () => {
		it('should provide size()', () => {
			expect(adapter.size()).toBe(0)
			adapter.set('key', 'value')
			expect(adapter.size()).toBe(1)
		})

		it('should provide keys()', () => {
			adapter.set('a', 1)
			adapter.set('b', 2)
			const keys = adapter.keys()
			expect(keys).toContain('a')
			expect(keys).toContain('b')
		})

		it('should snapshot and restore', () => {
			adapter.set('key1', 'value1')
			adapter.set('key2', 'value2')

			const snapshot = adapter.snapshot()

			adapter.clear()
			expect(adapter.size()).toBe(0)

			adapter.restore(snapshot)
			expect(adapter.get('key1')).toBe('value1')
			expect(adapter.get('key2')).toBe('value2')
		})
	})

	describe('Factory function', () => {
		it('should create typed adapter', () => {
			const typedAdapter = createMemoryAdapter<string, number>()
			typedAdapter.set('count', 42)
			expect(typedAdapter.get('count')).toBe(42)
		})
	})
})

describe('KeyvAdapter', () => {
	// Mock Keyv-like object for testing
	function createMockKeyv<V>(): {
		storage: Map<string, V>
		get(key: string): Promise<V | undefined>
		set(key: string, value: V): Promise<true>
		delete(key: string): Promise<boolean>
		has(key: string): Promise<boolean>
		clear(): Promise<void>
	} {
		const storage = new Map<string, V>()

		return {
			storage,
			async get(key: string) {
				return storage.get(key)
			},
			async set(key: string, value: V) {
				storage.set(key, value)
				return true as const
			},
			async delete(key: string) {
				return storage.delete(key)
			},
			async has(key: string) {
				return storage.has(key)
			},
			async clear() {
				storage.clear()
			}
		}
	}

	it('should wrap Keyv-like object', async () => {
		const mockKeyv = createMockKeyv()
		const adapter = new KeyvAdapter(mockKeyv)

		await adapter.set('key', 'value')
		expect(await adapter.get('key')).toBe('value')
	})

	it('should implement required methods', async () => {
		const mockKeyv = createMockKeyv()
		const adapter = new KeyvAdapter(mockKeyv)

		// set/get
		expect(await adapter.set('test', { data: 1 })).toBe(true)
		expect(await adapter.get('test')).toEqual({ data: 1 })

		// delete
		expect(await adapter.delete('test')).toBe(true)
		expect(await adapter.delete('test')).toBe(false)

		// has
		await adapter.set('exists', 'yes')
		expect(await adapter.has('exists')).toBe(true)
		expect(await adapter.has('nope')).toBe(false)

		// clear
		await adapter.set('a', 1)
		await adapter.set('b', 2)
		await adapter.clear()
		expect(await adapter.has('a')).toBe(false)
		expect(await adapter.has('b')).toBe(false)
	})

	it('should report minimal capabilities', () => {
		const mockKeyv = createMockKeyv()
		const adapter = new KeyvAdapter(mockKeyv)
		const caps = normalizeCapabilities(adapter)

		expect(caps.acid).toBe(false) // No atomicBatch or transaction
		expect(caps.walEnabled).toBe(false) // No scan
		expect(caps.atomicBatch).toBe(false)
		expect(caps.nativeTransactions).toBe(false)
		expect(caps.setIfNotExists).toBe(false)
		expect(caps.scan).toBe(false)
		expect(caps.adapter).toBe('KeyvAdapter')
	})

	it('should use factory function', () => {
		const mockKeyv = createMockKeyv()
		const adapter = createKeyvAdapter(mockKeyv)
		expect(adapter).toBeInstanceOf(KeyvAdapter)
	})
})

describe('LegacyFileAdapter', () => {
	let dir: string
	let adapter: LegacyFileAdapter<string, unknown>

	beforeEach(async () => {
		dir = await fs.mkdtemp(join(tmpdir(), 'flashcore-legacy-'))
		adapter = new LegacyFileAdapter({ dataDir: dir })
		await adapter.init()
	})

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true })
	})

	it('should get/set values', async () => {
		await adapter.set('key1', 'value1')
		expect(await adapter.get('key1')).toBe('value1')
	})

	it('should return undefined for missing keys', async () => {
		expect(await adapter.get('missing')).toBeUndefined()
	})

	it('should return true for falsy values in has()', async () => {
		await adapter.set('zero', 0)
		await adapter.set('false', false)
		await adapter.set('empty', '')
		await adapter.set('null', null)

		expect(await adapter.has('zero')).toBe(true)
		expect(await adapter.has('false')).toBe(true)
		expect(await adapter.has('empty')).toBe(true)
		expect(await adapter.has('null')).toBe(true)

		expect(await adapter.get('zero')).toBe(0)
		expect(await adapter.get('false')).toBe(false)
		expect(await adapter.get('empty')).toBe('')
		expect(await adapter.get('null')).toBeNull()
	})

	it('should not leave temp files after set()', async () => {
		await adapter.set('key', { ok: true })
		const files = await fs.readdir(dir)
		expect(files.some(f => f.includes('.tmp.'))).toBe(false)
	})

	it('should delete keys and return correct boolean', async () => {
		await adapter.set('key', 'value')
		expect(await adapter.delete('key')).toBe(true)
		expect(await adapter.delete('key')).toBe(false)
		expect(await adapter.get('key')).toBeUndefined()
	})

	it('should clear all data', async () => {
		await adapter.set('key1', 'value1')
		await adapter.set('key2', 'value2')

		await adapter.clear()

		expect(await adapter.has('key1')).toBe(false)
		expect(await adapter.has('key2')).toBe(false)
	})
})
