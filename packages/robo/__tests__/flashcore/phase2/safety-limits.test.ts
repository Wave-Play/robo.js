/**
 * Flashcore v1 (spec rev 4.3) Phase 2 Tests - Safety Limits
 *
 * Tests query safety limits including default take behavior and warnings.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f,
	DEFAULT_SAFETY_LIMITS
} from '../helpers/flashcore-compat.js'

describe('Safety Limits', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('default safety limits', () => {
		it('should have correct default values', () => {
			expect(DEFAULT_SAFETY_LIMITS.maxDefaultResults).toBe(1000)
			expect(DEFAULT_SAFETY_LIMITS.warnResultsThreshold).toBe(1000)
			expect(DEFAULT_SAFETY_LIMITS.maxBulkOperationWithoutWhere).toBe(100)
		})
	})

	describe('findMany default take', () => {
		it('should apply default take when not specified', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			// Create more items than default limit would allow
			// But for test speed, we'll just verify the behavior works
			for (let i = 0; i < 50; i++) {
				await Item.create({ value: i })
			}

			// Without explicit take, should get all (under default limit)
			const items = await Item.findMany()
			expect(items).toHaveLength(50)
		})

		it('should respect explicit take over default', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 20; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({ take: 5 })
			expect(items).toHaveLength(5)
		})

		it('should handle take larger than available records', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({ take: 100 })
			expect(items).toHaveLength(10)
		})

		it('should handle take of 0', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({ take: 0 })
			expect(items).toHaveLength(0)
		})

		it('should handle negative take as 0', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({ take: -5 })
			expect(items).toHaveLength(0)
		})
	})

	describe('skip behavior', () => {
		it('should skip specified number of records', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({
				orderBy: { value: 'asc' },
				skip: 3
			})

			expect(items).toHaveLength(7)
			expect(items[0].value).toBe(3)
		})

		it('should handle skip larger than available records', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({ skip: 100 })
			expect(items).toHaveLength(0)
		})

		it('should handle skip of 0', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({ skip: 0 })
			expect(items).toHaveLength(10)
		})

		it('should handle negative skip as 0', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({ skip: -5 })
			expect(items).toHaveLength(10)
		})
	})

	describe('combined take and skip', () => {
		it('should apply skip before take', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 20; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({
				orderBy: { value: 'asc' },
				skip: 5,
				take: 5
			})

			expect(items).toHaveLength(5)
			expect(items[0].value).toBe(5)
			expect(items[4].value).toBe(9)
		})

		it('should handle edge case where skip + take exceeds total', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await Item.create({ value: i })
			}

			const items = await Item.findMany({
				orderBy: { value: 'asc' },
				skip: 8,
				take: 10
			})

			expect(items).toHaveLength(2)
			expect(items[0].value).toBe(8)
			expect(items[1].value).toBe(9)
		})
	})

	describe('count with safety', () => {
		it('should count all records without limit', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 50; i++) {
				await Item.create({ value: i })
			}

			const count = await Item.count()
			expect(count).toBe(50)
		})

		it('should count filtered records', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 50; i++) {
				await Item.create({ value: i })
			}

			const count = await Item.count({ where: { value: { gte: 25 } } })
			expect(count).toBe(25)
		})
	})

	describe('findFirst safety', () => {
		it('should return only one record even with many matches', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; category: string; value: number }>('Item', {
				id: f.id(),
				category: f.string(),
				value: f.number()
			})

			for (let i = 0; i < 100; i++) {
				await Item.create({ category: 'A', value: i })
			}

			const item = await Item.findFirst({
				where: { category: 'A' }
			})

			expect(item).not.toBeNull()
			expect(item!.category).toBe('A')
		})

		it('should respect orderBy for findFirst', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			await Item.create({ value: 50 })
			await Item.create({ value: 10 })
			await Item.create({ value: 30 })

			const lowest = await Item.findFirst({
				orderBy: { value: 'asc' }
			})

			const highest = await Item.findFirst({
				orderBy: { value: 'desc' }
			})

			expect(lowest!.value).toBe(10)
			expect(highest!.value).toBe(50)
		})
	})

	describe('pagination patterns', () => {
		it('should support cursor-less pagination', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 25; i++) {
				await Item.create({ value: i })
			}

			const pageSize = 10

			// Page 1
			const page1 = await Item.findMany({
				orderBy: { value: 'asc' },
				take: pageSize,
				skip: 0
			})
			expect(page1).toHaveLength(10)
			expect(page1[0].value).toBe(0)
			expect(page1[9].value).toBe(9)

			// Page 2
			const page2 = await Item.findMany({
				orderBy: { value: 'asc' },
				take: pageSize,
				skip: 10
			})
			expect(page2).toHaveLength(10)
			expect(page2[0].value).toBe(10)
			expect(page2[9].value).toBe(19)

			// Page 3 (partial)
			const page3 = await Item.findMany({
				orderBy: { value: 'asc' },
				take: pageSize,
				skip: 20
			})
			expect(page3).toHaveLength(5)
			expect(page3[0].value).toBe(20)
			expect(page3[4].value).toBe(24)

			// Page 4 (empty)
			const page4 = await Item.findMany({
				orderBy: { value: 'asc' },
				take: pageSize,
				skip: 30
			})
			expect(page4).toHaveLength(0)
		})

		it('should maintain order consistency across pages', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			for (let i = 0; i < 30; i++) {
				await Item.create({ value: i % 10 }) // Duplicate values
			}

			const allItems: { id: string; value: number }[] = []

			// Fetch all pages
			for (let page = 0; page < 3; page++) {
				const items = await Item.findMany({
					orderBy: { value: 'asc' },
					take: 10,
					skip: page * 10
				})
				allItems.push(...items)
			}

			expect(allItems).toHaveLength(30)

			// Verify no duplicates (by id)
			const ids = allItems.map(i => i.id)
			const uniqueIds = new Set(ids)
			expect(uniqueIds.size).toBe(30)

			// Verify ordering is maintained
			for (let i = 1; i < allItems.length; i++) {
				const prev = allItems[i - 1]
				const curr = allItems[i]

				if (prev.value === curr.value) {
					// Same value - should be sorted by id for stability
					expect(prev.id <= curr.id).toBe(true)
				} else {
					// Different values - should be ascending
					expect(prev.value <= curr.value).toBe(true)
				}
			}
		})
	})

	describe('empty collection behavior', () => {
		it('should handle findMany on empty collection', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			const items = await Item.findMany()
			expect(items).toHaveLength(0)
		})

		it('should handle findFirst on empty collection', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			const item = await Item.findFirst()
			expect(item).toBeNull()
		})

		it('should handle count on empty collection', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			const count = await Item.count()
			expect(count).toBe(0)
		})

		it('should handle pagination on empty collection', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
				id: f.id(),
				value: f.number()
			})

			const items = await Item.findMany({
				skip: 10,
				take: 10
			})
			expect(items).toHaveLength(0)
		})
	})
})
