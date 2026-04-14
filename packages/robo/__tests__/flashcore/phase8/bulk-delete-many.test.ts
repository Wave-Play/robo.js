/**
 * Flashcore v1 (spec rev 4.3) Phase 8 - deleteMany Tests
 *
 * Tests the deleteMany bulk operation.
 */

import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { f } from '../../../src/flashcore/schema/field.js'
import { SafetyError } from '../../../src/flashcore/core/errors.js'

interface User {
	id: string
	name: string
	email: string
	age: number
	role: string
}

describe('deleteMany Operation', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	describe('Basic Functionality', () => {
		it('should delete matching records', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })
			await User.create({ name: 'Bob', email: 'bob@test.com', age: 25, role: 'user' })
			await User.create({ name: 'Charlie', email: 'charlie@test.com', age: 35, role: 'admin' })

			const result = await User.deleteMany({
				where: { role: 'user' }
			})

			expect(result.count).toBe(2)

			const remaining = await User.findMany()
			expect(remaining.length).toBe(1)
			expect(remaining[0].name).toBe('Charlie')
		})

		it('should delete with comparison operators', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Young', email: 'young@test.com', age: 20, role: 'user' })
			await User.create({ name: 'Middle', email: 'middle@test.com', age: 35, role: 'user' })
			await User.create({ name: 'Old', email: 'old@test.com', age: 50, role: 'user' })

			const result = await User.deleteMany({
				where: { age: { lt: 30 } }
			})

			expect(result.count).toBe(1)

			const remaining = await User.findMany()
			expect(remaining.length).toBe(2)
			expect(remaining.every(u => u.age >= 30)).toBe(true)
		})

		it('should return 0 count when no matches', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })

			const result = await User.deleteMany({
				where: { role: 'nonexistent' }
			})

			expect(result.count).toBe(0)

			const remaining = await User.findMany()
			expect(remaining.length).toBe(1)
		})

		it('should delete all matching records', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			// Create many records with same role
			for (let i = 0; i < 10; i++) {
				await User.create({
					name: `User${i}`,
					email: `user${i}@test.com`,
					age: 20 + i,
					role: 'temp'
				})
			}
			await User.create({ name: 'Keeper', email: 'keeper@test.com', age: 40, role: 'permanent' })

			const result = await User.deleteMany({
				where: { role: 'temp' }
			})

			expect(result.count).toBe(10)

			const remaining = await User.findMany()
			expect(remaining.length).toBe(1)
			expect(remaining[0].name).toBe('Keeper')
		})
	})

	describe('Safety Limits', () => {
		it('should require where clause', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })
			await User.create({ name: 'Bob', email: 'bob@test.com', age: 25, role: 'user' })

			// Empty where clause should trigger safety check
			await expect(User.deleteMany({
				where: {}
			})).rejects.toThrow(SafetyError)

			// Records should still exist
			const remaining = await User.findMany()
			expect(remaining.length).toBe(2)
		})
	})

	describe('Complex Queries', () => {
		it('should delete with AND conditions', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })
			await User.create({ name: 'Bob', email: 'bob@test.com', age: 30, role: 'admin' })
			await User.create({ name: 'Charlie', email: 'charlie@test.com', age: 25, role: 'user' })

			const result = await User.deleteMany({
				where: {
					AND: [
						{ age: 30 },
						{ role: 'user' }
					]
				}
			})

			expect(result.count).toBe(1)

			const remaining = await User.findMany()
			expect(remaining.length).toBe(2)
			expect(remaining.map(u => u.name).sort()).toEqual(['Bob', 'Charlie'])
		})

		it('should delete with OR conditions', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'temp' })
			await User.create({ name: 'Bob', email: 'bob@test.com', age: 25, role: 'guest' })
			await User.create({ name: 'Charlie', email: 'charlie@test.com', age: 35, role: 'admin' })

			const result = await User.deleteMany({
				where: {
					OR: [
						{ role: 'temp' },
						{ role: 'guest' }
					]
				}
			})

			expect(result.count).toBe(2)

			const remaining = await User.findMany()
			expect(remaining.length).toBe(1)
			expect(remaining[0].name).toBe('Charlie')
		})

		it('should delete with NOT conditions', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'admin' })
			await User.create({ name: 'Bob', email: 'bob@test.com', age: 25, role: 'user' })
			await User.create({ name: 'Charlie', email: 'charlie@test.com', age: 35, role: 'user' })

			const result = await User.deleteMany({
				where: {
					NOT: { role: 'admin' }
				}
			})

			expect(result.count).toBe(2)

			const remaining = await User.findMany()
			expect(remaining.length).toBe(1)
			expect(remaining[0].role).toBe('admin')
		})

		it('should delete with range conditions', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Teen', email: 'teen@test.com', age: 18, role: 'user' })
			await User.create({ name: 'Young', email: 'young@test.com', age: 25, role: 'user' })
			await User.create({ name: 'Middle', email: 'middle@test.com', age: 40, role: 'user' })
			await User.create({ name: 'Senior', email: 'senior@test.com', age: 60, role: 'user' })

			const result = await User.deleteMany({
				where: { age: { gte: 20, lte: 50 } }
			})

			expect(result.count).toBe(2)

			const remaining = await User.findMany()
			expect(remaining.length).toBe(2)
			expect(remaining.map(u => u.age).sort((a, b) => a - b)).toEqual([18, 60])
		})
	})

	describe('Unique Index Cleanup', () => {
		it('should release unique constraints', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })

			await User.deleteMany({
				where: { name: 'Alice' }
			})

			// Should be able to reuse the email
			const newUser = await User.create({ name: 'New Alice', email: 'alice@test.com', age: 25, role: 'user' })
			expect(newUser.email).toBe('alice@test.com')
		})
	})
})
