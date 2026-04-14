/**
 * Flashcore v1 (spec rev 4.3) Phase 2 Tests - Unique Constraints
 *
 * Tests unique field constraints, lookups, and race conditions.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	UniqueConstraintError,
	f
} from '../helpers/flashcore-compat.js'

describe('Unique Constraints', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('create with unique field', () => {
		it('should allow unique values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			const user1 = await User.create({ email: 'alice@example.com', name: 'Alice' })
			const user2 = await User.create({ email: 'bob@example.com', name: 'Bob' })

			expect(user1.email).toBe('alice@example.com')
			expect(user2.email).toBe('bob@example.com')
		})

		it('should reject duplicate unique values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			await User.create({ email: 'alice@example.com', name: 'Alice' })

			await expect(User.create({ email: 'alice@example.com', name: 'Bob' }))
				.rejects.toThrow(UniqueConstraintError)
		})

		it('should allow null/undefined for optional unique fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email?: string | null; name: string }>('User', {
				id: f.id(),
				email: f.string().optional().unique(),
				name: f.string()
			})

			const user1 = await User.create({ name: 'Alice' }) // undefined email
			const user2 = await User.create({ email: null, name: 'Bob' })
			const user3 = await User.create({ name: 'Charlie' }) // also undefined

			expect(user1.email).toBeUndefined()
			expect(user2.email).toBeNull()
			expect(user3.email).toBeUndefined()
		})

		it('should work with multiple unique fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; username: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				username: f.string().unique(),
				name: f.string()
			})

			await User.create({ email: 'alice@example.com', username: 'alice', name: 'Alice' })

			// Should reject duplicate email
			await expect(User.create({ email: 'alice@example.com', username: 'alice2', name: 'Alice 2' }))
				.rejects.toThrow(UniqueConstraintError)

			// Should reject duplicate username
			await expect(User.create({ email: 'alice2@example.com', username: 'alice', name: 'Alice 2' }))
				.rejects.toThrow(UniqueConstraintError)

			// Should allow different values
			const user2 = await User.create({ email: 'bob@example.com', username: 'bob', name: 'Bob' })
			expect(user2.username).toBe('bob')
		})
	})

	describe('findUnique by unique field', () => {
		it('should find by unique field', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			const created = await User.create({ email: 'alice@example.com', name: 'Alice' })

			const found = await User.findUnique({ where: { email: 'alice@example.com' } })

			expect(found).not.toBeNull()
			expect(found!.id).toBe(created.id)
			expect(found!.name).toBe('Alice')
		})

		it('should return null for non-existent unique value', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			await User.create({ email: 'alice@example.com', name: 'Alice' })

			const found = await User.findUnique({ where: { email: 'nobody@example.com' } })

			expect(found).toBeNull()
		})

		it('should prefer ID lookup over unique field', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			await User.create({ id: 'user-1', email: 'alice@example.com', name: 'Alice' })

			const found = await User.findUnique({ where: { id: 'user-1' } })

			expect(found).not.toBeNull()
			expect(found!.email).toBe('alice@example.com')
		})
	})

	describe('update unique field', () => {
		it('should allow updating to new unique value', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			const user = await User.create({ email: 'alice@example.com', name: 'Alice' })

			const updated = await User.update({
				where: { id: user.id },
				data: { email: 'alice.new@example.com' }
			})

			expect(updated).not.toBeNull()
			expect(updated!.email).toBe('alice.new@example.com')

			// Old email should be released
			const user2 = await User.create({ email: 'alice@example.com', name: 'Bob' })
			expect(user2.email).toBe('alice@example.com')
		})

		it('should reject updating to duplicate unique value', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			await User.create({ email: 'alice@example.com', name: 'Alice' })
			const bob = await User.create({ email: 'bob@example.com', name: 'Bob' })

			await expect(User.update({
				where: { id: bob.id },
				data: { email: 'alice@example.com' }
			})).rejects.toThrow(UniqueConstraintError)
		})

		it('should allow updating to same value (no-op)', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			const user = await User.create({ email: 'alice@example.com', name: 'Alice' })

			const updated = await User.update({
				where: { id: user.id },
				data: { email: 'alice@example.com' } // Same value
			})

			expect(updated).not.toBeNull()
			expect(updated!.email).toBe('alice@example.com')
		})
	})

	describe('update/delete by unique where', () => {
		it('should update by unique field', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			await User.create({ email: 'alice@example.com', name: 'Alice' })

			const updated = await User.update({
				where: { email: 'alice@example.com' },
				data: { name: 'Alicia' }
			})

			expect(updated).not.toBeNull()
			expect(updated?.name).toBe('Alicia')
		})

		it('should return null when updating by missing unique value', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			await User.create({ email: 'alice@example.com', name: 'Alice' })

			const updated = await User.update({
				where: { email: 'missing@example.com' },
				data: { name: 'Nope' }
			})

			expect(updated).toBeNull()
		})

		it('should delete by unique field and release constraint', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			await User.create({ email: 'alice@example.com', name: 'Alice' })

			const deleted = await User.delete({ where: { email: 'alice@example.com' } })
			expect(deleted).not.toBeNull()

			// Should be able to recreate with the same email
			const recreated = await User.create({ email: 'alice@example.com', name: 'New Alice' })
			expect(recreated.email).toBe('alice@example.com')
		})

		it('should return null when deleting by missing unique value', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			await User.create({ email: 'alice@example.com', name: 'Alice' })

			const deleted = await User.delete({ where: { email: 'missing@example.com' } })
			expect(deleted).toBeNull()
		})
	})

	describe('delete releases constraint', () => {
		it('should release unique constraint on delete', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			const alice = await User.create({ email: 'alice@example.com', name: 'Alice' })

			// Delete Alice
			await User.delete({ where: { id: alice.id } })

			// Should be able to create with same email
			const newAlice = await User.create({ email: 'alice@example.com', name: 'New Alice' })
			expect(newAlice.email).toBe('alice@example.com')
		})
	})

	describe('concurrent creates', () => {
		it('should handle concurrent creates with unique constraint', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			// Try to create 50 users with the same email concurrently
			const promises = Array.from({ length: 50 }, (_, i) =>
				User.create({ email: 'race@example.com', name: `User ${i}` })
					.then(r => ({ success: true, record: r }))
					.catch(e => ({ success: false, error: e }))
			)

			const results = await Promise.all(promises)

			const successes = results.filter(r => r.success)
			const failures = results.filter(r => !r.success)

			// Exactly one should succeed
			expect(successes).toHaveLength(1)

			// All others should fail with UniqueConstraintError
			expect(failures).toHaveLength(49)
			for (const failure of failures) {
				expect((failure as any).error).toBeInstanceOf(UniqueConstraintError)
			}
		})

		it('should handle concurrent creates with different unique values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			// Create 20 users with different emails concurrently
			const promises = Array.from({ length: 20 }, (_, i) =>
				User.create({ email: `user${i}@example.com`, name: `User ${i}` })
			)

			const results = await Promise.all(promises)

			// All should succeed
			expect(results).toHaveLength(20)

			// Verify all emails are unique
			const emails = results.map(r => r.email)
			const uniqueEmails = new Set(emails)
			expect(uniqueEmails.size).toBe(20)
		})
	})

	describe('namespaced models', () => {
		it('should isolate unique constraints by namespace', async () => {
			const schema = FlashcoreSystem.schema('tenant-a')
			const UserA = schema.model<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			const schemaB = FlashcoreSystem.schema('tenant-b')
			const UserB = schemaB.model<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			// Same email should work in different namespaces
			await UserA.create({ email: 'alice@example.com', name: 'Alice A' })
			await UserB.create({ email: 'alice@example.com', name: 'Alice B' })

			const foundA = await UserA.findUnique({ where: { email: 'alice@example.com' } })
			const foundB = await UserB.findUnique({ where: { email: 'alice@example.com' } })

			expect(foundA!.name).toBe('Alice A')
			expect(foundB!.name).toBe('Alice B')
		})
	})

	describe('special characters in unique values', () => {
		it('should handle special characters in unique values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			const specialEmails = [
				'alice+tag@example.com',
				'bob.smith@example.com',
				'charlie_underscore@example.com',
				'test@sub.domain.example.com'
			]

			for (const email of specialEmails) {
				const user = await User.create({ email, name: 'Test' })
				expect(user.email).toBe(email)

				const found = await User.findUnique({ where: { email } })
				expect(found).not.toBeNull()
				expect(found!.email).toBe(email)
			}
		})

		it('should handle unicode in unique values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; displayName: string }>('User', {
				id: f.id(),
				name: f.string().unique(),
				displayName: f.string()
			})

			const unicodeNames = [
				'日本語',
				'한국어',
				'العربية',
				'🚀🎉',
				'Ñoño'
			]

			for (const name of unicodeNames) {
				const user = await User.create({ name, displayName: 'Test' })
				expect(user.name).toBe(name)

				const found = await User.findUnique({ where: { name } })
				expect(found).not.toBeNull()
				expect(found!.name).toBe(name)
			}
		})
	})
})
