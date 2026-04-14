/**
 * Flashcore v1 (spec rev 4.3) Phase 8 - createMany Tests
 *
 * Tests the createMany bulk operation.
 */

import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { f } from '../../../src/flashcore/schema/field.js'
import { UniqueConstraintError, ValidationError } from '../../../src/flashcore/core/errors.js'

interface User {
	id: string
	name: string
	email: string
	age: number
}

describe('createMany Operation', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	describe('Basic Functionality', () => {
		it('should create multiple records', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			const result = await User.createMany({
				data: [
					{ name: 'Alice', email: 'alice@test.com', age: 30 },
					{ name: 'Bob', email: 'bob@test.com', age: 25 },
					{ name: 'Charlie', email: 'charlie@test.com', age: 35 }
				]
			})

			expect(result.count).toBe(3)
			expect(result.records.length).toBe(3)
			expect(result.records.map(r => r.name).sort()).toEqual(['Alice', 'Bob', 'Charlie'])
		})

		it('should auto-generate IDs', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			const result = await User.createMany({
				data: [
					{ name: 'Alice', email: 'alice@test.com', age: 30 },
					{ name: 'Bob', email: 'bob@test.com', age: 25 }
				]
			})

			expect(result.records[0].id).toBeDefined()
			expect(result.records[1].id).toBeDefined()
			expect(result.records[0].id).not.toBe(result.records[1].id)
		})

		it('should use provided IDs', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			const result = await User.createMany({
				data: [
					{ id: 'user-1', name: 'Alice', email: 'alice@test.com', age: 30 },
					{ id: 'user-2', name: 'Bob', email: 'bob@test.com', age: 25 }
				]
			})

			expect(result.records[0].id).toBe('user-1')
			expect(result.records[1].id).toBe('user-2')
		})

		it('should apply default values', async () => {
			interface UserWithDefault {
				id: string
				name: string
				role?: string
			}

			const User = FlashcoreSystem.registerModel<UserWithDefault>('User', {
				id: f.id(),
				name: f.string(),
				role: f.string().default('user')
			})

			const result = await User.createMany({
				data: [
					{ name: 'Alice' },
					{ name: 'Bob', role: 'admin' }
				]
			})

			expect(result.records[0].role).toBe('user')
			expect(result.records[1].role).toBe('admin')
		})

		it('should return empty result for empty data array', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			const result = await User.createMany({ data: [] })

			expect(result.count).toBe(0)
			expect(result.records).toEqual([])
		})
	})

	describe('Validation', () => {
		it('should validate all records before creating', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			await expect(User.createMany({
				data: [
					{ name: 'Alice', email: 'alice@test.com', age: 30 },
					{ name: 'Bob', email: 'bob@test.com' } as unknown as Omit<User, 'id'> // Missing age
				]
			})).rejects.toThrow(ValidationError)

			// No records should be created
			const users = await User.findMany()
			expect(users.length).toBe(0)
		})

		it('should reject unknown fields', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			await expect(User.createMany({
				data: [
					{ name: 'Alice', email: 'alice@test.com', age: 30, extra: 'field' } as unknown as Omit<User, 'id'>
				]
			})).rejects.toThrow(ValidationError)
		})
	})

	describe('Unique Constraints', () => {
		it('should enforce unique constraints', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number()
			})

			await expect(User.createMany({
				data: [
					{ name: 'Alice', email: 'same@test.com', age: 30 },
					{ name: 'Bob', email: 'same@test.com', age: 25 }
				]
			})).rejects.toThrow(UniqueConstraintError)

			// No records should be created (atomic)
			const users = await User.findMany()
			expect(users.length).toBe(0)
		})

		it('should enforce unique constraints against existing records', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number()
			})

			// Create existing record
			await User.create({ name: 'Existing', email: 'taken@test.com', age: 40 })

			await expect(User.createMany({
				data: [
					{ name: 'New', email: 'taken@test.com', age: 30 }
				]
			})).rejects.toThrow(UniqueConstraintError)
		})

		it('should enforce ID uniqueness', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			await expect(User.createMany({
				data: [
					{ id: 'same-id', name: 'Alice', email: 'alice@test.com', age: 30 },
					{ id: 'same-id', name: 'Bob', email: 'bob@test.com', age: 25 }
				]
			})).rejects.toThrow(UniqueConstraintError)
		})
	})

	describe('Atomicity', () => {
		it('should rollback all on failure', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number()
			})

			try {
				await User.createMany({
					data: [
						{ name: 'Alice', email: 'alice@test.com', age: 30 },
						{ name: 'Bob', email: 'bob@test.com', age: 25 },
						{ name: 'Charlie', email: 'alice@test.com', age: 35 } // Duplicate email
					]
				})
			} catch {
				// Expected to throw
			}

			// All records should be rolled back
			const users = await User.findMany()
			expect(users.length).toBe(0)
		})
	})

	describe('skipDuplicates Option', () => {
		it('should skip duplicate records when skipDuplicates is true', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number()
			})

			// Create existing record
			await User.create({ name: 'Existing', email: 'existing@test.com', age: 40 })

			const result = await User.createMany({
				data: [
					{ name: 'New', email: 'new@test.com', age: 30 },
					{ name: 'Conflict', email: 'existing@test.com', age: 25 } // Should be skipped
				],
				skipDuplicates: true
			})

			// Only non-duplicate should be created
			expect(result.count).toBe(1)
			expect(result.records[0].name).toBe('New')

			// Total should be 2
			const users = await User.findMany()
			expect(users.length).toBe(2)
		})
	})

	describe('Performance', () => {
		it('should handle large batches', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			const data = Array.from({ length: 100 }, (_, i) => ({
				name: `User${i}`,
				email: `user${i}@test.com`,
				age: 20 + (i % 50)
			}))

			const result = await User.createMany({ data })

			expect(result.count).toBe(100)
			expect(result.records.length).toBe(100)

			const users = await User.findMany()
			expect(users.length).toBe(100)
		})
	})
})
