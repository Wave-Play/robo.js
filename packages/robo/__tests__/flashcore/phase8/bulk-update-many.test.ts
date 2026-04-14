/**
 * Flashcore v1 (spec rev 4.3) Phase 8 - updateMany Tests
 *
 * Tests the updateMany bulk operation.
 */

import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { f } from '../../../src/flashcore/schema/field.js'
import { UniqueConstraintError, SafetyError } from '../../../src/flashcore/core/errors.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'

interface User {
	id: string
	name: string
	email: string
	age: number
	role: string
}

describe('updateMany Operation', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	describe('Basic Functionality', () => {
		it('should update matching records', async () => {
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

			const result = await User.updateMany({
				where: { role: 'user' },
				data: { role: 'member' }
			})

			expect(result.count).toBe(2)

			const users = await User.findMany()
			const members = users.filter(u => u.role === 'member')
			expect(members.length).toBe(2)
		})

		it('should update with comparison operators', async () => {
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

			const result = await User.updateMany({
				where: { age: { gte: 35 } },
				data: { role: 'senior' }
			})

			expect(result.count).toBe(2)

			const seniors = await User.findMany({ where: { role: 'senior' } })
			expect(seniors.length).toBe(2)
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

			const result = await User.updateMany({
				where: { role: 'nonexistent' },
				data: { age: 99 }
			})

			expect(result.count).toBe(0)
		})

		it('should update multiple fields', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })

			await User.updateMany({
				where: { name: 'Alice' },
				data: { age: 31, role: 'admin' }
			})

			const alice = await User.findFirst({ where: { name: 'Alice' } })
			expect(alice?.age).toBe(31)
			expect(alice?.role).toBe('admin')
		})
	})

	describe('Unique Constraints', () => {
		it('should enforce unique constraints', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })
			await User.create({ name: 'Bob', email: 'bob@test.com', age: 25, role: 'user' })

			await expect(User.updateMany({
				where: { name: 'Bob' },
				data: { email: 'alice@test.com' }
			})).rejects.toThrow(UniqueConstraintError)
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

			// Empty where clause should trigger safety check
			await expect(User.updateMany({
				where: {},
				data: { role: 'all' }
			})).rejects.toThrow(SafetyError)
		})
	})

	describe('Atomicity', () => {
		it('should rollback all on constraint failure', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })
			await User.create({ name: 'Bob', email: 'bob@test.com', age: 25, role: 'user' })
			await User.create({ name: 'Charlie', email: 'charlie@test.com', age: 35, role: 'user' })

			try {
				// This would make all emails the same, violating uniqueness
				await User.updateMany({
					where: { role: 'user' },
					data: { email: 'same@test.com' }
				})
			} catch {
				// Expected
			}

			// Original emails should be preserved
			const alice = await User.findFirst({ where: { name: 'Alice' } })
			expect(alice?.email).toBe('alice@test.com')
		})
	})

	describe('Complex Queries', () => {
		it('should update with AND conditions', async () => {
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

			const result = await User.updateMany({
				where: {
					AND: [
						{ age: 30 },
						{ role: 'user' }
					]
				},
				data: { role: 'senior' }
			})

			expect(result.count).toBe(1)

			const alice = await User.findFirst({ where: { name: 'Alice' } })
			expect(alice?.role).toBe('senior')
		})

		it('should update with OR conditions', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })
			await User.create({ name: 'Bob', email: 'bob@test.com', age: 25, role: 'admin' })
			await User.create({ name: 'Charlie', email: 'charlie@test.com', age: 35, role: 'guest' })

			const result = await User.updateMany({
				where: {
					OR: [
						{ role: 'user' },
						{ role: 'guest' }
					]
				},
				data: { role: 'member' }
			})

			expect(result.count).toBe(2)

			const members = await User.findMany({ where: { role: 'member' } })
			expect(members.length).toBe(2)
		})
	})
})
