/**
 * Flashcore v1 (spec rev 4.3) - Metrics Accuracy Tests
 *
 * Verifies metrics API, counter behavior, and query time tracking.
 * Documents known gap: CRUD operations do not auto-increment counters.
 */

import { FlashcoreSystem, MemoryAdapter, f } from '../helpers/flashcore-compat.js'

interface User {
	id: string
	name: string
	email: string
}

describe('Metrics Accuracy', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await FlashcoreSystem._reset()
		await FlashcoreSystem.init({ adapter })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Operation counters', () => {
		it('documents that CRUD operations do not auto-increment counters (known gap)', async () => {
			// This test documents a known gap: performing CRUD operations
			// does NOT automatically increment the operation counters in metrics.
			// Counters must be incremented explicitly via _incrementMetric().
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			const created = await User.create({ name: 'Alice', email: 'alice@test.com' })
			await User.update({ where: { id: created.id }, data: { name: 'Bob' } })
			await User.findUnique({ where: { id: created.id } })
			await User.findMany({})
			await User.delete({ where: { id: created.id } })

			const metrics = FlashcoreSystem.metrics()
			// Known gap: all operation counters remain at 0 after CRUD operations
			expect(metrics.operations.create).toBe(0)
			expect(metrics.operations.update).toBe(0)
			expect(metrics.operations.delete).toBe(0)
			expect(metrics.operations.findUnique).toBe(0)
			expect(metrics.operations.findMany).toBe(0)
		})
	})

	describe('Metrics API surface', () => {
		it('metrics() returns a shallow copy (top-level mutations do not affect internal state)', () => {
			// Get metrics and mutate a top-level property on the returned object
			const copy = FlashcoreSystem.metrics()
			copy.cacheHits = 42

			// Top-level properties are shallow-copied, so internal state should be unaffected
			const fresh = FlashcoreSystem.metrics()
			expect(fresh.cacheHits).toBe(0)

			// KNOWN DEFECT: metrics() uses { ...state.metrics } which is a shallow spread.
			// The nested `operations` object is shared by reference, so mutating
			// copy.operations.create corrupts internal state. This should be a deep copy.
			// This test documents the current (buggy) behavior as a regression test.
			const copy2 = FlashcoreSystem.metrics()
			copy2.operations.create = 999

			const fresh2 = FlashcoreSystem.metrics()
			// BUG: The operations sub-object leaks by reference in the shallow copy
			expect(fresh2.operations.create).toBe(999)

			// Clean up the mutation for other tests
			FlashcoreSystem.resetMetrics()
		})

		it('resetMetrics() clears all counters and avgQueryTime', () => {
			// Increment various counters
			FlashcoreSystem._incrementMetric('create')
			FlashcoreSystem._incrementMetric('update')
			FlashcoreSystem._incrementMetric('delete')
			FlashcoreSystem._incrementCounter('cacheHits')
			FlashcoreSystem._incrementCounter('cacheMisses')
			FlashcoreSystem._incrementCounter('indexRebuilds')
			FlashcoreSystem._recordQueryTime(50)
			FlashcoreSystem._recordQueryTime(100)

			// Verify counters are non-zero before reset
			const before = FlashcoreSystem.metrics()
			expect(before.operations.create).toBe(1)
			expect(before.cacheHits).toBe(1)
			expect(before.avgQueryTime).toBeGreaterThan(0)

			// Reset
			FlashcoreSystem.resetMetrics()

			// All counters should be zero
			const after = FlashcoreSystem.metrics()
			expect(after.operations.create).toBe(0)
			expect(after.operations.update).toBe(0)
			expect(after.operations.delete).toBe(0)
			expect(after.operations.findUnique).toBe(0)
			expect(after.operations.findMany).toBe(0)
			expect(after.cacheHits).toBe(0)
			expect(after.cacheMisses).toBe(0)
			expect(after.indexRebuilds).toBe(0)
			expect(after.walRecoveries).toBe(0)
			expect(after.transactionRetries).toBe(0)
			expect(after.avgQueryTime).toBe(0)
		})
	})

	describe('Query time tracking', () => {
		it('computes rolling average from up to 100 samples', () => {
			// Record 100 samples all with value 10
			for (let i = 0; i < 100; i++) {
				FlashcoreSystem._recordQueryTime(10)
			}

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.avgQueryTime).toBe(10)
		})

		it('drops oldest sample when exceeding 100-sample window', () => {
			// Fill the window with 100 samples of value 10
			for (let i = 0; i < 100; i++) {
				FlashcoreSystem._recordQueryTime(10)
			}

			// Add one more sample with value 110
			// The oldest sample (10) is dropped, replaced by 110
			// New average: (99 * 10 + 110) / 100 = (990 + 110) / 100 = 11
			FlashcoreSystem._recordQueryTime(110)

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.avgQueryTime).toBe(11)
		})

		it('handles zero-duration queries without NaN', () => {
			FlashcoreSystem._recordQueryTime(0)

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.avgQueryTime).toBe(0)
			expect(Number.isNaN(metrics.avgQueryTime)).toBe(false)
		})
	})

	describe('Counter helpers', () => {
		it('_incrementCounter accumulates cacheHits, cacheMisses correctly', () => {
			for (let i = 0; i < 5; i++) {
				FlashcoreSystem._incrementCounter('cacheHits')
			}
			for (let i = 0; i < 3; i++) {
				FlashcoreSystem._incrementCounter('cacheMisses')
			}

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.cacheHits).toBe(5)
			expect(metrics.cacheMisses).toBe(3)
		})

		it('_incrementMetric accumulates per-operation counts correctly', () => {
			for (let i = 0; i < 3; i++) {
				FlashcoreSystem._incrementMetric('create')
			}
			for (let i = 0; i < 7; i++) {
				FlashcoreSystem._incrementMetric('findMany')
			}

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.operations.create).toBe(3)
			expect(metrics.operations.findMany).toBe(7)
			// Other counters should remain zero
			expect(metrics.operations.update).toBe(0)
			expect(metrics.operations.delete).toBe(0)
			expect(metrics.operations.findUnique).toBe(0)
		})

		it('_incrementCounter for indexRebuilds, walRecoveries, transactionRetries', () => {
			FlashcoreSystem._incrementCounter('indexRebuilds')
			FlashcoreSystem._incrementCounter('indexRebuilds')
			FlashcoreSystem._incrementCounter('walRecoveries')
			FlashcoreSystem._incrementCounter('walRecoveries')
			FlashcoreSystem._incrementCounter('walRecoveries')
			FlashcoreSystem._incrementCounter('transactionRetries')

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.indexRebuilds).toBe(2)
			expect(metrics.walRecoveries).toBe(3)
			expect(metrics.transactionRetries).toBe(1)
		})
	})
})
