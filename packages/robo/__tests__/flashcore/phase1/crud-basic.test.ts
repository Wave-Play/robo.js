/**
 * Flashcore v1 (spec rev 4.3) Phase 1 Tests - CRUD Basic
 *
 * Tests create/findUnique/update/delete happy paths.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

describe('CRUD Basic', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('create()', () => {
		it('should create with auto-generated ID', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const created = await User.create({ name: 'Alice' })

			expect(created.id).toBeDefined()
			expect(typeof created.id).toBe('string')
			expect(created.id.length).toBeGreaterThan(0)
			expect(created.name).toBe('Alice')
		})

		it('should create with custom ID', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const created = await User.create({ id: 'user-123', name: 'Bob' })

			expect(created.id).toBe('user-123')
			expect(created.name).toBe('Bob')
		})

		it('should reject duplicate ID', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ id: 'user-123', name: 'Alice' })

			await expect(User.create({ id: 'user-123', name: 'Bob' }))
				.rejects.toThrow(/already exists/)
		})

		it('should return complete record with all fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string; age: number; active: boolean }>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number(),
				active: f.boolean()
			})

			const created = await User.create({
				name: 'Alice',
				email: 'alice@example.com',
				age: 30,
				active: true
			})

			expect(created.id).toBeDefined()
			expect(created.name).toBe('Alice')
			expect(created.email).toBe('alice@example.com')
			expect(created.age).toBe(30)
			expect(created.active).toBe(true)
		})

		it('should apply default values', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; role: string }>('User', {
				id: f.id(),
				name: f.string(),
				role: f.string().default('member')
			})

			const created = await (User.create as (data: { name: string }) => Promise<{ id: string; name: string; role: string }>)({ name: 'Alice' })

			expect(created.role).toBe('member')
		})
	})

	describe('findUnique()', () => {
		it('should find by ID', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const created = await User.create({ id: 'user-123', name: 'Alice' })
			const found = await User.findUnique({ where: { id: 'user-123' } })

			expect(found).toEqual(created)
		})

		it('should return null for non-existent ID', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const found = await User.findUnique({ where: { id: 'non-existent' } })

			expect(found).toBeNull()
		})

		it('should return complete record', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			await User.create({
				id: 'user-123',
				name: 'Alice',
				email: 'alice@example.com',
				age: 30
			})

			const found = await User.findUnique({ where: { id: 'user-123' } })

			expect(found?.id).toBe('user-123')
			expect(found?.name).toBe('Alice')
			expect(found?.email).toBe('alice@example.com')
			expect(found?.age).toBe(30)
		})

		it('should support select clause', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			await User.create({
				id: 'user-123',
				name: 'Alice',
				email: 'alice@example.com',
				age: 30
			})

			const found = await User.findUnique({
				where: { id: 'user-123' },
				select: { name: true, email: true }
			})

			expect(found?.id).toBe('user-123') // ID is always included
			expect(found?.name).toBe('Alice')
			expect(found?.email).toBe('alice@example.com')
			expect((found as { age?: number })?.age).toBeUndefined()
		})
	})

	describe('update()', () => {
		it('should update existing record', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string }>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			await User.create({
				id: 'user-123',
				name: 'Alice',
				email: 'alice@example.com'
			})

			const updated = await User.update({
				where: { id: 'user-123' },
				data: { name: 'Alice Updated' }
			})

			expect(updated?.id).toBe('user-123')
			expect(updated?.name).toBe('Alice Updated')
			expect(updated?.email).toBe('alice@example.com')
		})

		it('should return null for non-existent record', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const updated = await User.update({
				where: { id: 'non-existent' },
				data: { name: 'New Name' }
			})

			expect(updated).toBeNull()
		})

		it('should reject ID mutation', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ id: 'user-123', name: 'Alice' })

			await expect(User.update({
				where: { id: 'user-123' },
				data: { id: 'new-id', name: 'Bob' } as never
			})).rejects.toThrow(/Cannot update id field/)
		})

		it('should update multiple fields', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string; age: number }>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			await User.create({
				id: 'user-123',
				name: 'Alice',
				email: 'alice@example.com',
				age: 30
			})

			const updated = await User.update({
				where: { id: 'user-123' },
				data: { name: 'Alice Smith', age: 31 }
			})

			expect(updated?.name).toBe('Alice Smith')
			expect(updated?.email).toBe('alice@example.com') // unchanged
			expect(updated?.age).toBe(31)
		})

		it('should persist update across reads', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ id: 'user-123', name: 'Alice' })

			await User.update({
				where: { id: 'user-123' },
				data: { name: 'Bob' }
			})

			// Read again to verify persistence
			const found = await User.findUnique({ where: { id: 'user-123' } })
			expect(found?.name).toBe('Bob')
		})
	})

	describe('delete()', () => {
		it('should delete existing record', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ id: 'user-123', name: 'Alice' })

			const deleted = await User.delete({ where: { id: 'user-123' } })

			expect(deleted?.id).toBe('user-123')
			expect(deleted?.name).toBe('Alice')

			// Verify it's gone
			const found = await User.findUnique({ where: { id: 'user-123' } })
			expect(found).toBeNull()
		})

		it('should return null for non-existent record', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const deleted = await User.delete({ where: { id: 'non-existent' } })

			expect(deleted).toBeNull()
		})

		it('should return complete deleted record', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string }>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			await User.create({
				id: 'user-123',
				name: 'Alice',
				email: 'alice@example.com'
			})

			const deleted = await User.delete({ where: { id: 'user-123' } })

			expect(deleted?.id).toBe('user-123')
			expect(deleted?.name).toBe('Alice')
			expect(deleted?.email).toBe('alice@example.com')
		})
	})

	describe('count()', () => {
		it('should return 0 for empty model', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			expect(await User.count()).toBe(0)
		})

		it('should return correct count after creates', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })
			await User.create({ name: 'Bob' })
			await User.create({ name: 'Charlie' })

			expect(await User.count()).toBe(3)
		})

		it('should decrement after delete', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ id: 'user-1', name: 'Alice' })
			await User.create({ id: 'user-2', name: 'Bob' })

			expect(await User.count()).toBe(2)

			await User.delete({ where: { id: 'user-1' } })

			expect(await User.count()).toBe(1)
		})
	})

	describe('CRUD workflow', () => {
		it('should support full CRUD lifecycle', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; status: string }>('User', {
				id: f.id(),
				name: f.string(),
				status: f.string().default('pending')
			})

			// Create (use cast because default allows omitting status)
			const created = await (User.create as (data: { name: string }) => Promise<{ id: string; name: string; status: string }>)({ name: 'Alice' })
			expect(created.status).toBe('pending')

			// Read
			const read = await User.findUnique({ where: { id: created.id } })
			expect(read).toEqual(created)

			// Update
			const updated = await User.update({
				where: { id: created.id },
				data: { status: 'active' }
			})
			expect(updated?.status).toBe('active')

			// Verify update persisted
			const reread = await User.findUnique({ where: { id: created.id } })
			expect(reread?.status).toBe('active')

			// Delete
			const deleted = await User.delete({ where: { id: created.id } })
			expect(deleted?.id).toBe(created.id)

			// Verify deleted
			const gone = await User.findUnique({ where: { id: created.id } })
			expect(gone).toBeNull()
		})
	})

	describe('Multiple models', () => {
		it('should support multiple independent models', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const Post = FlashcoreSystem.registerModel<{ id: string; title: string; authorId: string }>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string()
			})

			await User.create({ id: 'user-1', name: 'Alice' })
			await Post.create({ id: 'post-1', title: 'Hello', authorId: 'user-1' })

			expect(await User.count()).toBe(1)
			expect(await Post.count()).toBe(1)

			const user = await User.findUnique({ where: { id: 'user-1' } })
			const post = await Post.findUnique({ where: { id: 'post-1' } })

			expect(user?.name).toBe('Alice')
			expect(post?.title).toBe('Hello')
			expect(post?.authorId).toBe('user-1')
		})
	})

	describe('Namespaced models', () => {
		it('should support namespaced model registration', async () => {
			const schema = FlashcoreSystem.schema('app')

			const User = schema.model<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })

			expect(await User.count()).toBe(1)
			expect(User.namespace).toBe('app')
		})

		it('should isolate namespaced models', async () => {
			const app1Schema = FlashcoreSystem.schema('app1')
			const app2Schema = FlashcoreSystem.schema('app2')

			const User1 = app1Schema.model<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const User2 = app2Schema.model<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User1.create({ id: 'user-1', name: 'Alice' })
			await User2.create({ id: 'user-1', name: 'Bob' })

			const found1 = await User1.findUnique({ where: { id: 'user-1' } })
			const found2 = await User2.findUnique({ where: { id: 'user-1' } })

			expect(found1?.name).toBe('Alice')
			expect(found2?.name).toBe('Bob')
		})
	})
})
