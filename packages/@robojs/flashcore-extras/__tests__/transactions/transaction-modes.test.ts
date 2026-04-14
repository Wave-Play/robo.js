/**
 * Flashcore v1 (spec rev 4.3) Phase 8 - Transaction Mode Tests
 *
 * Tests mode selection, validation, and basic transaction operations.
 */

import { FlashcoreSystem, FeatureNotSupportedError } from 'robo.js/flashcore'
import type { FlashcoreAdapter, BatchOperation, AdapterTransaction } from 'robo.js/flashcore'
import {
	resolveAutoMode,
	validateMode,
	hasAcidSupport,
	requiresAcid,
	getModeName
} from '../../src/transactions/modes.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

/**
 * Create a minimal adapter (no transaction support).
 */
function createMinimalAdapter(): FlashcoreAdapter {
	const store = new Map<string, unknown>()
	return {
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => { store.set(key, value); return true },
		delete: async (key: string) => { store.delete(key); return true },
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() }
	}
}

/**
 * Create an adapter with atomicBatch support.
 */
function createBatchAdapter(): FlashcoreAdapter {
	const store = new Map<string, unknown>()
	return {
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => { store.set(key, value); return true },
		delete: async (key: string) => { store.delete(key); return true },
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() },
		atomicBatch: async (ops: BatchOperation<string, unknown>[]) => {
			for (const op of ops) {
				if (op.type === 'set') {
					store.set(op.key, op.value)
				} else if (op.type === 'delete') {
					store.delete(op.key)
				}
			}
		}
	}
}

/**
 * Create an adapter with native transaction support.
 */
function createNativeAdapter(): FlashcoreAdapter {
	const store = new Map<string, unknown>()
	return {
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => { store.set(key, value); return true },
		delete: async (key: string) => { store.delete(key); return true },
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() },
		transaction: async (fn: (tx: AdapterTransaction<string, unknown>) => void | Promise<void>) => {
			const ops: BatchOperation<string, unknown>[] = []
			const tx: AdapterTransaction<string, unknown> = {
				get: async (key) => store.get(key),
				set: (key, value) => { ops.push({ type: 'set', key, value }) },
				delete: (key) => { ops.push({ type: 'delete', key }) }
			}
			await fn(tx)
			// Apply all ops atomically
			for (const op of ops) {
				if (op.type === 'set') {
					store.set(op.key, op.value)
				} else if (op.type === 'delete') {
					store.delete(op.key)
				}
			}
		}
	}
}

describe('Transaction Mode Selection', () => {
	describe('resolveAutoMode', () => {
		it('should resolve to native when adapter has transaction()', () => {
			const adapter = createNativeAdapter()
			expect(resolveAutoMode(adapter)).toBe('native')
		})

		it('should resolve to batch when adapter has atomicBatch() but no transaction()', () => {
			const adapter = createBatchAdapter()
			expect(resolveAutoMode(adapter)).toBe('batch')
		})

		it('should resolve to single when adapter has neither', () => {
			const adapter = createMinimalAdapter()
			expect(resolveAutoMode(adapter)).toBe('single')
		})

		it('should prefer native over batch when both are available', () => {
			const store = new Map<string, unknown>()
			const adapter: FlashcoreAdapter = {
				get: async (key) => store.get(key),
				set: async (key, value) => { store.set(key, value); return true },
				delete: async (key) => { store.delete(key); return true },
				has: async (key) => store.has(key),
				clear: async () => { store.clear() },
				transaction: async () => {},
				atomicBatch: async () => {}
			}
			expect(resolveAutoMode(adapter)).toBe('native')
		})
	})

	describe('validateMode', () => {
		it('should validate native mode when supported', () => {
			const adapter = createNativeAdapter()
			expect(validateMode('native', adapter)).toBe('native')
		})

		it('should throw for native mode when not supported', () => {
			const adapter = createMinimalAdapter()
			expect(() => validateMode('native', adapter)).toThrow(FeatureNotSupportedError)
		})

		it('should validate batch mode when supported', () => {
			const adapter = createBatchAdapter()
			expect(validateMode('batch', adapter)).toBe('batch')
		})

		it('should throw for batch mode when not supported', () => {
			const adapter = createMinimalAdapter()
			expect(() => validateMode('batch', adapter)).toThrow(FeatureNotSupportedError)
		})

		it('should validate optimistic mode when acid is available', () => {
			const adapter = createBatchAdapter()
			expect(validateMode('optimistic', adapter)).toBe('optimistic')
		})

		it('should throw for optimistic mode without acid', () => {
			const adapter = createMinimalAdapter()
			expect(() => validateMode('optimistic', adapter)).toThrow(FeatureNotSupportedError)
		})

		it('should validate serial mode when acid is available', () => {
			const adapter = createNativeAdapter()
			expect(validateMode('serial', adapter)).toBe('serial')
		})

		it('should throw for serial mode without acid', () => {
			const adapter = createMinimalAdapter()
			expect(() => validateMode('serial', adapter)).toThrow(FeatureNotSupportedError)
		})

		it('should always validate single mode', () => {
			const adapter = createMinimalAdapter()
			expect(validateMode('single', adapter)).toBe('single')
		})

		it('should resolve auto mode', () => {
			const adapter = createNativeAdapter()
			expect(validateMode('auto', adapter)).toBe('native')
		})
	})

	describe('hasAcidSupport', () => {
		it('should return true for native adapter', () => {
			expect(hasAcidSupport(createNativeAdapter())).toBe(true)
		})

		it('should return true for batch adapter', () => {
			expect(hasAcidSupport(createBatchAdapter())).toBe(true)
		})

		it('should return false for minimal adapter', () => {
			expect(hasAcidSupport(createMinimalAdapter())).toBe(false)
		})
	})

	describe('requiresAcid', () => {
		it('should not throw for adapters with acid support', () => {
			expect(() => requiresAcid(createNativeAdapter())).not.toThrow()
			expect(() => requiresAcid(createBatchAdapter())).not.toThrow()
		})

		it('should throw for minimal adapters', () => {
			expect(() => requiresAcid(createMinimalAdapter())).toThrow(FeatureNotSupportedError)
		})
	})

	describe('getModeName', () => {
		it('should return descriptive names for each mode', () => {
			expect(getModeName('native')).toBe('Native Transaction')
			expect(getModeName('batch')).toBe('Atomic Batch')
			expect(getModeName('optimistic')).toBe('Optimistic Concurrency')
			expect(getModeName('serial')).toBe('Serial Queue')
			expect(getModeName('single')).toBe('Single Mutation')
		})
	})
})

describe('Transaction Context Operations', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		registerAllExtensions()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Native Mode', () => {
		it('should commit staged writes on success', async () => {
			const adapter = createNativeAdapter()
			await FlashcoreSystem.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('key1', 'value1')
				ctx.set('key2', 'value2')
			}, { mode: 'native' })

			expect(await adapter.get('key1')).toBe('value1')
			expect(await adapter.get('key2')).toBe('value2')
		})

		it('should read values within transaction', async () => {
			const adapter = createNativeAdapter()
			await adapter.set('existing', 'data')
			await FlashcoreSystem.init({ adapter })

			let readValue: unknown

			await FlashcoreSystem.transaction(async (ctx) => {
				readValue = await ctx.read('existing')
			}, { mode: 'native' })

			expect(readValue).toBe('data')
		})

		it('should rollback on error', async () => {
			const adapter = createNativeAdapter()
			await FlashcoreSystem.init({ adapter })

			await expect(FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('key', 'value')
				throw new Error('Test error')
			}, { mode: 'native' })).rejects.toThrow('Test error')

			// Value should not be committed
			expect(await adapter.get('key')).toBeUndefined()
		})
	})

	describe('Batch Mode', () => {
		it('should commit all operations atomically', async () => {
			const adapter = createBatchAdapter()
			await FlashcoreSystem.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('a', 1)
				ctx.set('b', 2)
				ctx.set('c', 3)
			}, { mode: 'batch' })

			expect(await adapter.get('a')).toBe(1)
			expect(await adapter.get('b')).toBe(2)
			expect(await adapter.get('c')).toBe(3)
		})

		it('should handle deletes in batch', async () => {
			const adapter = createBatchAdapter()
			await adapter.set('toDelete', 'value')
			await FlashcoreSystem.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				ctx.delete('toDelete')
				ctx.set('newKey', 'newValue')
			}, { mode: 'batch' })

			expect(await adapter.get('toDelete')).toBeUndefined()
			expect(await adapter.get('newKey')).toBe('newValue')
		})
	})

	describe('Single Mode', () => {
		it('should allow one mutation', async () => {
			const adapter = createMinimalAdapter()
			await FlashcoreSystem.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('single', 'value')
			}, { mode: 'single' })

			expect(await adapter.get('single')).toBe('value')
		})

		it('should throw on second mutation', async () => {
			const adapter = createMinimalAdapter()
			await FlashcoreSystem.init({ adapter })

			await expect(FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('first', 'value')
				ctx.set('second', 'value') // Should throw
			}, { mode: 'single' })).rejects.toThrow(FeatureNotSupportedError)
		})

		it('should allow unlimited reads', async () => {
			const adapter = createMinimalAdapter()
			await adapter.set('a', 1)
			await adapter.set('b', 2)
			await adapter.set('c', 3)
			await FlashcoreSystem.init({ adapter })

			const values: unknown[] = []

			await FlashcoreSystem.transaction(async (ctx) => {
				values.push(await ctx.read('a'))
				values.push(await ctx.read('b'))
				values.push(await ctx.read('c'))
				ctx.set('result', 'done')
			}, { mode: 'single' })

			expect(values).toEqual([1, 2, 3])
			expect(await adapter.get('result')).toBe('done')
		})
	})

	describe('Return Values', () => {
		it('should return value from transaction function', async () => {
			const adapter = createNativeAdapter()
			await FlashcoreSystem.init({ adapter })

			const txResult = await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('key', 'value')
				return 42
			}, { mode: 'native' })

			// Transaction returns TransactionResult with result, retries, durationMs
			expect(txResult.result).toBe(42)
			expect(txResult.retries).toBe(0)
			expect(typeof txResult.durationMs).toBe('number')
		})

		it('should return undefined when function returns nothing', async () => {
			const adapter = createNativeAdapter()
			await FlashcoreSystem.init({ adapter })

			const txResult = await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('key', 'value')
			}, { mode: 'native' })

			// Transaction returns TransactionResult with result, retries, durationMs
			expect(txResult.result).toBeUndefined()
			expect(txResult.retries).toBe(0)
		})
	})
})
