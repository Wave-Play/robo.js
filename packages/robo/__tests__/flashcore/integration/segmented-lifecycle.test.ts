/**
 * Flashcore - Segmented Record Lifecycle Integration Tests
 *
 * End-to-end lifecycle tests exercising all fixed paths together:
 * create, read, update, delete, upsert, bulk ops — with mixed chunk/segment records.
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

describe('Segmented Record Lifecycle', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('full CRUD: create large -> findUnique -> update -> findMany -> delete', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)
		const created = await BigItem.create({
			name: 'large-record',
			bigField: bigValue,
			value: 1
		})

		// findUnique returns the full record
		const found = await BigItem.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.bigField).toBe(bigValue)
		expect(found!.value).toBe(1)

		// update non-big field
		await BigItem.update({ where: { id: created.id }, data: { value: 99 } })

		// findMany returns the updated record
		const all = await BigItem.findMany()
		expect(all.length).toBe(1)
		expect(all[0].value).toBe(99)
		expect(all[0].bigField).toBe(bigValue)

		// delete
		await BigItem.delete({ where: { id: created.id } })

		// gone
		const deleted = await BigItem.findUnique({ where: { id: created.id } })
		expect(deleted).toBeNull()

		const count = await BigItem.count()
		expect(count).toBe(0)
	})

	it('transition: create small -> update to large -> update back to small -> delete', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const created = await BigItem.create({
			name: 'transitional',
			bigField: 'tiny',
			value: 10
		})

		// chunk -> segments
		const bigValue = 'x'.repeat(150_000)
		await BigItem.update({ where: { id: created.id }, data: { bigField: bigValue } })

		const large = await BigItem.findUnique({ where: { id: created.id } })
		expect(large).not.toBeNull()
		expect(large!.bigField).toBe(bigValue)

		// segments -> chunk
		await BigItem.update({ where: { id: created.id }, data: { bigField: 'small again' } })

		const small = await BigItem.findUnique({ where: { id: created.id } })
		expect(small).not.toBeNull()
		expect(small!.bigField).toBe('small again')

		// delete
		await BigItem.delete({ where: { id: created.id } })

		const gone = await BigItem.findUnique({ where: { id: created.id } })
		expect(gone).toBeNull()

		const count = await BigItem.count()
		expect(count).toBe(0)
	})

	it('mixed: create N small + M large, findMany returns all, deleteMany removes correctly', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		// 3 small records
		await BigItem.create({ name: 'small-1', bigField: 'a', value: 1 })
		await BigItem.create({ name: 'small-2', bigField: 'b', value: 2 })
		await BigItem.create({ name: 'small-3', bigField: 'c', value: 3 })

		// 2 large records
		await BigItem.create({ name: 'big-1', bigField: 'x'.repeat(150_000), value: 4 })
		await BigItem.create({ name: 'big-2', bigField: 'y'.repeat(150_000), value: 5 })

		const all = await BigItem.findMany()
		expect(all.length).toBe(5)

		const count = await BigItem.count()
		expect(count).toBe(5)

		// deleteMany removes all
		const deleteResult = await BigItem.deleteMany({ where: { value: { gte: 0 } } })
		expect(deleteResult.count).toBe(5)

		const remaining = await BigItem.findMany()
		expect(remaining.length).toBe(0)

		const finalCount = await BigItem.count()
		expect(finalCount).toBe(0)
	})

	it('upsert cycle: create large, upsert update large, upsert update to small', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)
		const created = await BigItem.create({
			name: 'upsert-target',
			bigField: bigValue,
			value: 1
		})

		// upsert update — still segmented
		await BigItem.upsert({
			where: { id: created.id },
			update: { value: 42 },
			create: { name: 'unused', bigField: 'unused', value: 0 }
		})

		const afterUpsert1 = await BigItem.findUnique({ where: { id: created.id } })
		expect(afterUpsert1).not.toBeNull()
		expect(afterUpsert1!.value).toBe(42)
		expect(afterUpsert1!.bigField).toBe(bigValue)

		// upsert update — segments -> chunk
		await BigItem.upsert({
			where: { id: created.id },
			update: { bigField: 'shrunk' },
			create: { name: 'unused', bigField: 'unused', value: 0 }
		})

		const afterUpsert2 = await BigItem.findUnique({ where: { id: created.id } })
		expect(afterUpsert2).not.toBeNull()
		expect(afterUpsert2!.bigField).toBe('shrunk')

		const all = await BigItem.findMany()
		expect(all.length).toBe(1)
	})

	it('bulk mixed: createMany, updateMany on segmented subset, deleteMany cleanup', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		const bigValue = 'x'.repeat(150_000)
		const createResult = await BigItem.createMany({
			data: [
				{ name: 'small1', bigField: 'a', value: 1 },
				{ name: 'small2', bigField: 'b', value: 2 },
				{ name: 'big1', bigField: bigValue, value: 3 },
				{ name: 'big2', bigField: bigValue, value: 4 }
			]
		})

		expect(createResult.count).toBe(4)

		const count = await BigItem.count()
		expect(count).toBe(4)

		// updateMany on segmented record
		const updateResult = await BigItem.updateMany({
			where: { name: 'big1' },
			data: { value: 999 }
		})
		expect(updateResult.count).toBe(1)

		const big1 = await BigItem.findFirst({ where: { name: 'big1' } })
		expect(big1).not.toBeNull()
		expect(big1!.value).toBe(999)
		expect(big1!.bigField).toBe(bigValue)

		// deleteMany removes all
		const deleteResult = await BigItem.deleteMany({ where: { value: { gte: 0 } } })
		expect(deleteResult.count).toBe(4)

		const finalCount = await BigItem.count()
		expect(finalCount).toBe(0)

		const finalAll = await BigItem.findMany()
		expect(finalAll.length).toBe(0)
	})

	it('count accurate through all operations on mixed records', async () => {
		const BigItem = FlashcoreSystem.registerModel<BigItem>('BigItem', {
			id: f.id(),
			name: f.string(),
			bigField: f.string(),
			value: f.number()
		})

		// Start at 0
		expect(await BigItem.count()).toBe(0)

		// Create 2 small, 2 large
		const small1 = await BigItem.create({ name: 'small1', bigField: 'a', value: 1 })
		const small2 = await BigItem.create({ name: 'small2', bigField: 'b', value: 2 })
		const big1 = await BigItem.create({ name: 'big1', bigField: 'x'.repeat(150_000), value: 3 })
		await BigItem.create({ name: 'big2', bigField: 'y'.repeat(150_000), value: 4 })
		expect(await BigItem.count()).toBe(4)

		// Delete 1 small
		await BigItem.delete({ where: { id: small1.id } })
		expect(await BigItem.count()).toBe(3)

		// Update 1 small to large (count unchanged)
		await BigItem.update({ where: { id: small2.id }, data: { bigField: 'z'.repeat(150_000) } })
		expect(await BigItem.count()).toBe(3)

		// Delete 1 large
		await BigItem.delete({ where: { id: big1.id } })
		expect(await BigItem.count()).toBe(2)

		// deleteMany remaining
		await BigItem.deleteMany({ where: { value: { gte: 0 } } })
		expect(await BigItem.count()).toBe(0)
	})
})
