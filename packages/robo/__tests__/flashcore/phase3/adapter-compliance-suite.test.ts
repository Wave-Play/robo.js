/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Adapter Compliance Suite
 *
 * Shared tests for verifying adapters implement the correct semantics.
 */

import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { FileAdapter } from '../../../src/flashcore/adapter/builtins/file.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import type { FlashcoreAdapter } from '../../../src/flashcore/adapter/types.js'

type TestedAdapter = FlashcoreAdapter<string, unknown>

interface AdapterTestConfig {
	name: string
	create: () => TestedAdapter
	cleanup?: () => Promise<void>
}

const testDir = join(tmpdir(), 'flashcore-test-' + Date.now())

const adapters: AdapterTestConfig[] = [
	{
		name: 'MemoryAdapter',
		create: () => new MemoryAdapter()
	},
	{
		name: 'FileAdapter',
		create: () => new FileAdapter({ baseDir: testDir }),
		cleanup: async () => {
			try {
				await rm(testDir, { recursive: true, force: true })
			} catch {
				// Ignore
			}
		}
	}
]

describe.each(adapters)('Adapter Compliance: $name', ({ name, create, cleanup }: AdapterTestConfig) => {
	let adapter: TestedAdapter

	beforeEach(async () => {
		adapter = create()
		if (typeof adapter.init === 'function') {
			await adapter.init()
		}
	})

	afterEach(async () => {
		if (typeof adapter.shutdown === 'function') {
			await adapter.shutdown()
		}
		if (cleanup) {
			await cleanup()
		}
	})

	describe('Basic CRUD Operations', () => {
		it('should return undefined for non-existent keys', async () => {
			const result = await adapter.get('nonexistent')
			expect(result).toBeUndefined()
		})

		it('should set and get a value', async () => {
			const key = 'test-key'
			const value = { name: 'test', count: 42 }

			const setResult = await adapter.set(key, value)
			expect(setResult).toBe(true)

			const getResult = await adapter.get(key)
			expect(getResult).toEqual(value)
		})

		it('should overwrite existing values', async () => {
			const key = 'overwrite-key'

			await adapter.set(key, { version: 1 })
			await adapter.set(key, { version: 2 })

			const result = await adapter.get(key)
			expect(result).toEqual({ version: 2 })
		})

		it('should delete existing keys', async () => {
			const key = 'delete-key'
			await adapter.set(key, 'value')

			const deleteResult = await adapter.delete(key)
			expect(deleteResult).toBe(true)

			const getResult = await adapter.get(key)
			expect(getResult).toBeUndefined()
		})

		it('should return false when deleting non-existent keys', async () => {
			const result = await adapter.delete('nonexistent')
			expect(result).toBe(false)
		})

		it('should correctly report has() for existing keys', async () => {
			const key = 'has-key'
			await adapter.set(key, 'value')

			const result = await adapter.has(key)
			expect(result).toBe(true)
		})

		it('should correctly report has() for non-existent keys', async () => {
			const result = await adapter.has('nonexistent')
			expect(result).toBe(false)
		})

		it('should return true for falsy values', async () => {
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
			expect(await adapter.get('null')).toBe(null)
		})
	})

	describe('Clear Operation', () => {
		it('should remove all keys', async () => {
			await adapter.set('key1', 'value1')
			await adapter.set('key2', 'value2')
			await adapter.set('key3', 'value3')

			await adapter.clear()

			expect(await adapter.has('key1')).toBe(false)
			expect(await adapter.has('key2')).toBe(false)
			expect(await adapter.has('key3')).toBe(false)
		})
	})

	describe('Scan Capability', () => {
		it('should scan keys by prefix', async () => {
			await adapter.set('user:1', { id: 1 })
			await adapter.set('user:2', { id: 2 })
			await adapter.set('post:1', { id: 1 })
			await adapter.set('post:2', { id: 2 })

			if (adapter.scan) {
				const userKeys = await adapter.scan('user:') as string[]
				expect(userKeys).toHaveLength(2)
				expect(userKeys.sort()).toEqual(['user:1', 'user:2'].sort())

				const postKeys = await adapter.scan('post:') as string[]
				expect(postKeys).toHaveLength(2)
				expect(postKeys.sort()).toEqual(['post:1', 'post:2'].sort())

				const allKeys = await adapter.scan('')
				expect(allKeys).toHaveLength(4)
			}
		})

		it('should return empty array for non-matching prefix', async () => {
			await adapter.set('user:1', { id: 1 })

			if (adapter.scan) {
				const result = await adapter.scan('nonexistent:')
				expect(result).toEqual([])
			}
		})
	})

	describe('setIfNotExists Capability', () => {
		it('should set value if key does not exist', async () => {
			if (adapter.setIfNotExists) {
				const result = await adapter.setIfNotExists('new-key', 'value')
				expect(result).toBe(true)
				expect(await adapter.get('new-key')).toBe('value')
			}
		})

		it('should not overwrite existing value', async () => {
			if (adapter.setIfNotExists) {
				await adapter.set('existing-key', 'original')

				const result = await adapter.setIfNotExists('existing-key', 'new')
				expect(result).toBe(false)
				expect(await adapter.get('existing-key')).toBe('original')
			}
		})
	})

	describe('compareAndSwap Capability', () => {
		it('should swap value if current matches expected', async () => {
			if (adapter.compareAndSwap) {
				const original = { version: 1 }
				const updated = { version: 2 }

				await adapter.set('cas-key', original)

				const result = await adapter.compareAndSwap('cas-key', original, updated)
				expect(result).toBe(true)
				expect(await adapter.get('cas-key')).toEqual(updated)
			}
		})

		it('should not swap if current differs from expected', async () => {
			if (adapter.compareAndSwap) {
				const original = { version: 1 }
				const wrong = { version: 0 }
				const updated = { version: 2 }

				await adapter.set('cas-key', original)

				const result = await adapter.compareAndSwap('cas-key', wrong, updated)
				expect(result).toBe(false)
				expect(await adapter.get('cas-key')).toEqual(original)
			}
		})
	})

	describe('atomicBatch Capability', () => {
		it('should apply batch operations atomically', async () => {
			if (adapter.atomicBatch) {
				await adapter.set('batch-1', { count: 0 })

				await adapter.atomicBatch([
					{ type: 'set', key: 'batch-1', value: { count: 1 } },
					{ type: 'set', key: 'batch-2', value: { count: 2 } },
					{ type: 'set', key: 'batch-3', value: { count: 3 } }
				])

				expect(await adapter.get('batch-1')).toEqual({ count: 1 })
				expect(await adapter.get('batch-2')).toEqual({ count: 2 })
				expect(await adapter.get('batch-3')).toEqual({ count: 3 })
			}
		})

		it('should handle batch deletes', async () => {
			if (adapter.atomicBatch) {
				await adapter.set('del-1', 'value')
				await adapter.set('del-2', 'value')

				await adapter.atomicBatch([
					{ type: 'delete', key: 'del-1' },
					{ type: 'delete', key: 'del-2' }
				])

				expect(await adapter.has('del-1')).toBe(false)
				expect(await adapter.has('del-2')).toBe(false)
			}
		})

		it('should reject batch with failed check operation', async () => {
			if (adapter.atomicBatch) {
				await adapter.set('check-key', { _version: 1, data: 'old' })

				// atomicBatch can be sync or async, so we need to handle both
				let threw = false
				try {
					const result = adapter.atomicBatch([
						{ type: 'check', key: 'check-key', expectedVersion: 0 }, // Wrong version
						{ type: 'set', key: 'check-key', value: { _version: 2, data: 'new' } }
					])
					// If it returns a promise, wait for it
					if (result && typeof result === 'object' && 'then' in result) {
						await result
					}
				} catch {
					threw = true
				}

				expect(threw).toBe(true)

				// Value should be unchanged
				expect(await adapter.get('check-key')).toEqual({ _version: 1, data: 'old' })
			}
		})
	})

	describe('Complex Values', () => {
		it('should handle nested objects', async () => {
			const complex = {
				user: {
					profile: {
						settings: {
							theme: 'dark',
							notifications: true
						}
					}
				},
				metadata: {
					created: '2024-01-01',
					tags: ['a', 'b', 'c']
				}
			}

			await adapter.set('complex', complex)
			const result = await adapter.get('complex')
			expect(result).toEqual(complex)
		})

		it('should handle arrays', async () => {
			const array = [1, 'two', { three: 3 }, [4, 5, 6]]

			await adapter.set('array', array)
			const result = await adapter.get('array')
			expect(result).toEqual(array)
		})

		it('should handle unicode strings', async () => {
			const unicode = {
				emoji: '🚀🎉',
				chinese: '你好世界',
				arabic: 'مرحبا',
				special: '©®™'
			}

			await adapter.set('unicode', unicode)
			const result = await adapter.get('unicode')
			expect(result).toEqual(unicode)
		})
	})

	describe('Adapter Name', () => {
		it('should have a name property', () => {
			expect(adapter.name).toBeDefined()
			expect(typeof adapter.name).toBe('string')
			expect(adapter.name.length).toBeGreaterThan(0)
		})
	})
})
