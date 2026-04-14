/**
 * Flashcore v1 (spec rev 4.3) Phase 8 - Upsert Tests
 *
 * Tests the upsert operation (create or update).
 */

import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { f } from '../../../src/flashcore/schema/field.js'
import { ValidationError } from '../../../src/flashcore/core/errors.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'

interface User {
	id: string
	name: string
	email: string
	age: number
	role: string
}

interface Counter {
	id: string
	name: string
	value: number
}

describe('Upsert Operation', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	describe('Create Path (Record Does Not Exist)', () => {
		it('should create when record does not exist (ID-based)', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			const result = await User.upsert({
				where: { id: 'new-user' },
				create: { id: 'new-user', name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' },
				update: { age: 31 }
			})

			expect(result.id).toBe('new-user')
			expect(result.name).toBe('Alice')
			expect(result.age).toBe(30) // Create data used, not update

			const users = await User.findMany()
			expect(users.length).toBe(1)
		})

		it('should create when record does not exist (unique field-based)', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number(),
				role: f.string()
			})

			const result = await User.upsert({
				where: { email: 'new@test.com' },
				create: { name: 'Bob', email: 'new@test.com', age: 25, role: 'admin' },
				update: { role: 'superadmin' }
			})

			expect(result.email).toBe('new@test.com')
			expect(result.name).toBe('Bob')
			expect(result.role).toBe('admin') // Create data used

			const users = await User.findMany()
			expect(users.length).toBe(1)
		})

		it('should auto-generate ID when not provided in create', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number(),
				role: f.string()
			})

			const result = await User.upsert({
				where: { email: 'auto@test.com' },
				create: { name: 'Auto', email: 'auto@test.com', age: 20, role: 'user' },
				update: { age: 21 }
			})

			expect(result.id).toBeDefined()
			expect(result.id.length).toBeGreaterThan(0)
		})

		it('should copy missing where fields into create data', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number(),
				role: f.string()
			})

			const result = await User.upsert({
				where: { email: 'copied@test.com' },
				create: { name: 'Copied', age: 22, role: 'user' } as any,
				update: { role: 'admin' }
			})

			expect(result.email).toBe('copied@test.com')
		})

		it('should apply defaults on create', async () => {
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

			const result = await User.upsert({
				where: { id: 'default-test' },
				create: { id: 'default-test', name: 'Default' },
				update: { role: 'admin' }
			})

			expect(result.role).toBe('user')
		})
	})

	describe('Update Path (Record Exists)', () => {
		it('should update when record exists (ID-based)', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			// Create existing record
			await User.create({ id: 'existing', name: 'Alice', email: 'alice@test.com', age: 30, role: 'user' })

			const result = await User.upsert({
				where: { id: 'existing' },
				create: { id: 'existing', name: 'New Alice', email: 'new@test.com', age: 25, role: 'guest' },
				update: { age: 31, role: 'admin' }
			})

			expect(result.id).toBe('existing')
			expect(result.name).toBe('Alice') // Original name
			expect(result.age).toBe(31) // Updated
			expect(result.role).toBe('admin') // Updated

			const users = await User.findMany()
			expect(users.length).toBe(1)
		})

		it('should update when record exists (unique field-based)', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number(),
				role: f.string()
			})

			// Create existing record
			await User.create({ name: 'Bob', email: 'bob@test.com', age: 25, role: 'user' })

			const result = await User.upsert({
				where: { email: 'bob@test.com' },
				create: { name: 'New Bob', email: 'bob@test.com', age: 20, role: 'guest' },
				update: { role: 'moderator' }
			})

			expect(result.email).toBe('bob@test.com')
			expect(result.name).toBe('Bob') // Original
			expect(result.role).toBe('moderator') // Updated

			const users = await User.findMany()
			expect(users.length).toBe(1)
		})

		it('should update only specified fields', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ id: 'partial', name: 'Charlie', email: 'charlie@test.com', age: 35, role: 'user' })

			const result = await User.upsert({
				where: { id: 'partial' },
				create: { id: 'partial', name: 'New', email: 'new@test.com', age: 20, role: 'guest' },
				update: { age: 36 } // Only update age
			})

			expect(result.name).toBe('Charlie')
			expect(result.email).toBe('charlie@test.com')
			expect(result.age).toBe(36)
			expect(result.role).toBe('user')
		})
	})

	describe('Counter Pattern', () => {
		it('should increment counter on each upsert', async () => {
			const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
				id: f.id(),
				name: f.string(),
				value: f.number()
			})

			// First call - creates
			let result = await Counter.upsert({
				where: { id: 'page-views' },
				create: { id: 'page-views', name: 'Page Views', value: 1 },
				update: {} // Empty update for first call
			})
			expect(result.value).toBe(1)

			// Subsequent calls - read, increment, update
			for (let i = 2; i <= 5; i++) {
				const current = await Counter.findUnique({ where: { id: 'page-views' } })
				result = await Counter.upsert({
					where: { id: 'page-views' },
					create: { id: 'page-views', name: 'Page Views', value: 1 },
					update: { value: (current?.value ?? 0) + 1 }
				})
				expect(result.value).toBe(i)
			}
		})
	})

	describe('Validation', () => {
		it('should validate create data', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await expect(User.upsert({
				where: { id: 'invalid' },
				create: { id: 'invalid', name: 'Test' } as unknown as Omit<User, 'id'> & { id?: string }, // Missing fields
				update: { age: 30 }
			})).rejects.toThrow(ValidationError)
		})

		it('should validate update data', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ id: 'existing', name: 'Test', email: 'test@test.com', age: 30, role: 'user' })

			await expect(User.upsert({
				where: { id: 'existing' },
				create: { id: 'existing', name: 'New', email: 'new@test.com', age: 25, role: 'guest' },
				update: { age: 'invalid' } as unknown as Partial<User> // Wrong type
			})).rejects.toThrow(ValidationError)
		})
	})

	describe('Concurrent Upserts', () => {
		it('should handle concurrent upserts safely', async () => {
			const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
				id: f.id(),
				name: f.string(),
				value: f.number()
			})

			// Run multiple upserts concurrently
			const results = await Promise.all([
				Counter.upsert({
					where: { id: 'concurrent' },
					create: { id: 'concurrent', name: 'Concurrent', value: 1 },
					update: { value: 10 }
				}),
				Counter.upsert({
					where: { id: 'concurrent' },
					create: { id: 'concurrent', name: 'Concurrent', value: 2 },
					update: { value: 20 }
				}),
				Counter.upsert({
					where: { id: 'concurrent' },
					create: { id: 'concurrent', name: 'Concurrent', value: 3 },
					update: { value: 30 }
				})
			])

			// All should complete without error
			expect(results.length).toBe(3)

			// Should only have one record
			const counters = await Counter.findMany()
			expect(counters.length).toBe(1)
		})
	})

	describe('Edge Cases', () => {
		it('should handle where with both id and unique field', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number(),
				role: f.string()
			})

			// ID takes precedence
			const result = await User.upsert({
				where: { id: 'specific-id' },
				create: { id: 'specific-id', name: 'Test', email: 'test@test.com', age: 30, role: 'user' },
				update: { age: 31 }
			})

			expect(result.id).toBe('specific-id')
		})

		it('should handle empty update data', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				role: f.string()
			})

			await User.create({ id: 'no-change', name: 'Static', email: 'static@test.com', age: 30, role: 'user' })

			const result = await User.upsert({
				where: { id: 'no-change' },
				create: { id: 'no-change', name: 'New', email: 'new@test.com', age: 25, role: 'guest' },
				update: {} // Empty update
			})

			// Should return unchanged record
			expect(result.name).toBe('Static')
			expect(result.age).toBe(30)
		})
	})
})
