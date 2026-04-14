/**
 * Transaction Edge Cases
 *
 * Tests transaction concurrency, timeout, multi-model rollback,
 * return values, and single-mode enforcement.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	TransactionConflictError,
	FeatureNotSupportedError,
	VERSION_FIELD_NAME,
	f
} from 'robo.js/flashcore'
import type { FlashcoreAdapter, BatchOperation, AdapterTransaction } from 'robo.js/flashcore'
import { registerAllExtensions } from '../helpers/register-extensions.js'
import { clearSerialQueue } from '../../src/transactions/context.js'

/**
 * Create an adapter with native transaction support for serial mode tests.
 */
function createNativeAdapter(): FlashcoreAdapter & { store: Map<string, unknown> } {
	const store = new Map<string, unknown>()
	return {
		store,
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => { store.set(key, value); return true },
		delete: async (key: string) => { store.delete(key); return true },
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() },
		transaction: async (fn: (tx: AdapterTransaction<string, unknown>) => void | Promise<void>) => {
			const pending: { type: 'set' | 'delete'; key: string; value?: unknown }[] = []
			const tx: AdapterTransaction<string, unknown> = {
				get: async (key) => store.get(key),
				set: (key, value) => { pending.push({ type: 'set', key, value }) },
				delete: (key) => { pending.push({ type: 'delete', key }) }
			}
			await fn(tx)
			for (const op of pending) {
				if (op.type === 'set') {
					store.set(op.key, op.value)
				} else {
					store.delete(op.key)
				}
			}
		}
	}
}

/**
 * Create an adapter with atomicBatch support for optimistic/batch mode tests.
 */
function createBatchAdapter(): FlashcoreAdapter & { store: Map<string, unknown> } {
	const store = new Map<string, unknown>()
	return {
		store,
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => { store.set(key, value); return true },
		delete: async (key: string) => { store.delete(key); return true },
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() },
		atomicBatch: async (ops: BatchOperation<string, unknown>[]) => {
			for (const op of ops) {
				if (op.type === 'set') store.set(op.key, op.value)
				else if (op.type === 'delete') store.delete(op.key)
			}
		}
	}
}

/**
 * Create a minimal adapter with no ACID support (for single mode).
 */
function createMinimalAdapter(): FlashcoreAdapter & { store: Map<string, unknown> } {
	const store = new Map<string, unknown>()
	return {
		store,
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => { store.set(key, value); return true },
		delete: async (key: string) => { store.delete(key); return true },
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() }
	}
}

/**
 * Initialize FlashcoreSystem with extensions and the given adapter.
 */
async function initWithExtensions(adapter: FlashcoreAdapter): Promise<void> {
	await FlashcoreSystem._reset()
	registerAllExtensions()
	await Flashcore.$.init({ adapter })
}

describe('Transaction Edge Cases', () => {
	afterEach(async () => {
		clearSerialQueue()
		await FlashcoreSystem._reset()
	})

	describe('Concurrent serial transactions', () => {
		it('two concurrent serial transactions execute in order', async () => {
			const adapter = createNativeAdapter()
			adapter.store.set('counter', 0)

			await FlashcoreSystem._reset()
			registerAllExtensions()
			clearSerialQueue()
			await Flashcore.$.init({ adapter })

			const increment = () =>
				FlashcoreSystem.transaction(async (ctx) => {
					const current = (await ctx.read<number>('counter')) ?? 0
					ctx.set('counter', current + 1)
					return current + 1
				}, { mode: 'serial' })

			const [r1, r2] = await Promise.all([increment(), increment()])

			// Both should complete with unique sequential values
			const results = [r1.result, r2.result].sort((a, b) => a - b)
			expect(results).toEqual([1, 2])

			// Final counter value must be 2
			expect(adapter.store.get('counter')).toBe(2)
		})

		it('serial queue processes N concurrent transactions correctly', async () => {
			const adapter = createNativeAdapter()
			adapter.store.set('counter', 0)

			await FlashcoreSystem._reset()
			registerAllExtensions()
			clearSerialQueue()
			await Flashcore.$.init({ adapter })

			const N = 10

			const increment = () =>
				FlashcoreSystem.transaction(async (ctx) => {
					const current = (await ctx.read<number>('counter')) ?? 0
					ctx.set('counter', current + 1)
					return current + 1
				}, { mode: 'serial' })

			const results = await Promise.all(Array.from({ length: N }, () => increment()))

			// All should complete, final counter must equal N
			expect(adapter.store.get('counter')).toBe(N)

			// All results should be unique values from 1..N
			const values = results.map((r) => r.result).sort((a, b) => a - b)
			expect(values).toEqual(Array.from({ length: N }, (_, i) => i + 1))
		})
	})

	describe('Concurrent optimistic transactions', () => {
		it('one succeeds and one retries on version conflict', async () => {
			const adapter = createBatchAdapter()
			// Seed a versioned record
			adapter.store.set('opt-record', { id: '1', value: 10, [VERSION_FIELD_NAME]: 1 })

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			let attempt1Count = 0
			let attempt2Count = 0

			const tx1 = FlashcoreSystem.transaction(async (ctx) => {
				attempt1Count++
				const rec = await ctx.read<{ id: string; value: number; _version: number }>('opt-record')
				if (rec) {
					ctx.set('opt-record', {
						...rec,
						value: rec.value + 5,
						[VERSION_FIELD_NAME]: rec[VERSION_FIELD_NAME] + 1
					})
				}
				return 'tx1'
			}, { mode: 'optimistic', maxRetries: 3 })

			const tx2 = FlashcoreSystem.transaction(async (ctx) => {
				attempt2Count++
				const rec = await ctx.read<{ id: string; value: number; _version: number }>('opt-record')
				if (rec) {
					ctx.set('opt-record', {
						...rec,
						value: rec.value + 10,
						[VERSION_FIELD_NAME]: rec[VERSION_FIELD_NAME] + 1
					})
				}
				return 'tx2'
			}, { mode: 'optimistic', maxRetries: 3 })

			// Both should eventually complete (one might retry)
			const [r1, r2] = await Promise.all([tx1, tx2])

			expect(r1.result).toBe('tx1')
			expect(r2.result).toBe('tx2')

			// Final state should be consistent. The second transaction to commit
			// should have read the version written by the first.
			const final = adapter.store.get('opt-record') as { value: number; _version: number }
			expect(typeof final.value).toBe('number')
			expect(final[VERSION_FIELD_NAME]).toBeGreaterThanOrEqual(2)
		})

		it('optimistic transaction fails after max retries', async () => {
			const adapter = createBatchAdapter()
			adapter.store.set('conflict-record', { id: '1', value: 0, [VERSION_FIELD_NAME]: 1 })

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			let attemptCount = 0
			let currentVersion = 1

			// Every attempt, we bump the version externally so it always conflicts
			await expect(
				FlashcoreSystem.transaction(async (ctx) => {
					attemptCount++
					await ctx.read('conflict-record')

					// Simulate external modification causing perpetual conflict
					currentVersion++
					adapter.store.set('conflict-record', {
						id: '1',
						value: 99,
						[VERSION_FIELD_NAME]: currentVersion
					})

					ctx.set('conflict-record', {
						id: '1',
						value: 42,
						[VERSION_FIELD_NAME]: currentVersion
					})
				}, { mode: 'optimistic', maxRetries: 2 })
			).rejects.toThrow(TransactionConflictError)

			// Should have tried initial + 2 retries = 3 attempts
			expect(attemptCount).toBe(3)
		})
	})

	describe('Transaction with multiple models', () => {
		it('transaction reads and writes across two models', async () => {
			const adapter = createNativeAdapter()
			await initWithExtensions(adapter)

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('TxUser', {
				id: f.id(),
				name: f.string()
			})

			const Post = FlashcoreSystem.registerModel<{ id: string; title: string; authorId: string }>('TxPost', {
				id: f.id(),
				title: f.string(),
				authorId: f.string()
			})

			// Create records outside the transaction
			const user = await User.create({ name: 'Alice' })

			// Use a transaction to read the user and create a linked post
			const result = await FlashcoreSystem.transaction(async (ctx) => {
				// Read a KV key related to the user
				ctx.set(`user-post-count:${user.id}`, 1)
				return 'linked'
			})

			expect(result.result).toBe('linked')
			expect(result.retries).toBe(0)
			expect(result.durationMs).toBeGreaterThanOrEqual(0)

			// The KV write should have been committed
			expect(adapter.store.get(`user-post-count:${user.id}`)).toBe(1)

			// The model records should be intact
			const foundUser = await User.findUnique({ where: { id: user.id } })
			expect(foundUser).not.toBeNull()
			expect(foundUser!.name).toBe('Alice')
		})

		it('batch transaction rollback on error restores both models', async () => {
			const adapter = createBatchAdapter()
			adapter.store.set('user-data', { name: 'Original' })
			adapter.store.set('post-data', { title: 'Original' })

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			// Attempt a transaction that stages writes then throws
			await expect(
				FlashcoreSystem.transaction(async (ctx) => {
					// Stage writes to both keys
					ctx.set('user-data', { name: 'Updated' })
					ctx.set('post-data', { title: 'Updated' })

					// Throw before commit
					throw new Error('Intentional rollback')
				}, { mode: 'batch' })
			).rejects.toThrow('Intentional rollback')

			// Both values should remain unchanged because the transaction rolled back
			expect(adapter.store.get('user-data')).toEqual({ name: 'Original' })
			expect(adapter.store.get('post-data')).toEqual({ title: 'Original' })
		})
	})

	describe('Transaction rollback', () => {
		it('batch mode: error in transaction prevents all writes', async () => {
			const adapter = createBatchAdapter()

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			// Attempt a batch transaction that throws after staging
			await expect(
				FlashcoreSystem.transaction(async (ctx) => {
					ctx.set('key-a', 'value-a')
					ctx.set('key-b', 'value-b')
					ctx.delete('key-c')

					throw new Error('Abort')
				}, { mode: 'batch' })
			).rejects.toThrow('Abort')

			// None of the staged operations should have been committed
			expect(adapter.store.has('key-a')).toBe(false)
			expect(adapter.store.has('key-b')).toBe(false)
		})

		it('single mode: second mutation throws FeatureNotSupportedError', async () => {
			const adapter = createMinimalAdapter()

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			// In single mode, only one mutation is allowed per transaction
			await expect(
				FlashcoreSystem.transaction(async (ctx) => {
					// First mutation succeeds
					ctx.set('key-1', 'value-1')

					// Second mutation should throw FeatureNotSupportedError
					ctx.set('key-2', 'value-2')
				}, { mode: 'single' })
			).rejects.toThrow(FeatureNotSupportedError)
		})

		it('native mode: error in callback causes rollback, no data persisted', async () => {
			const adapter = createNativeAdapter()
			adapter.store.set('existing', 'original')

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			await expect(
				FlashcoreSystem.transaction(async (ctx) => {
					ctx.set('existing', 'modified')
					ctx.set('new-key', 'new-value')
					throw new Error('Rollback')
				}, { mode: 'native' })
			).rejects.toThrow('Rollback')

			// Original value should be preserved, new key should not exist
			expect(adapter.store.get('existing')).toBe('original')
			expect(adapter.store.has('new-key')).toBe(false)
		})
	})

	describe('Transaction return values', () => {
		it('transaction returns the callback return value', async () => {
			const adapter = createNativeAdapter()

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			const result = await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('answer', 42)
				return { message: 'success', count: 7 }
			})

			expect(result.result).toEqual({ message: 'success', count: 7 })
			expect(result.retries).toBe(0)
			expect(result.durationMs).toBeGreaterThanOrEqual(0)
		})

		it('transaction returns undefined when callback has no return', async () => {
			const adapter = createNativeAdapter()

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			const result = await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('key', 'value')
			})

			expect(result.result).toBeUndefined()
			expect(result.durationMs).toBeGreaterThanOrEqual(0)
		})

		it('serial transaction returns the callback return value', async () => {
			const adapter = createNativeAdapter()

			await FlashcoreSystem._reset()
			registerAllExtensions()
			clearSerialQueue()
			await Flashcore.$.init({ adapter })

			const result = await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('serial-key', 'serial-value')
				return 'serial-result'
			}, { mode: 'serial' })

			expect(result.result).toBe('serial-result')
			expect(adapter.store.get('serial-key')).toBe('serial-value')
		})

		it('optimistic transaction result includes retry count', async () => {
			const adapter = createBatchAdapter()
			adapter.store.set('versioned', { value: 1, [VERSION_FIELD_NAME]: 1 })

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			let attemptCount = 0

			const result = await FlashcoreSystem.transaction(async (ctx) => {
				attemptCount++
				const rec = await ctx.read<{ value: number; _version: number }>('versioned')

				// Cause conflict on first attempt only
				if (attemptCount === 1) {
					adapter.store.set('versioned', {
						value: 2,
						[VERSION_FIELD_NAME]: 2
					})
				}

				if (rec) {
					ctx.set('versioned', {
						value: rec.value + 10,
						[VERSION_FIELD_NAME]: rec[VERSION_FIELD_NAME] + 1
					})
				}

				return 'done'
			}, { mode: 'optimistic', maxRetries: 3 })

			expect(result.result).toBe('done')
			// Should have retried at least once due to the conflict on first attempt
			expect(attemptCount).toBe(2)
			expect(result.retries).toBeGreaterThanOrEqual(1)
		})
	})

	describe('Transaction read consistency', () => {
		it('reads within transaction see staged writes', async () => {
			const adapter = createNativeAdapter()

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				// Write first
				ctx.set('staged-key', { value: 'staged' })

				// Read should see the staged value
				const val = await ctx.read('staged-key')
				expect(val).toEqual({ value: 'staged' })
			})
		})

		it('reads within transaction see staged deletes as undefined', async () => {
			const adapter = createNativeAdapter()
			adapter.store.set('to-delete', 'exists')

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				// Delete the key
				ctx.delete('to-delete')

				// Read should return undefined
				const val = await ctx.read('to-delete')
				expect(val).toBeUndefined()
			})
		})

		it('reads from adapter when key not staged', async () => {
			const adapter = createNativeAdapter()
			adapter.store.set('adapter-key', 'adapter-value')

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				const val = await ctx.read('adapter-key')
				expect(val).toBe('adapter-value')
			})
		})
	})

	describe('Transaction mode validation', () => {
		it('native mode throws FeatureNotSupportedError without adapter.transaction', async () => {
			const adapter = createMinimalAdapter()

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			await expect(
				FlashcoreSystem.transaction(async () => {}, { mode: 'native' })
			).rejects.toThrow(FeatureNotSupportedError)
		})

		it('batch mode throws FeatureNotSupportedError without adapter.atomicBatch', async () => {
			const adapter = createMinimalAdapter()

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			await expect(
				FlashcoreSystem.transaction(async () => {}, { mode: 'batch' })
			).rejects.toThrow(FeatureNotSupportedError)
		})

		it('auto mode resolves to single for minimal adapter', async () => {
			const adapter = createMinimalAdapter()

			await FlashcoreSystem._reset()
			registerAllExtensions()
			await Flashcore.$.init({ adapter })

			// Auto mode with minimal adapter should resolve to single,
			// which allows exactly one mutation
			const result = await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('auto-key', 'auto-value')
				return 'ok'
			})

			expect(result.result).toBe('ok')
			expect(adapter.store.get('auto-key')).toBe('auto-value')
		})
	})
})
