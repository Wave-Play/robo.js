/**
 * Flashcore v1 (spec rev 4.3) Phase 1 Tests - Schema Validation
 *
 * Tests field types, required/optional/default, unknown rejection, Date round-trip.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

describe('Schema Validation', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Field Types', () => {
		it('should validate string fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const created = await User.create({ name: 'Alice' })
			expect(created.name).toBe('Alice')
		})

		it('should validate number fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; age: number }>('User', {
				id: f.id(),
				age: f.number()
			})

			const created = await User.create({ age: 25 })
			expect(created.age).toBe(25)
		})

		it('should validate boolean fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; active: boolean }>('User', {
				id: f.id(),
				active: f.boolean()
			})

			const created = await User.create({ active: true })
			expect(created.active).toBe(true)
		})

		it('should validate date fields with round-trip', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; createdAt: Date }>('User', {
				id: f.id(),
				createdAt: f.date()
			})

			const now = new Date()
			const created = await User.create({ createdAt: now })

			expect(created.createdAt).toBeInstanceOf(Date)
			expect(created.createdAt.toISOString()).toBe(now.toISOString())

			// Verify round-trip after read
			const found = await User.findUnique({ where: { id: created.id } })
			expect(found?.createdAt).toBeInstanceOf(Date)
			expect(found?.createdAt.toISOString()).toBe(now.toISOString())
		})

		it('should validate enum fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; status: 'active' | 'inactive' | 'pending' }>('User', {
				id: f.id(),
				status: f.enum(['active', 'inactive', 'pending'])
			})

			const created = await User.create({ status: 'active' })
			expect(created.status).toBe('active')
		})

		it('should reject invalid enum values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; status: 'active' | 'inactive' }>('User', {
				id: f.id(),
				status: f.enum(['active', 'inactive'])
			})

			await expect(User.create({ status: 'unknown' as 'active' }))
				.rejects.toThrow()
		})

		it('should validate json fields', async () => {
			interface Settings {
				theme: string
				notifications: boolean
			}

			const User = FlashcoreSystem.registerModel<{ id: string; settings: Settings }>('User', {
				id: f.id(),
				settings: f.json<Settings>()
			})

			const settings = { theme: 'dark', notifications: true }
			const created = await User.create({ settings })

			expect(created.settings).toEqual(settings)
		})
	})

	describe('Required vs Optional Fields', () => {
		it('should enforce required fields on create', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string }>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			await expect(User.create({ name: 'Alice' } as never))
				.rejects.toThrow()
		})

		it('should allow optional fields to be omitted', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; bio?: string }>('User', {
				id: f.id(),
				name: f.string(),
				bio: f.string().optional()
			})

			const created = await User.create({ name: 'Alice' })
			expect(created.name).toBe('Alice')
			expect(created.bio).toBeUndefined()
		})

		it('should allow optional fields to be null', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; nickname?: string | null }>('User', {
				id: f.id(),
				name: f.string(),
				nickname: f.string().optional()
			})

			const created = await User.create({ name: 'Alice', nickname: null as unknown as string })
			expect(created.name).toBe('Alice')
			// Null values are preserved in optional fields
			expect(created.nickname).toBe(null)
		})
	})

	describe('Default Values', () => {
		it('should apply static default values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; role: string }>('User', {
				id: f.id(),
				name: f.string(),
				role: f.string().default('user')
			})

			const created = await (User.create as (data: { name: string }) => Promise<{ id: string; name: string; role: string }>)({ name: 'Alice' })
			expect(created.role).toBe('user')
		})

		it('should apply factory default values', async () => {
			let counter = 0
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; seq: number }>('User', {
				id: f.id(),
				name: f.string(),
				seq: f.number().default(() => ++counter)
			})

			const user1 = await (User.create as (data: { name: string }) => Promise<{ id: string; name: string; seq: number }>)({ name: 'Alice' })
			const user2 = await (User.create as (data: { name: string }) => Promise<{ id: string; name: string; seq: number }>)({ name: 'Bob' })

			expect(user1.seq).toBe(1)
			expect(user2.seq).toBe(2)
		})

		it('should invoke factory for each create', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; createdAt: Date }>('User', {
				id: f.id(),
				name: f.string(),
				createdAt: f.date().default(() => new Date())
			})

			const user1 = await (User.create as (data: { name: string }) => Promise<{ id: string; name: string; createdAt: Date }>)({ name: 'Alice' })
			await new Promise(resolve => setTimeout(resolve, 10))
			const user2 = await (User.create as (data: { name: string }) => Promise<{ id: string; name: string; createdAt: Date }>)({ name: 'Bob' })

			expect(user1.createdAt.getTime()).toBeLessThan(user2.createdAt.getTime())
		})

		it('should not apply default if value is provided', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; role: string }>('User', {
				id: f.id(),
				name: f.string(),
				role: f.string().default('user')
			})

			const created = await User.create({ name: 'Alice', role: 'admin' })
			expect(created.role).toBe('admin')
		})
	})

	describe('Unknown Field Rejection', () => {
		it('should reject unknown fields on create', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await expect(User.create({ name: 'Alice', unknown: 'field' } as never))
				.rejects.toThrow()
		})

		it('should reject unknown fields on update', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const created = await User.create({ name: 'Alice' })

			await expect(User.update({
				where: { id: created.id },
				data: { name: 'Bob', unknown: 'field' } as never
			})).rejects.toThrow()
		})
	})

	describe('Type Validation', () => {
		it('should reject wrong type for string field', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await expect(User.create({ name: 123 as never }))
				.rejects.toThrow()
		})

		it('should reject wrong type for number field', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; age: number }>('User', {
				id: f.id(),
				age: f.number()
			})

			await expect(User.create({ age: 'twenty' as never }))
				.rejects.toThrow()
		})

		it('should reject wrong type for boolean field', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; active: boolean }>('User', {
				id: f.id(),
				active: f.boolean()
			})

			await expect(User.create({ active: 'yes' as never }))
				.rejects.toThrow()
		})

		it('should reject wrong type for date field', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; createdAt: Date }>('User', {
				id: f.id(),
				createdAt: f.date()
			})

			await expect(User.create({ createdAt: 'invalid-date' as never }))
				.rejects.toThrow()
		})
	})

	describe('ID Validation', () => {
		it('should auto-generate ID if not provided', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const created = await User.create({ name: 'Alice' })
			expect(created.id).toBeDefined()
			expect(typeof created.id).toBe('string')
			expect(created.id.length).toBeGreaterThan(0)
		})

		it('should use provided ID', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const created = await User.create({ id: 'custom-id', name: 'Alice' })
			expect(created.id).toBe('custom-id')
		})

		it('should reject empty ID', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await expect(User.create({ id: '', name: 'Alice' }))
				.rejects.toThrow()
		})

		it('should reject ID with invalid characters', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// IDs should only contain letters, numbers, underscores, hyphens
			await expect(User.create({ id: 'id with spaces', name: 'Alice' }))
				.rejects.toThrow()
		})

		it('should reject ID exceeding max length', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const longId = 'a'.repeat(201) // Max is 200
			await expect(User.create({ id: longId, name: 'Alice' }))
				.rejects.toThrow()
		})
	})

	describe('Schema Checksum', () => {
		it('should compute deterministic checksum', async () => {
			const User1 = FlashcoreSystem.registerModel('User1', {
				id: f.id(),
				name: f.string()
			})

			const User2 = FlashcoreSystem.registerModel('User2', {
				id: f.id(),
				name: f.string()
			})

			// Same schema should produce same checksum
			expect(User1.getSchemaChecksum()).toBe(User2.getSchemaChecksum())
		})

		it('should produce different checksum for different schemas', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const Post = FlashcoreSystem.registerModel<{ id: string; title: string; authorId: string }>('Post', {
				id: f.id(),
				title: f.string(),
				content: f.string()
			})

			expect(User.getSchemaChecksum()).not.toBe(Post.getSchemaChecksum())
		})
	})

	describe('Field Modifiers', () => {
		it('should track unique fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string()
			})

			const uniqueFields = User.getUniqueFields()
			expect(uniqueFields).toContain('email')
			expect(uniqueFields).not.toContain('name')
		})

		it('should track indexed fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; email: string; name: string }>('User', {
				id: f.id(),
				email: f.string().indexed(),
				name: f.string()
			})

			const indexedFields = User.getIndexedFields()
			expect(indexedFields).toContain('email')
			expect(indexedFields).not.toContain('name')
		})
	})
})
