/**
 * Phase 9: Many-to-Many Junction Table Tests
 *
 * Tests for junction table auto-creation, connect/disconnect operations,
 * junction cleanup on delete, and querying through junctions.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	f,
	FlashcoreSystem,
	MemoryAdapter,
	JUNCTION_PREFIX,
	getJunctionTableDef,
	UniqueConstraintError
} from '../helpers/flashcore-compat.js'

describe('Phase 9: Many-to-Many Junction Tables', () => {
	beforeEach(async () => {
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Junction Table Creation', () => {
		it('should verify JUNCTION_PREFIX constant', () => {
			expect(JUNCTION_PREFIX).toBe('_junction_')
		})

		it('should auto-register a junction model with compound unique', async () => {
			FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('Student', {
				id: f.id(),
				name: f.string(),
				courses: f.manyToMany('Course')
			})

			FlashcoreSystem.registerModel<{
				id: string
				title: string
			}>('Course', {
				id: f.id(),
				title: f.string(),
				students: f.manyToMany('Student')
			})

			const junctionDef = getJunctionTableDef('Student', 'Course')
			const junction = FlashcoreSystem.getModel(junctionDef.name) as {
				schema: { compoundUniques: Array<{ fields: string[] }> }
			} | undefined

			expect(junction).toBeDefined()
			expect(junctionDef.name.startsWith(JUNCTION_PREFIX)).toBe(true)
			expect(junction?.schema.compoundUniques).toHaveLength(1)
			expect(junction?.schema.compoundUniques[0].fields).toEqual([
				junctionDef.foreignKeyA,
				junctionDef.foreignKeyB
			])
		})
	})

	describe('Connect / Disconnect / Set', () => {
		it('should connect, disconnect, set, and disconnectAll', async () => {
			const Tag = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('Tag', {
				id: f.id(),
				name: f.string(),
				posts: f.manyToMany('Post')
			})

			const Post = FlashcoreSystem.registerModel<{
				id: string
				title: string
			}>('Post', {
				id: f.id(),
				title: f.string(),
				tags: f.manyToMany('Tag')
			})

			// Create records
			const tag1 = await Tag.create({ name: 'JavaScript' })
			const tag2 = await Tag.create({ name: 'TypeScript' })
			const post = await Post.create({ title: 'Learn JS' })

			// Connect both tags
			await Post.update({
				where: { id: post.id },
				data: {
					tags: {
						connect: [{ id: tag1.id }, { id: tag2.id }]
					}
				} as unknown as { title?: string }
			})

			const withBoth = await Post.findUnique(
				{ where: { id: post.id }, include: { tags: true } }
			) as unknown as { tags: Array<{ id: string }> } | null
			expect(withBoth?.tags).toHaveLength(2)
			expect((withBoth?.tags ?? []).map(t => t.id).sort()).toEqual([tag1.id, tag2.id].sort())

			// Disconnect one
			await Post.update({
				where: { id: post.id },
				data: {
					tags: {
						disconnect: [{ id: tag1.id }]
					}
				} as unknown as { title?: string }
			})

			const withOne = await Post.findUnique(
				{ where: { id: post.id }, include: { tags: true } }
			) as unknown as { tags: Array<{ id: string }> } | null
			expect(withOne?.tags).toHaveLength(1)
			expect(withOne?.tags?.[0].id).toBe(tag2.id)

			// Set exact relations
			await Post.update({
				where: { id: post.id },
				data: {
					tags: {
						set: [{ id: tag1.id }]
					}
				} as unknown as { title?: string }
			})

			const withSet = await Post.findUnique(
				{ where: { id: post.id }, include: { tags: true } }
			) as unknown as { tags: Array<{ id: string }> } | null
			expect(withSet?.tags).toHaveLength(1)
			expect(withSet?.tags?.[0].id).toBe(tag1.id)

			// Disconnect all
			await Post.update({
				where: { id: post.id },
				data: {
					tags: {
						disconnect: true
					}
				} as unknown as { title?: string }
			})

			const withNone = await Post.findUnique(
				{ where: { id: post.id }, include: { tags: true } }
			) as unknown as { tags: Array<{ id: string }> } | null
			expect(withNone?.tags).toHaveLength(0)
		})
	})

	describe('Duplicate Prevention', () => {
		it('should enforce compound unique on junction relationships', async () => {
			const Tag = FlashcoreSystem.registerModel<{ id: string; name: string }>('Tag', {
				id: f.id(),
				name: f.string(),
				posts: f.manyToMany('Post')
			})

			const Post = FlashcoreSystem.registerModel<{ id: string; title: string }>('Post', {
				id: f.id(),
				title: f.string(),
				tags: f.manyToMany('Tag')
			})

			const tag = await Tag.create({ name: 'dup' })
			const post = await Post.create({ title: 'dup post' })

			await Post.update({
				where: { id: post.id },
				data: { tags: { connect: [{ id: tag.id }] } } as unknown as { title?: string }
			})

			await expect(Post.update({
				where: { id: post.id },
				data: { tags: { connect: [{ id: tag.id }] } } as unknown as { title?: string }
			})).rejects.toThrow(UniqueConstraintError)
		})
	})

	describe('Cleanup on Delete', () => {
		it('should remove junction entries when a record is deleted', async () => {
			const Category = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('Category', {
				id: f.id(),
				name: f.string(),
				products: f.manyToMany('Product')
			})

			const Product = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('Product', {
				id: f.id(),
				name: f.string(),
				categories: f.manyToMany('Category')
			})

			// Create records
			const category = await Category.create({ name: 'Electronics' })
			const product = await Product.create({ name: 'Phone' })

			// Connect
			await Product.update({
				where: { id: product.id },
				data: { categories: { connect: [{ id: category.id }] } } as unknown as { name?: string }
			})

			const junctionDef = getJunctionTableDef('Category', 'Product')
			const junction = FlashcoreSystem.getModel(junctionDef.name) as {
				findMany: (args?: unknown) => Promise<Array<{ id: string }>>
			} | undefined

			expect(junction).toBeDefined()
			expect(await junction!.findMany()).toHaveLength(1)

			// Delete product
			await Product.delete({ where: { id: product.id } })

			// Category should still exist
			const remainingCategory = await Category.findUnique({ where: { id: category.id } })
			expect(remainingCategory).toBeDefined()

			// Product should be deleted
			const deletedProduct = await Product.findUnique({ where: { id: product.id } })
			expect(deletedProduct).toBeNull()

			// Junction entries should be cleaned up
			expect(await junction!.findMany()).toHaveLength(0)
		})

		it('should not delete related records on manyToMany delete', async () => {
			const Artist = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('Artist', {
				id: f.id(),
				name: f.string(),
				songs: f.manyToMany('Song')
			})

			const Song = FlashcoreSystem.registerModel<{
				id: string
				title: string
			}>('Song', {
				id: f.id(),
				title: f.string(),
				artists: f.manyToMany('Artist')
			})

			// Create records
			const artist = await Artist.create({ name: 'Band' })
			const song1 = await Song.create({ title: 'Song 1' })
			const song2 = await Song.create({ title: 'Song 2' })

			// Connect songs to artist
			await Artist.update({
				where: { id: artist.id },
				data: { songs: { connect: [{ id: song1.id }, { id: song2.id }] } } as unknown as { name?: string }
			})

			// Delete artist
			await Artist.delete({ where: { id: artist.id } })

			// Songs should still exist (manyToMany doesn't cascade)
			const songs = await Song.findMany()
			expect(songs).toHaveLength(2)
		})
	})

	describe('Non-ACID Adapter Fallback', () => {
		it('should clean junction entries even when deleteMany is not supported', async () => {
			// Override the default MemoryAdapter from beforeEach.
			await FlashcoreSystem._reset()

			const store = new Map<string, unknown>()
			await FlashcoreSystem.init({
				adapter: {
					get: async (key: string) => store.get(key),
					set: async (key: string, value: unknown) => { store.set(key, value); return true },
					delete: async (key: string) => store.delete(key),
					has: async (key: string) => store.has(key),
					clear: async () => { store.clear() }
				}
			})

			const A = FlashcoreSystem.registerModel<{ id: string; name: string }>('A', {
				id: f.id(),
				name: f.string(),
				bs: f.manyToMany('B')
			})

			const B = FlashcoreSystem.registerModel<{ id: string; label: string }>('B', {
				id: f.id(),
				label: f.string(),
				as: f.manyToMany('A')
			})

			const a = await A.create({ name: 'a' })
			const b = await B.create({ label: 'b' })

			await A.update({
				where: { id: a.id },
				data: { bs: { connect: [{ id: b.id }] } } as unknown as { name?: string }
			})

			const junctionDef = getJunctionTableDef('A', 'B')
			const junction = FlashcoreSystem.getModel(junctionDef.name) as { findMany: (args?: unknown) => Promise<Array<{ id: string }>> } | undefined

			expect(junction).toBeDefined()
			expect(await junction!.findMany()).toHaveLength(1)

			// Should not throw (falls back from deleteMany to per-record delete)
			await A.delete({ where: { id: a.id } })
			expect(await junction!.findMany()).toHaveLength(0)
		})
	})

	describe('Query Through Junction', () => {
		it('should support querying through include on both sides', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				username: string
			}>('User', {
				id: f.id(),
				username: f.string(),
				groups: f.manyToMany('Group')
			})

			const Group = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('Group', {
				id: f.id(),
				name: f.string(),
				members: f.manyToMany('User')
			})

			// Create users and groups
			const alice = await User.create({ username: 'alice' })
			await User.create({ username: 'bob' })
			const admins = await Group.create({ name: 'Admins' })
			await Group.create({ name: 'Users' })

			// Connect alice -> admins
			await User.update({
				where: { id: alice.id },
				data: { groups: { connect: [{ id: admins.id }] } } as unknown as { username?: string }
			})

			const userWithGroups = await User.findUnique(
				{ where: { id: alice.id }, include: { groups: true } }
			) as unknown as { groups: Array<{ id: string }> } | null
			expect(userWithGroups?.groups).toHaveLength(1)
			expect(userWithGroups?.groups?.[0].id).toBe(admins.id)

			const groupWithMembers = await Group.findUnique(
				{ where: { id: admins.id }, include: { members: true } }
			) as unknown as { members: Array<{ id: string }> } | null
			expect(groupWithMembers?.members).toHaveLength(1)
			expect(groupWithMembers?.members?.[0].id).toBe(alice.id)
		})
	})

	describe('Multiple ManyToMany Relations', () => {
		it('should support multiple manyToMany relations to different models', async () => {
			const Person = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('Person', {
				id: f.id(),
				name: f.string(),
				teams: f.manyToMany('Team'),
				likedPosts: f.manyToMany('BlogPost')
			})

			const Team = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('Team', {
				id: f.id(),
				name: f.string(),
				members: f.manyToMany('Person')
			})

			const BlogPost = FlashcoreSystem.registerModel<{
				id: string
				content: string
			}>('BlogPost', {
				id: f.id(),
				content: f.string(),
				likedBy: f.manyToMany('Person')
			})

			// Create records
			const person1 = await Person.create({ name: 'Alice' })
			const person2 = await Person.create({ name: 'Bob' })
			const post = await BlogPost.create({ content: 'Hello World' })
			const team = await Team.create({ name: 'Builders' })

			expect(person1).toBeDefined()
			expect(person2).toBeDefined()
			expect(post).toBeDefined()
			expect(team).toBeDefined()

			// Query should work
			const people = await Person.findMany()
			const posts = await BlogPost.findMany()

			expect(people).toHaveLength(2)
			expect(posts).toHaveLength(1)
		})
	})
})
