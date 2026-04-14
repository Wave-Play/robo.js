/**
 * Flashcore v1 (spec rev 4.3) Phase 2 Tests - Select Projection
 *
 * Tests select clause for returning only requested fields.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

describe('Select Projection', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('findMany with select', () => {
		it('should return only selected fields', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				email: string
				name: string
				age: number
				bio: string
			}>('User', {
				id: f.id(),
				email: f.string(),
				name: f.string(),
				age: f.number(),
				bio: f.string()
			})

			await User.create({ email: 'alice@example.com', name: 'Alice', age: 30, bio: 'Hello world' })
			await User.create({ email: 'bob@example.com', name: 'Bob', age: 25, bio: 'Hi there' })

			const users = await User.findMany({
				select: { name: true, age: true }
			})

			expect(users).toHaveLength(2)

			for (const user of users) {
				// id is always included
				expect(user.id).toBeDefined()
				expect(user.name).toBeDefined()
				expect(user.age).toBeDefined()

				// These should be excluded
				expect(user.email).toBeUndefined()
				expect(user.bio).toBeUndefined()
			}
		})

		it('should always include id even if not selected', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string }>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@example.com' })

			const users = await User.findMany({
				select: { name: true } // id not explicitly selected
			})

			expect(users).toHaveLength(1)
			expect(users[0].id).toBeDefined() // id is always included
			expect(users[0].name).toBe('Alice')
			expect(users[0].email).toBeUndefined()
		})

		it('should return all fields when select is empty object', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string }>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@example.com' })

			const users = await User.findMany({
				select: {}
			})

			expect(users).toHaveLength(1)
			// Empty select returns all fields
			expect(users[0].id).toBeDefined()
			expect(users[0].name).toBe('Alice')
			expect(users[0].email).toBe('alice@example.com')
		})

		it('should work with where and select combined', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
				email: string
				age: number
			}>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Alice', email: 'alice@example.com', age: 30 })
			await User.create({ name: 'Bob', email: 'bob@example.com', age: 25 })
			await User.create({ name: 'Charlie', email: 'charlie@example.com', age: 35 })

			const users = await User.findMany({
				where: { age: { gte: 30 } },
				select: { name: true }
			})

			expect(users).toHaveLength(2)
			for (const user of users) {
				expect(user.id).toBeDefined()
				expect(user.name).toBeDefined()
				expect(user.email).toBeUndefined()
				expect(user.age).toBeUndefined()
			}
		})

		it('should work with orderBy and select combined', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
				email: string
				age: number
			}>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Alice', email: 'alice@example.com', age: 30 })
			await User.create({ name: 'Bob', email: 'bob@example.com', age: 25 })
			await User.create({ name: 'Charlie', email: 'charlie@example.com', age: 35 })

			const users = await User.findMany({
				orderBy: { age: 'asc' },
				select: { name: true, age: true }
			})

			expect(users).toHaveLength(3)
			expect(users[0].name).toBe('Bob')
			expect(users[0].age).toBe(25)
			expect(users[1].name).toBe('Alice')
			expect(users[1].age).toBe(30)
			expect(users[2].name).toBe('Charlie')
			expect(users[2].age).toBe(35)

			// Email should be excluded
			for (const user of users) {
				expect(user.email).toBeUndefined()
			}
		})

		it('should work with pagination and select combined', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
				email: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			for (let i = 0; i < 5; i++) {
				await User.create({ name: `User ${i}`, email: `user${i}@example.com` })
			}

			const users = await User.findMany({
				orderBy: { name: 'asc' },
				skip: 1,
				take: 2,
				select: { name: true }
			})

			expect(users).toHaveLength(2)
			expect(users[0].name).toBe('User 1')
			expect(users[1].name).toBe('User 2')

			for (const user of users) {
				expect(user.email).toBeUndefined()
			}
		})
	})

	describe('findFirst with select', () => {
		it('should return only selected fields', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
				email: string
				bio: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				bio: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@example.com', bio: 'Hello' })

			const user = await User.findFirst({
				select: { name: true }
			})

			expect(user).not.toBeNull()
			expect(user!.id).toBeDefined()
			expect(user!.name).toBe('Alice')
			expect(user!.email).toBeUndefined()
			expect(user!.bio).toBeUndefined()
		})

		it('should return null when no match', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })

			const user = await User.findFirst({
				where: { name: 'NonExistent' },
				select: { name: true }
			})

			expect(user).toBeNull()
		})
	})

	describe('findUnique with select', () => {
		it('should return only selected fields when finding by id', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
				email: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			const created = await User.create({ name: 'Alice', email: 'alice@example.com' })

			const user = await User.findUnique({
				where: { id: created.id },
				select: { name: true }
			})

			expect(user).not.toBeNull()
			expect(user!.id).toBe(created.id)
			expect(user!.name).toBe('Alice')
			expect(user!.email).toBeUndefined()
		})

		it('should return only selected fields when finding by unique field', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				email: string
				name: string
				bio: string
			}>('User', {
				id: f.id(),
				email: f.string().unique(),
				name: f.string(),
				bio: f.string()
			})

			await User.create({ email: 'alice@example.com', name: 'Alice', bio: 'Hello' })

			const user = await User.findUnique({
				where: { email: 'alice@example.com' },
				select: { name: true, email: true }
			})

			expect(user).not.toBeNull()
			expect(user!.id).toBeDefined()
			expect(user!.name).toBe('Alice')
			expect(user!.email).toBe('alice@example.com')
			expect(user!.bio).toBeUndefined()
		})
	})

	describe('select with different field types', () => {
		it('should handle Date fields in projection', async () => {
			const Event = FlashcoreSystem.registerModel<{
				id: string
				title: string
				date: Date
				description: string
			}>('Event', {
				id: f.id(),
				title: f.string(),
				date: f.date(),
				description: f.string()
			})

			const eventDate = new Date('2024-01-15T10:00:00Z')
			await Event.create({ title: 'Meeting', date: eventDate, description: 'Important meeting' })

			const events = await Event.findMany({
				select: { title: true, date: true }
			})

			expect(events).toHaveLength(1)
			expect(events[0].title).toBe('Meeting')
			expect(events[0].date).toEqual(eventDate)
			expect(events[0].description).toBeUndefined()
		})

		it('should handle optional fields in projection', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
				nickname?: string | null
			}>('User', {
				id: f.id(),
				name: f.string(),
				nickname: f.string().optional()
			})

			await User.create({ name: 'Alice' }) // No nickname
			await User.create({ name: 'Bob', nickname: 'Bobby' })

			const users = await User.findMany({
				orderBy: { name: 'asc' },
				select: { nickname: true }
			})

			expect(users).toHaveLength(2)
			expect(users[0].nickname).toBeUndefined() // Alice has no nickname
			expect(users[1].nickname).toBe('Bobby')
		})

		it('should handle nested/json fields in projection', async () => {
			const Config = FlashcoreSystem.registerModel<{
				id: string
				name: string
				settings: Record<string, unknown>
				metadata: string
			}>('Config', {
				id: f.id(),
				name: f.string(),
				settings: f.json(),
				metadata: f.string()
			})

			await Config.create({
				name: 'App Config',
				settings: { theme: 'dark', notifications: true },
				metadata: 'some metadata'
			})

			const configs = await Config.findMany({
				select: { name: true, settings: true }
			})

			expect(configs).toHaveLength(1)
			expect(configs[0].name).toBe('App Config')
			expect(configs[0].settings).toEqual({ theme: 'dark', notifications: true })
			expect(configs[0].metadata).toBeUndefined()
		})
	})

	describe('select with false values', () => {
		it('should exclude fields marked as false', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
				email: string
				age: number
			}>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			await User.create({ name: 'Alice', email: 'alice@example.com', age: 30 })

			// Select with explicit false values
			const users = await User.findMany({
				select: { name: true, email: false, age: true }
			})

			expect(users).toHaveLength(1)
			expect(users[0].id).toBeDefined()
			expect(users[0].name).toBe('Alice')
			expect(users[0].age).toBe(30)
			// email explicitly set to false
			expect(users[0].email).toBeUndefined()
		})
	})

	describe('select with unknown fields', () => {
		it('should ignore unknown fields in select (not include them)', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
				email: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@example.com' })

			// Select with unknown field - should be ignored
			const users = await User.findMany({
				select: { name: true, unknownField: true } as any
			})

			expect(users).toHaveLength(1)
			expect(users[0].id).toBeDefined()
			expect(users[0].name).toBe('Alice')
			// Unknown field is not in schema, so not included
			expect((users[0] as any).unknownField).toBeUndefined()
			// email was not selected
			expect(users[0].email).toBeUndefined()
		})

		it('should only include fields that exist in record', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
				email: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string()
			})

			await User.create({ name: 'Alice', email: 'alice@example.com' })

			// Select with mix of real and unknown fields
			const users = await User.findMany({
				select: { name: true, email: true, nonExistent: true } as any
			})

			expect(users).toHaveLength(1)
			// Real fields are included
			expect(users[0].name).toBe('Alice')
			expect(users[0].email).toBe('alice@example.com')
			// Unknown field not included
			expect((users[0] as any).nonExistent).toBeUndefined()
		})
	})
})
