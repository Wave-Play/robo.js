/**
 * Flashcore v1 (spec rev 4.3) Phase 2 Tests - Where Operators
 *
 * Tests all where clause operators: equals, not, gt/gte/lt/lte, in, string ops, AND/OR/NOT.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

describe('Where Operators', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('equals (shorthand)', () => {
		it('should match exact string value', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })
			await User.create({ name: 'Bob' })

			const results = await User.findMany({ where: { name: 'Alice' } })

			expect(results).toHaveLength(1)
			expect(results[0].name).toBe('Alice')
		})

		it('should match exact number value', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Alice', age: 25 })
			await User.create({ name: 'Bob', age: 30 })

			const results = await User.findMany({ where: { age: 25 } })

			expect(results).toHaveLength(1)
			expect(results[0].name).toBe('Alice')
		})

		it('should match boolean value', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; active: boolean }>('User', {
				id: f.id(),
				name: f.string(),
				active: f.boolean()
			})

			await User.create({ name: 'Alice', active: true })
			await User.create({ name: 'Bob', active: false })

			const results = await User.findMany({ where: { active: true } })

			expect(results).toHaveLength(1)
			expect(results[0].name).toBe('Alice')
		})
	})

	describe('equals (explicit)', () => {
		it('should match with equals operator', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })
			await User.create({ name: 'Bob' })

			const results = await User.findMany({ where: { name: { equals: 'Bob' } } })

			expect(results).toHaveLength(1)
			expect(results[0].name).toBe('Bob')
		})
	})

	describe('not', () => {
		it('should exclude matching values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })
			await User.create({ name: 'Bob' })
			await User.create({ name: 'Charlie' })

			const results = await User.findMany({ where: { name: { not: 'Alice' } } })

			expect(results).toHaveLength(2)
			expect(results.map(r => r.name).sort()).toEqual(['Bob', 'Charlie'])
		})
	})

	describe('gt/gte/lt/lte', () => {
		beforeEach(async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Alice', age: 20 })
			await User.create({ name: 'Bob', age: 25 })
			await User.create({ name: 'Charlie', age: 30 })
		})

		it('should filter with gt', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({ where: { age: { gt: 25 } } })

			expect(results).toHaveLength(1)
			expect(results[0].name).toBe('Charlie')
		})

		it('should filter with gte', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({ where: { age: { gte: 25 } } })

			expect(results).toHaveLength(2)
			expect(results.map((r: any) => r.name).sort()).toEqual(['Bob', 'Charlie'])
		})

		it('should filter with lt', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({ where: { age: { lt: 25 } } })

			expect(results).toHaveLength(1)
			expect(results[0].name).toBe('Alice')
		})

		it('should filter with lte', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({ where: { age: { lte: 25 } } })

			expect(results).toHaveLength(2)
			expect(results.map((r: any) => r.name).sort()).toEqual(['Alice', 'Bob'])
		})

		it('should filter with range (gte + lt)', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({ where: { age: { gte: 20, lt: 30 } } })

			expect(results).toHaveLength(2)
			expect(results.map((r: any) => r.name).sort()).toEqual(['Alice', 'Bob'])
		})
	})

	describe('in', () => {
		it('should match values in array', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; role: string }>('User', {
				id: f.id(),
				name: f.string(),
				role: f.string()
			})

			await User.create({ name: 'Alice', role: 'admin' })
			await User.create({ name: 'Bob', role: 'user' })
			await User.create({ name: 'Charlie', role: 'moderator' })

			const results = await User.findMany({ where: { role: { in: ['admin', 'moderator'] } } })

			expect(results).toHaveLength(2)
			expect(results.map(r => r.name).sort()).toEqual(['Alice', 'Charlie'])
		})

		it('should handle empty in array', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })

			const results = await User.findMany({ where: { name: { in: [] } } })

			expect(results).toHaveLength(0)
		})
	})

	describe('string operators', () => {
		beforeEach(async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string }>('User', {
				id: f.id(),
				email: f.string()
			})

			await User.create({ email: 'alice@example.com' })
			await User.create({ email: 'bob@example.com' })
			await User.create({ email: 'charlie@test.org' })
		})

		it('should filter with contains', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({ where: { email: { contains: 'example' } } })

			expect(results).toHaveLength(2)
		})

		it('should filter with startsWith', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({ where: { email: { startsWith: 'alice' } } })

			expect(results).toHaveLength(1)
			expect(results[0].email).toBe('alice@example.com')
		})

		it('should filter with endsWith', async () => {
			const User = FlashcoreSystem.getModel('User') as any

			const results = await User.findMany({ where: { email: { endsWith: '.org' } } })

			expect(results).toHaveLength(1)
			expect(results[0].email).toBe('charlie@test.org')
		})
	})

	describe('AND', () => {
		it('should require all conditions to match', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number; active: boolean }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number(),
				active: f.boolean()
			})

			await User.create({ name: 'Alice', age: 25, active: true })
			await User.create({ name: 'Bob', age: 30, active: true })
			await User.create({ name: 'Charlie', age: 25, active: false })

			const results = await User.findMany({
				where: {
					AND: [
						{ age: 25 },
						{ active: true }
					]
				}
			})

			expect(results).toHaveLength(1)
			expect(results[0].name).toBe('Alice')
		})
	})

	describe('OR', () => {
		it('should match if any condition matches', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Alice', age: 20 })
			await User.create({ name: 'Bob', age: 25 })
			await User.create({ name: 'Charlie', age: 30 })

			const results = await User.findMany({
				where: {
					OR: [
						{ age: 20 },
						{ age: 30 }
					]
				}
			})

			expect(results).toHaveLength(2)
			expect(results.map(r => r.name).sort()).toEqual(['Alice', 'Charlie'])
		})
	})

	describe('NOT', () => {
		it('should negate inner condition', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; active: boolean }>('User', {
				id: f.id(),
				name: f.string(),
				active: f.boolean()
			})

			await User.create({ name: 'Alice', active: true })
			await User.create({ name: 'Bob', active: false })
			await User.create({ name: 'Charlie', active: true })

			const results = await User.findMany({
				where: {
					NOT: { active: true }
				}
			})

			expect(results).toHaveLength(1)
			expect(results[0].name).toBe('Bob')
		})
	})

	describe('combined conditions', () => {
		it('should support complex nested conditions', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; age: number; role: string }>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', age: 25, role: 'admin' })
			await User.create({ name: 'Bob', age: 30, role: 'user' })
			await User.create({ name: 'Charlie', age: 35, role: 'admin' })
			await User.create({ name: 'David', age: 40, role: 'user' })

			// Find admins OR users over 35
			const results = await User.findMany({
				where: {
					OR: [
						{ role: 'admin' },
						{ AND: [{ role: 'user' }, { age: { gt: 35 } }] }
					]
				}
			})

			expect(results).toHaveLength(3)
			expect(results.map(r => r.name).sort()).toEqual(['Alice', 'Charlie', 'David'])
		})
	})

	describe('null/undefined handling', () => {
		it('should match null values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; bio?: string | null }>('User', {
				id: f.id(),
				name: f.string(),
				bio: f.string().optional()
			})

			await User.create({ name: 'Alice', bio: 'Hello world' })
			await User.create({ name: 'Bob', bio: null })
			await User.create({ name: 'Charlie' }) // undefined

			// Find users with null bio
			const results = await User.findMany({ where: { bio: null } })

			expect(results).toHaveLength(1)
			expect(results[0].name).toBe('Bob')
		})
	})

	describe('no where clause', () => {
		it('should return all records when where is empty', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })
			await User.create({ name: 'Bob' })
			await User.create({ name: 'Charlie' })

			const results = await User.findMany({})

			expect(results).toHaveLength(3)
		})

		it('should return all records when no args', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })
			await User.create({ name: 'Bob' })

			const results = await User.findMany()

			expect(results).toHaveLength(2)
		})
	})
})
