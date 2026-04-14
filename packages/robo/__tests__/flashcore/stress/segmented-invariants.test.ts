/**
 * Flashcore - Segmented Record Invariant Tests
 *
 * Cross-check invariant properties after various operation sequences
 * on mixed chunk/segment records.
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

describe('Segmented Record Invariants', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('catalog count equals retrievable record count', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)

		// Create 10 mixed records: 5 small, 5 large
		const smallIds: string[] = []
		const largeIds: string[] = []
		for (let i = 0; i < 5; i++) {
			const s = await BigItem.create({ name: 'small-' + i, bigField: 'tiny', value: i })
			smallIds.push(s.id)
		}
		for (let i = 0; i < 5; i++) {
			const l = await BigItem.create({ name: 'large-' + i, bigField: bigValue, value: 10 + i })
			largeIds.push(l.id)
		}

		// Delete 3 (2 large, 1 small)
		await BigItem.delete({ where: { id: largeIds[0] } })
		await BigItem.delete({ where: { id: largeIds[1] } })
		await BigItem.delete({ where: { id: smallIds[0] } })

		// Invariant: count() === findMany().length
		const count1 = await BigItem.count()
		const all1 = await BigItem.findMany()
		expect(count1).toBe(all1.length)
		expect(count1).toBe(7)

		// Update 2 small to large
		await BigItem.update({ where: { id: smallIds[1] }, data: { bigField: bigValue } })
		await BigItem.update({ where: { id: smallIds[2] }, data: { bigField: bigValue } })

		// Invariant still holds
		const count2 = await BigItem.count()
		const all2 = await BigItem.findMany()
		expect(count2).toBe(all2.length)
		expect(count2).toBe(7)
	})

	it('every findMany record is also findable by findUnique', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)

		// Create 8 mixed records: 4 small, 4 large
		const ids: string[] = []
		for (let i = 0; i < 4; i++) {
			const s = await BigItem.create({ name: 'small-' + i, bigField: 'tiny', value: i })
			ids.push(s.id)
		}
		for (let i = 0; i < 4; i++) {
			const l = await BigItem.create({ name: 'large-' + i, bigField: bigValue, value: 10 + i })
			ids.push(l.id)
		}

		// Delete 2
		await BigItem.delete({ where: { id: ids[0] } })
		await BigItem.delete({ where: { id: ids[4] } })

		// Invariant: every findMany result is findable by findUnique
		const allRecords = await BigItem.findMany()
		expect(allRecords.length).toBe(6)

		for (const record of allRecords) {
			const unique = await BigItem.findUnique({ where: { id: record.id } })
			expect(unique).not.toBeNull()
			expect(unique!.id).toBe(record.id)
			expect(unique!.name).toBe(record.name)
			expect(unique!.bigField).toBe(record.bigField)
			expect(unique!.value).toBe(record.value)
		}
	})

	it('after delete, record absent from both findUnique and findMany', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)

		// Create 5 records: 3 large, 2 small
		const records = [
			await BigItem.create({ name: 'large-0', bigField: bigValue, value: 0 }),
			await BigItem.create({ name: 'large-1', bigField: bigValue, value: 1 }),
			await BigItem.create({ name: 'large-2', bigField: bigValue, value: 2 }),
			await BigItem.create({ name: 'small-0', bigField: 'tiny', value: 3 }),
			await BigItem.create({ name: 'small-1', bigField: 'tiny', value: 4 })
		]

		// Delete each one individually and verify invariants after each deletion
		for (let i = 0; i < records.length; i++) {
			await BigItem.delete({ where: { id: records[i].id } })

			// findUnique returns null
			const unique = await BigItem.findUnique({ where: { id: records[i].id } })
			expect(unique).toBeNull()

			// findMany does not contain the deleted id
			const all = await BigItem.findMany()
			const deletedInAll = all.find((r) => r.id === records[i].id)
			expect(deletedInAll).toBeUndefined()

			// count matches remaining
			expect(all.length).toBe(records.length - i - 1)
		}

		// Final check
		expect(await BigItem.count()).toBe(0)
	})

	it('no orphaned segments exist after bulk delete', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)

		// Create 15 oversized records
		const data = Array.from({ length: 15 }, (_, i) => ({
			name: 'batch1-' + i,
			bigField: bigValue,
			value: i
		}))
		await BigItem.createMany({ data })

		// Bulk delete all
		await BigItem.deleteMany({ where: { value: { gte: 0 } } })
		expect(await BigItem.count()).toBe(0)
		expect((await BigItem.findMany()).length).toBe(0)

		// Re-create 5 oversized records (proves old segments don't pollute new records)
		const newData = Array.from({ length: 5 }, (_, i) => ({
			name: 'batch2-' + i,
			bigField: bigValue,
			value: 100 + i
		}))
		await BigItem.createMany({ data: newData })

		expect(await BigItem.count()).toBe(5)

		const newRecords = await BigItem.findMany()
		expect(newRecords.length).toBe(5)

		// All 5 readable via findUnique with correct data
		for (const record of newRecords) {
			const unique = await BigItem.findUnique({ where: { id: record.id } })
			expect(unique).not.toBeNull()
			expect(unique!.bigField).toBe(bigValue)
			expect(unique!.name).toMatch(/^batch2-/)
			expect(unique!.value).toBeGreaterThanOrEqual(100)
		}
	})
})
