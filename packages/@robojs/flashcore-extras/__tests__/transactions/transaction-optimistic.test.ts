/**
 * Flashcore v1 (spec rev 4.3) Phase 8 - Optimistic Transaction Tests
 *
 * Tests optimistic concurrency control, version tracking, and conflict detection.
 */

import { FlashcoreSystem, TransactionConflictError, VERSION_FIELD_NAME } from 'robo.js/flashcore'
import type { FlashcoreAdapter, BatchOperation } from 'robo.js/flashcore'
import { registerAllExtensions } from '../helpers/register-extensions.js'

/**
 * Create an adapter with atomicBatch support and version simulation.
 */
function createVersionedAdapter(): FlashcoreAdapter & { store: Map<string, unknown> } {
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
				if (op.type === 'set') {
					store.set(op.key, op.value)
				} else if (op.type === 'delete') {
					store.delete(op.key)
				}
			}
		}
	}
}

describe('Optimistic Transaction Tests', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		registerAllExtensions()
	})

	describe('Version Tracking', () => {
		it('should track read versions', async () => {
			const adapter = createVersionedAdapter()
			// Seed a versioned record
			adapter.store.set('record:1', { id: '1', name: 'Test', [VERSION_FIELD_NAME]: 1 })
			await FlashcoreSystem.init({ adapter })

			let readData: unknown

			await FlashcoreSystem.transaction(async (ctx) => {
				readData = await ctx.read('record:1')
			}, { mode: 'optimistic' })

			expect(readData).toEqual({ id: '1', name: 'Test', [VERSION_FIELD_NAME]: 1 })
		})

		it('should commit when versions match', async () => {
			const adapter = createVersionedAdapter()
			adapter.store.set('record:1', { id: '1', value: 10, [VERSION_FIELD_NAME]: 1 })
			await FlashcoreSystem.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				const record = await ctx.read<{ id: string; value: number; _version: number }>('record:1')
				if (record) {
					ctx.set('record:1', { ...record, value: 20, [VERSION_FIELD_NAME]: 2 })
				}
			}, { mode: 'optimistic' })

			const updated = adapter.store.get('record:1') as { value: number; _version: number }
			expect(updated.value).toBe(20)
			expect(updated[VERSION_FIELD_NAME]).toBe(2)
		})
	})

	describe('Conflict Detection', () => {
		it('should detect version conflict', async () => {
			const adapter = createVersionedAdapter()
			adapter.store.set('record:1', { id: '1', value: 10, [VERSION_FIELD_NAME]: 1 })
			await FlashcoreSystem.init({ adapter })

			// Simulate a concurrent modification mid-transaction
			let attemptCount = 0

			await expect(FlashcoreSystem.transaction(async (ctx) => {
				attemptCount++
				const record = await ctx.read<{ id: string; value: number; _version: number }>('record:1')

				// Simulate another process modifying the record after read
				if (attemptCount === 1) {
					adapter.store.set('record:1', { id: '1', value: 15, [VERSION_FIELD_NAME]: 2 })
				}

				if (record) {
					ctx.set('record:1', { ...record, value: record.value + 5, [VERSION_FIELD_NAME]: record[VERSION_FIELD_NAME] + 1 })
				}
			}, { mode: 'optimistic', maxRetries: 0 })).rejects.toThrow(TransactionConflictError)
		})

		it('should retry on conflict and succeed', async () => {
			const adapter = createVersionedAdapter()
			adapter.store.set('record:1', { id: '1', value: 10, [VERSION_FIELD_NAME]: 1 })
			await FlashcoreSystem.init({ adapter })

			let attemptCount = 0

			await FlashcoreSystem.transaction(async (ctx) => {
				attemptCount++
				const record = await ctx.read<{ id: string; value: number; _version: number }>('record:1')

				// Simulate conflict only on first attempt
				if (attemptCount === 1) {
					adapter.store.set('record:1', { id: '1', value: 15, [VERSION_FIELD_NAME]: 2 })
				}

				if (record) {
					ctx.set('record:1', { ...record, value: record.value + 5, [VERSION_FIELD_NAME]: record[VERSION_FIELD_NAME] + 1 })
				}
			}, { mode: 'optimistic', maxRetries: 3 })

			// Should have retried
			expect(attemptCount).toBe(2)

			// Final value should be based on version 2 read
			const final = adapter.store.get('record:1') as { value: number; _version: number }
			expect(final.value).toBe(20) // 15 + 5
			expect(final[VERSION_FIELD_NAME]).toBe(3)
		})

		it('should fail after max retries exceeded', async () => {
			const adapter = createVersionedAdapter()
			adapter.store.set('record:1', { id: '1', value: 10, [VERSION_FIELD_NAME]: 1 })
			await FlashcoreSystem.init({ adapter })

			let attemptCount = 0
			let currentVersion = 1

			await expect(FlashcoreSystem.transaction(async (ctx) => {
				attemptCount++
				await ctx.read('record:1')

				// Always cause conflict by incrementing version
				currentVersion++
				adapter.store.set('record:1', { id: '1', value: 10, [VERSION_FIELD_NAME]: currentVersion })

				ctx.set('record:1', { id: '1', value: 99, [VERSION_FIELD_NAME]: currentVersion })
			}, { mode: 'optimistic', maxRetries: 2 })).rejects.toThrow(TransactionConflictError)

			// Should have tried 3 times (initial + 2 retries)
			expect(attemptCount).toBe(3)
		})
	})

	describe('Transaction Retries Metric', () => {
		it('should increment transactionRetries on retry', async () => {
			const adapter = createVersionedAdapter()
			adapter.store.set('record:1', { id: '1', value: 10, [VERSION_FIELD_NAME]: 1 })
			await FlashcoreSystem.init({ adapter })

			let attemptCount = 0

			await FlashcoreSystem.transaction(async (ctx) => {
				attemptCount++
				await ctx.read('record:1')

				// Cause conflict on first attempt only
				if (attemptCount === 1) {
					adapter.store.set('record:1', { id: '1', value: 15, [VERSION_FIELD_NAME]: 2 })
				}

				ctx.set('record:1', { id: '1', value: 20, [VERSION_FIELD_NAME]: attemptCount + 1 })
			}, { mode: 'optimistic', maxRetries: 3 })

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.transactionRetries).toBeGreaterThanOrEqual(1)
		})
	})

	describe('Read Consistency', () => {
		it('should read staged values within transaction', async () => {
			const adapter = createVersionedAdapter()
			await FlashcoreSystem.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				ctx.set('new-key', { value: 'staged' })

				// Read should return staged value
				const staged = await ctx.read('new-key')
				expect(staged).toEqual({ value: 'staged' })
			}, { mode: 'optimistic' })
		})

		it('should return undefined for deleted keys', async () => {
			const adapter = createVersionedAdapter()
			adapter.store.set('to-delete', { value: 'original' })
			await FlashcoreSystem.init({ adapter })

			await FlashcoreSystem.transaction(async (ctx) => {
				ctx.delete('to-delete')

				// Read should return undefined after delete
				const deleted = await ctx.read('to-delete')
				expect(deleted).toBeUndefined()
			}, { mode: 'optimistic' })
		})
	})
})
