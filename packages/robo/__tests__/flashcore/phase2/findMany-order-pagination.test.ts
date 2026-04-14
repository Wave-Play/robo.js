/**
 * Flashcore v1 (spec rev 4.3) Phase 2 Tests - FindMany Ordering and Pagination
 *
 * Tests orderBy, take/skip pagination, and findFirst.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

describe('FindMany Ordering and Pagination', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('orderBy', () => {
		it('should sort by field ascending', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Charlie', age: 30 })
			await User.create({ name: 'Alice', age: 25 })
			await User.create({ name: 'Bob', age: 35 })

			const results = await User.findMany({
				orderBy: { age: 'asc' }
			})

			expect(results.map(r => r.name)).toEqual(['Alice', 'Charlie', 'Bob'])
		})

		it('should sort by field descending', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Charlie', age: 30 })
			await User.create({ name: 'Alice', age: 25 })
			await User.create({ name: 'Bob', age: 35 })

			const results = await User.findMany({
				orderBy: { age: 'desc' }
			})

			expect(results.map(r => r.name)).toEqual(['Bob', 'Charlie', 'Alice'])
		})

		it('should sort by string field', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Charlie' })
			await User.create({ name: 'Alice' })
			await User.create({ name: 'Bob' })

			const results = await User.findMany({
				orderBy: { name: 'asc' }
			})

			expect(results.map(r => r.name)).toEqual(['Alice', 'Bob', 'Charlie'])
		})

		it('should support multiple orderBy fields (array)', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number; role: string }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', age: 25, role: 'admin' })
			await User.create({ name: 'Bob', age: 25, role: 'user' })
			await User.create({ name: 'Charlie', age: 30, role: 'admin' })

			const results = await User.findMany({
				orderBy: [{ age: 'asc' }, { name: 'asc' }]
			})

			expect(results.map(r => r.name)).toEqual(['Alice', 'Bob', 'Charlie'])
		})

		it('should have deterministic ordering with id tiebreaker', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			// Create users with same age but different IDs
			await User.create({ id: 'user-c', name: 'Charlie', age: 25 })
			await User.create({ id: 'user-a', name: 'Alice', age: 25 })
			await User.create({ id: 'user-b', name: 'Bob', age: 25 })

			const results1 = await User.findMany({ orderBy: { age: 'asc' } })
			const results2 = await User.findMany({ orderBy: { age: 'asc' } })

			// Should be deterministic
			expect(results1.map(r => r.id)).toEqual(results2.map(r => r.id))

			// Should be sorted by id as tiebreaker
			expect(results1.map(r => r.id)).toEqual(['user-a', 'user-b', 'user-c'])
		})

		it('should handle null values (nulls last for asc)', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; score?: number | null }>('User', {
				id: f.id(),
				name: f.string(),
				score: f.number().optional()
			})

			await User.create({ id: 'u1', name: 'Alice', score: 100 })
			await User.create({ id: 'u2', name: 'Bob', score: null })
			await User.create({ id: 'u3', name: 'Charlie', score: 50 })

			const results = await User.findMany({ orderBy: { score: 'asc' } })

			// nulls should be last for ascending
			expect(results.map(r => r.name)).toEqual(['Charlie', 'Alice', 'Bob'])
		})

		it('should handle null values (nulls first for desc)', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; score?: number | null }>('User', {
				id: f.id(),
				name: f.string(),
				score: f.number().optional()
			})

			await User.create({ id: 'u1', name: 'Alice', score: 100 })
			await User.create({ id: 'u2', name: 'Bob', score: null })
			await User.create({ id: 'u3', name: 'Charlie', score: 50 })

			const results = await User.findMany({ orderBy: { score: 'desc' } })

			// nulls should be first for descending
			expect(results.map(r => r.name)).toEqual(['Bob', 'Alice', 'Charlie'])
		})
	})

	describe('take/skip pagination', () => {
		beforeEach(async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; index: number }>('User', {
				id: f.id(),
				name: f.string(),
				index: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await User.create({ id: `user-${i}`, name: `User ${i}`, index: i })
			}
		})

		it('should limit results with take', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({
				orderBy: { index: 'asc' },
				take: 3
			})

			expect(results).toHaveLength(3)
			expect(results.map((r: any) => r.index)).toEqual([0, 1, 2])
		})

		it('should skip results with skip', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({
				orderBy: { index: 'asc' },
				skip: 5
			})

			expect(results).toHaveLength(5)
			expect(results.map((r: any) => r.index)).toEqual([5, 6, 7, 8, 9])
		})

		it('should combine take and skip for pagination', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			// Page 2, page size 3
			const results = await User.findMany({
				orderBy: { index: 'asc' },
				take: 3,
				skip: 3
			})

			expect(results).toHaveLength(3)
			expect(results.map((r: any) => r.index)).toEqual([3, 4, 5])
		})

		it('should handle take larger than result set', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({
				orderBy: { index: 'asc' },
				take: 100
			})

			expect(results).toHaveLength(10)
		})

		it('should handle skip past result set', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({
				orderBy: { index: 'asc' },
				skip: 100
			})

			expect(results).toHaveLength(0)
		})

		it('should work with where clause', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({
				where: { index: { gte: 3 } },
				orderBy: { index: 'asc' },
				take: 3
			})

			expect(results).toHaveLength(3)
			expect(results.map((r: any) => r.index)).toEqual([3, 4, 5])
		})
	})

	describe('findFirst', () => {
		it('should return first matching record', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Charlie', age: 30 })
			await User.create({ name: 'Alice', age: 25 })
			await User.create({ name: 'Bob', age: 35 })

			const result = await User.findFirst({
				where: { age: { gt: 20 } },
				orderBy: { age: 'asc' }
			})

			expect(result).not.toBeNull()
			expect(result!.name).toBe('Alice')
		})

		it('should return null when no match', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Alice', age: 25 })

			const result = await User.findFirst({
				where: { age: { gt: 100 } }
			})

			expect(result).toBeNull()
		})

		it('should respect orderBy for first result', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Charlie', age: 30 })
			await User.create({ name: 'Alice', age: 25 })
			await User.create({ name: 'Bob', age: 35 })

			// Without orderBy, findFirst should still be deterministic (sorted by id)
			const result1 = await User.findFirst()
			const result2 = await User.findFirst()

			expect(result1).toEqual(result2)
		})
	})

	describe('count with filter', () => {
		it('should count all records without filter', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })
			await User.create({ name: 'Bob' })
			await User.create({ name: 'Charlie' })

			const count = await User.count()

			expect(count).toBe(3)
		})

		it('should count with where filter', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; active: boolean }>('User', {
				id: f.id(),
				name: f.string(),
				active: f.boolean()
			})

			await User.create({ name: 'Alice', active: true })
			await User.create({ name: 'Bob', active: false })
			await User.create({ name: 'Charlie', active: true })

			const count = await User.count({ where: { active: true } })

			expect(count).toBe(2)
		})

		it('should return 0 for no matches', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })

			const count = await User.count({ where: { name: 'Nobody' } })

			expect(count).toBe(0)
		})
	})

	describe('findManyStream', () => {
		it('should stream records', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; index: number }>('User', {
				id: f.id(),
				name: f.string(),
				index: f.number()
			})

			for (let i = 0; i < 5; i++) {
				await User.create({ name: `User ${i}`, index: i })
			}

			const results: any[] = []
			for await (const record of User.findManyStream({ orderBy: { index: 'asc' } })) {
				results.push(record)
			}

			expect(results).toHaveLength(5)
			expect(results.map(r => r.index)).toEqual([0, 1, 2, 3, 4])
		})

		it('should apply take to stream', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; index: number }>('User', {
				id: f.id(),
				name: f.string(),
				index: f.number()
			})

			for (let i = 0; i < 10; i++) {
				await User.create({ name: `User ${i}`, index: i })
			}

			const results: any[] = []
			for await (const record of User.findManyStream({ orderBy: { index: 'asc' }, take: 3 })) {
				results.push(record)
			}

			expect(results).toHaveLength(3)
			expect(results.map(r => r.index)).toEqual([0, 1, 2])
		})
	})
})
