/**
 * Flashcore - Bulk Operations Segmentation Tests
 *
 * Tests that createMany, updateMany, and deleteMany correctly handle
 * segmented (oversized) records. Regression tests for Bugs 2, 3, 4.
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

describe('Bulk Operations with Segmented Records', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('createMany (Bug 2)', () => {
		it('createMany segments oversized records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			const result = await BigItem.createMany({
				data: [
					{ name: 'big1', bigField: bigValue, value: 1 },
					{ name: 'big2', bigField: bigValue, value: 2 }
				]
			})

			expect(result.count).toBe(2)
			expect(result.records.length).toBe(2)

			// Verify each record is readable
			for (const record of result.records) {
				const found = await BigItem.findUnique({ where: { id: record.id } })
				expect(found).not.toBeNull()
				expect(found!.bigField).toBe(bigValue)
			}
		})

		it('createMany with mixed sizes (some need segmentation, some do not)', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			const result = await BigItem.createMany({
				data: [
					{ name: 'small1', bigField: 'tiny', value: 1 },
					{ name: 'big1', bigField: bigValue, value: 2 },
					{ name: 'small2', bigField: 'also tiny', value: 3 },
					{ name: 'big2', bigField: bigValue, value: 4 }
				]
			})

			expect(result.count).toBe(4)

			// Verify all records are readable with correct data
			const all = await BigItem.findMany()
			expect(all.length).toBe(4)

			const small1 = all.find(r => r.name === 'small1')
			expect(small1).toBeDefined()
			expect(small1!.bigField).toBe('tiny')

			const big1 = all.find(r => r.name === 'big1')
			expect(big1).toBeDefined()
			expect(big1!.bigField).toBe(bigValue)
		})

		it('created segmented records findable via findUnique and findMany', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			const result = await BigItem.createMany({
				data: [
					{ name: 'big1', bigField: bigValue, value: 10 },
					{ name: 'big2', bigField: bigValue, value: 20 }
				]
			})

			// findUnique each by ID
			for (const record of result.records) {
				const found = await BigItem.findUnique({ where: { id: record.id } })
				expect(found).not.toBeNull()
				expect(found!.bigField).toBe(bigValue)
				expect(found!.name).toBe(record.name)
			}

			// findMany returns all
			const all = await BigItem.findMany()
			expect(all.length).toBe(2)
			expect(all.every(r => r.bigField === bigValue)).toBe(true)
		})
	})

	describe('updateMany (Bug 3)', () => {
		it('updateMany correctly updates segmented records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			const created = await BigItem.create({
				name: 'big',
				bigField: bigValue,
				value: 1
			})

			const result = await BigItem.updateMany({
				where: { name: 'big' },
				data: { value: 999 }
			})
			expect(result.count).toBe(1)

			const found = await BigItem.findUnique({ where: { id: created.id } })
			expect(found).not.toBeNull()
			expect(found!.value).toBe(999)
			expect(found!.bigField).toBe(bigValue)
		})

		it('updateMany handles chunk->segments transition (record grows)', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const created = await BigItem.create({
				name: 'small',
				bigField: 'tiny',
				value: 1
			})

			const bigValue = 'x'.repeat(150_000)
			const result = await BigItem.updateMany({
				where: { name: 'small' },
				data: { bigField: bigValue }
			})
			expect(result.count).toBe(1)

			const found = await BigItem.findUnique({ where: { id: created.id } })
			expect(found).not.toBeNull()
			expect(found!.bigField).toBe(bigValue)
		})

		it('updateMany handles segments->chunk transition (record shrinks)', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const created = await BigItem.create({
				name: 'big',
				bigField: 'x'.repeat(150_000),
				value: 1
			})

			const result = await BigItem.updateMany({
				where: { name: 'big' },
				data: { bigField: 'tiny' }
			})
			expect(result.count).toBe(1)

			const found = await BigItem.findUnique({ where: { id: created.id } })
			expect(found).not.toBeNull()
			expect(found!.bigField).toBe('tiny')
		})

		it('updateMany does not corrupt mixed segmented and chunk records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			await BigItem.create({ name: 'big1', bigField: bigValue, value: 1 })
			await BigItem.create({ name: 'big2', bigField: bigValue, value: 2 })
			await BigItem.create({ name: 'small', bigField: 'tiny', value: 3 })

			const result = await BigItem.updateMany({
				where: { value: { gte: 0 } },
				data: { name: 'updated' }
			})
			expect(result.count).toBe(3)

			const all = await BigItem.findMany()
			expect(all.length).toBe(3)
			expect(all.every(r => r.name === 'updated')).toBe(true)

			// Verify big records still have their data
			const bigRecords = all.filter(r => r.bigField === bigValue)
			expect(bigRecords.length).toBe(2)

			const smallRecord = all.find(r => r.bigField === 'tiny')
			expect(smallRecord).toBeDefined()
		})
	})

	describe('deleteMany (Bug 4)', () => {
		it('deleteMany deletes segment data for segmented records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			await BigItem.create({
				name: 'big',
				bigField: 'x'.repeat(150_000),
				value: 1
			})

			const result = await BigItem.deleteMany({
				where: { name: 'big' }
			})
			expect(result.count).toBe(1)

			const all = await BigItem.findMany()
			expect(all.length).toBe(0)
		})

		it('deleteMany does not leave orphaned segments', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const created = await BigItem.create({
				name: 'big',
				bigField: 'x'.repeat(150_000),
				value: 1
			})

			await BigItem.deleteMany({
				where: { name: 'big' }
			})

			// Verify the record is fully gone
			const found = await BigItem.findUnique({ where: { id: created.id } })
			expect(found).toBeNull()

			const total = await BigItem.count()
			expect(total).toBe(0)
		})

		it('deleteMany mixed: chunk and segmented records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			await BigItem.create({ name: 'small1', bigField: 'tiny', value: 1 })
			await BigItem.create({ name: 'small2', bigField: 'also tiny', value: 2 })
			await BigItem.create({ name: 'big1', bigField: 'x'.repeat(150_000), value: 3 })
			await BigItem.create({ name: 'big2', bigField: 'y'.repeat(150_000), value: 4 })

			const result = await BigItem.deleteMany({
				where: { value: { gte: 0 } }
			})
			expect(result.count).toBe(4)

			const all = await BigItem.findMany()
			expect(all.length).toBe(0)

			const total = await BigItem.count()
			expect(total).toBe(0)
		})
	})
})
