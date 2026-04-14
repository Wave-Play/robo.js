/**
 * Flashcore - Segmented Record CRUD Tests
 *
 * Tests that findMany, findFirst, count, and stream correctly
 * include records stored with segment-based chunking (kind: 'segments').
 * Regression tests for Bug 1: loadAllRecords() only iterating chunks.
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

describe('Segmented Record CRUD', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('findMany with segmented records (Bug 1)', () => {
		it('findMany returns segmented records in full scan', async () => {
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

			const results = await BigItem.findMany()
			expect(results.length).toBe(1)
			expect(results[0].id).toBe(created.id)
			expect(results[0].bigField).toBe(bigValue)
		})

		it('findMany with where clause filters segmented records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			await BigItem.create({
				name: 'big',
				bigField: 'x'.repeat(150_000),
				value: 42
			})

			const found = await BigItem.findMany({ where: { value: 42 } })
			expect(found.length).toBe(1)
			expect(found[0].value).toBe(42)

			const notFound = await BigItem.findMany({ where: { value: 99 } })
			expect(notFound.length).toBe(0)
		})

		it('findFirst finds a segmented record', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			await BigItem.create({
				name: 'big',
				bigField: 'x'.repeat(150_000),
				value: 10
			})

			const result = await BigItem.findFirst({ where: { name: 'big' } })
			expect(result).not.toBeNull()
			expect(result!.name).toBe('big')
		})

		it('count with where includes segmented records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			// Create 1 normal record
			await BigItem.create({
				name: 'small',
				bigField: 'tiny',
				value: 5
			})

			// Create 1 segmented record
			await BigItem.create({
				name: 'big',
				bigField: 'x'.repeat(150_000),
				value: 10
			})

			const total = await BigItem.count({ where: { value: { gte: 0 } } })
			expect(total).toBe(2)
		})

		it('count without where includes segmented records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			await BigItem.create({
				name: 'small',
				bigField: 'tiny',
				value: 1
			})

			await BigItem.create({
				name: 'big',
				bigField: 'x'.repeat(150_000),
				value: 2
			})

			const total = await BigItem.count()
			expect(total).toBe(2)
		})

		it('findManyStream yields segmented records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			const bigValue = 'x'.repeat(150_000)
			await BigItem.create({
				name: 'big',
				bigField: bigValue,
				value: 7
			})

			const collected: BigItem[] = []
			for await (const item of BigItem.findManyStream()) {
				collected.push(item)
			}

			expect(collected.length).toBe(1)
			expect(collected[0].bigField).toBe(bigValue)
		})

		it('mixed chunk and segmented records all appear in findMany', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			// Create 3 normal records
			await BigItem.create({ name: 'small-1', bigField: 'a', value: 1 })
			await BigItem.create({ name: 'small-2', bigField: 'b', value: 2 })
			await BigItem.create({ name: 'small-3', bigField: 'c', value: 3 })

			// Create 2 segmented records
			await BigItem.create({ name: 'big-1', bigField: 'x'.repeat(150_000), value: 4 })
			await BigItem.create({ name: 'big-2', bigField: 'y'.repeat(150_000), value: 5 })

			const results = await BigItem.findMany({ take: 100 })
			expect(results.length).toBe(5)
		})

		it('orderBy sorts across chunk and segment records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			await BigItem.create({ name: 'normal', bigField: 'small', value: 2 })
			await BigItem.create({ name: 'big', bigField: 'x'.repeat(150_000), value: 1 })
			await BigItem.create({ name: 'normal2', bigField: 'small2', value: 3 })

			const results = await BigItem.findMany({ orderBy: { value: 'asc' } })
			expect(results.length).toBe(3)
			expect(results[0].value).toBe(1)
			expect(results[1].value).toBe(2)
			expect(results[2].value).toBe(3)
		})

		it('skip/take paginates across chunk and segment records', async () => {
			const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
				id: f.id(),
				name: f.string(),
				bigField: f.string(),
				value: f.number()
			})

			// Create 3 normal + 2 segmented (values 1-5)
			await BigItem.create({ name: 'small-1', bigField: 'a', value: 1 })
			await BigItem.create({ name: 'small-2', bigField: 'b', value: 2 })
			await BigItem.create({ name: 'small-3', bigField: 'c', value: 3 })
			await BigItem.create({ name: 'big-1', bigField: 'x'.repeat(150_000), value: 4 })
			await BigItem.create({ name: 'big-2', bigField: 'y'.repeat(150_000), value: 5 })

			const results = await BigItem.findMany({
				orderBy: { value: 'asc' },
				skip: 1,
				take: 2
			})
			expect(results.length).toBe(2)
			expect(results[0].value).toBe(2)
			expect(results[1].value).toBe(3)
		})
	})
})
