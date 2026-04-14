/**
 * Flashcore - Bulk Segmented Stress Tests
 *
 * Higher-volume bulk operations on segmented records.
 * All tests should complete in under 30 seconds.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

interface BigItem {
	id: string
	name: string
	bigField: string
	value: number
}

describe('Bulk Segmented Stress', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('createMany with 50 oversized records', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)
		const data = Array.from({ length: 50 }, (_, i) => ({
			name: 'big-' + i,
			bigField: bigValue,
			value: i
		}))

		const result = await BigItem.createMany({ data })
		expect(result.count).toBe(50)

		const all = await BigItem.findMany()
		expect(all.length).toBe(50)

		// Spot-check 3 records
		for (const idx of [0, 25, 49]) {
			const record = await BigItem.findFirst({ where: { name: 'big-' + idx } })
			expect(record).not.toBeNull()
			expect(record!.bigField).toBe(bigValue)
			expect(record!.value).toBe(idx)
		}
	}, 30_000)

	it('updateMany transitioning 20 records from chunk to segments', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		// Create 20 small records
		const data = Array.from({ length: 20 }, (_, i) => ({
			name: 'item-' + i,
			bigField: 'small',
			value: i + 1
		}))
		await BigItem.createMany({ data })

		// Transition all to segmented
		const bigValue = 'x'.repeat(150_000)
		const updateResult = await BigItem.updateMany({
			where: { value: { lte: 20 } },
			data: { bigField: bigValue }
		})
		expect(updateResult.count).toBe(20)

		const all = await BigItem.findMany()
		expect(all.length).toBe(20)

		// Spot-check 3 records
		for (const idx of [1, 10, 20]) {
			const record = await BigItem.findFirst({ where: { value: idx } })
			expect(record).not.toBeNull()
			expect(record!.bigField).toBe(bigValue)
		}
	}, 30_000)

	it('deleteMany on 30 segmented records leaves no orphan segments', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)
		const data = Array.from({ length: 30 }, (_, i) => ({
			name: 'big-' + i,
			bigField: bigValue,
			value: i
		}))

		await BigItem.createMany({ data })

		// Capture IDs for later verification
		const allBefore = await BigItem.findMany()
		expect(allBefore.length).toBe(30)
		const knownIds = [allBefore[0].id, allBefore[15].id, allBefore[29].id]

		// Delete all
		const deleteResult = await BigItem.deleteMany({ where: { value: { gte: 0 } } })
		expect(deleteResult.count).toBe(30)

		const remaining = await BigItem.findMany()
		expect(remaining.length).toBe(0)

		const count = await BigItem.count()
		expect(count).toBe(0)

		// Verify specific IDs are gone
		for (const id of knownIds) {
			const record = await BigItem.findUnique({ where: { id } })
			expect(record).toBeNull()
		}
	}, 30_000)

	it('rapid add/remove cycles maintain catalog size accuracy', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)

		// 10 iterations of add/remove
		for (let iteration = 0; iteration < 10; iteration++) {
			const data = Array.from({ length: 5 }, (_, i) => ({
				name: 'cycle-' + iteration + '-' + i,
				bigField: bigValue,
				value: iteration
			}))
			await BigItem.createMany({ data })
			await BigItem.deleteMany({ where: { value: iteration } })
		}

		// Everything should be clean
		const count = await BigItem.count()
		expect(count).toBe(0)

		const all = await BigItem.findMany()
		expect(all.length).toBe(0)

		// Catalog didn't grow stale — new record works fine
		await BigItem.create({ name: 'final', bigField: bigValue, value: 999 })
		const finalCount = await BigItem.count()
		expect(finalCount).toBe(1)
	}, 30_000)
})
