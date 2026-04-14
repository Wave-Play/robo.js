/**
 * Flashcore v1 (spec rev 4.3) Phase 4 - Upsert Race Condition Tests
 *
 * Tests upsert behavior under concurrent access to verify that race
 * conditions do not cause data corruption or unexpected errors.
 */

import {
	Flashcore,
	FlashcoreSystem,
	f
} from '../helpers/flashcore-compat.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'

interface Counter {
	id: string
	name: string
	value: number
}

describe('Upsert Race Conditions', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should result in exactly one record after two concurrent upserts for same non-existent key', async () => {
		const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
			id: f.id(),
			name: f.string(),
			value: f.number()
		})

		await Promise.all([
			Counter.upsert({
				where: { id: 'counter-1' },
				create: { id: 'counter-1', name: 'hits', value: 1 },
				update: { value: 100 }
			}),
			Counter.upsert({
				where: { id: 'counter-1' },
				create: { id: 'counter-1', name: 'hits', value: 1 },
				update: { value: 200 }
			})
		])

		const all = await Counter.findMany()
		expect(all.length).toBe(1)
		expect(all[0].id).toBe('counter-1')
		expect(all[0].name).toBe('hits')
	})

	it('should handle N concurrent upserts for same key without errors', async () => {
		const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
			id: f.id(),
			name: f.string(),
			value: f.number()
		})

		const N = 10
		const upserts = Array.from({ length: N }, (_, i) =>
			Counter.upsert({
				where: { id: 'shared-counter' },
				create: { id: 'shared-counter', name: 'counter', value: 0 },
				update: { value: i + 1 }
			})
		)

		const results = await Promise.allSettled(upserts)

		// All should resolve without errors
		for (const result of results) {
			expect(result.status).toBe('fulfilled')
		}

		// Exactly one record should exist
		const all = await Counter.findMany()
		expect(all.length).toBe(1)
		expect(all[0].id).toBe('shared-counter')
		expect(typeof all[0].value).toBe('number')
	})

	it('should handle concurrent upsert and delete without errors', async () => {
		const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
			id: f.id(),
			name: f.string(),
			value: f.number()
		})

		// Pre-create the record
		await Counter.create({ id: 'counter-1', name: 'hits', value: 10 })

		const results = await Promise.allSettled([
			Counter.upsert({
				where: { id: 'counter-1' },
				create: { id: 'counter-1', name: 'hits', value: 1 },
				update: { value: 20 }
			}),
			Counter.delete({ where: { id: 'counter-1' } })
		])

		// Both operations should complete without throwing
		// (one may fail with NotFoundError if the delete wins, which is acceptable)
		const errors = results.filter(r => r.status === 'rejected')
		// At most one operation may fail due to timing
		expect(errors.length).toBeLessThanOrEqual(1)

		// The final state should be consistent
		const all = await Counter.findMany()
		// Either 0 records (delete won last) or 1 record (upsert won last)
		expect(all.length).toBeLessThanOrEqual(1)
	})

	it('should handle concurrent upsert and findUnique without errors', async () => {
		const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
			id: f.id(),
			name: f.string(),
			value: f.number()
		})

		await Counter.create({ id: 'counter-1', name: 'hits', value: 5 })

		const results = await Promise.allSettled([
			Counter.upsert({
				where: { id: 'counter-1' },
				create: { id: 'counter-1', name: 'hits', value: 1 },
				update: { value: 50 }
			}),
			Counter.findUnique({ where: { id: 'counter-1' } })
		])

		// Both should succeed
		expect(results[0].status).toBe('fulfilled')
		expect(results[1].status).toBe('fulfilled')

		if (results[1].status === 'fulfilled') {
			const readResult = results[1].value
			expect(readResult).not.toBeNull()
			expect(readResult!.name).toBe('hits')
			// Value is either old (5) or new (50)
			expect([5, 50]).toContain(readResult!.value)
		}
	})

	it('should update correctly with sequential upserts', async () => {
		const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
			id: f.id(),
			name: f.string(),
			value: f.number()
		})

		// First upsert creates
		const first = await Counter.upsert({
			where: { id: 'counter-1' },
			create: { id: 'counter-1', name: 'hits', value: 0 },
			update: { value: 100 }
		})
		expect(first.value).toBe(0) // Created with value 0

		// Second upsert updates
		const second = await Counter.upsert({
			where: { id: 'counter-1' },
			create: { id: 'counter-1', name: 'hits', value: 0 },
			update: { value: 100 }
		})
		expect(second.value).toBe(100) // Updated to 100

		// Third upsert updates again
		const third = await Counter.upsert({
			where: { id: 'counter-1' },
			create: { id: 'counter-1', name: 'hits', value: 0 },
			update: { value: 200 }
		})
		expect(third.value).toBe(200) // Updated to 200

		// Verify final state
		const final = await Counter.findUnique({ where: { id: 'counter-1' } })
		expect(final).not.toBeNull()
		expect(final!.value).toBe(200)
	})
})
