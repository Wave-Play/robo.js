/**
 * Phase 9: Include and Batched Include Tests
 *
 * Tests for relation loading via include clause with N+1 prevention.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { f, FlashcoreSystem, MemoryAdapter } from '../helpers/flashcore-compat.js'

describe('Phase 9: Include and Batched Include', () => {
	beforeEach(async () => {
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Include belongsTo', () => {
		it('should include parent record', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string()
			})

			const Post = FlashcoreSystem.registerModel<{
				id: string
				title: string
				authorId: string
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed(),
				author: f.relation('User', 'authorId')
			})

			const user = await User.create({ name: 'John' })
			const post = await Post.create({ title: 'Test Post', authorId: user.id })

			// Find with include
			const result = await Post.findUnique({
				where: { id: post.id },
				include: { author: true }
			})

			expect(result).toBeDefined()
			expect((result as Record<string, unknown>).author).toBeDefined()
			expect(((result as Record<string, unknown>).author as { name: string }).name).toBe('John')
		})

		it('should return null for missing parent', async () => {
			FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string()
			})

			const Post = FlashcoreSystem.registerModel<{
				id: string
				title: string
				authorId: string | null
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed().optional(),
				author: f.relation('User', 'authorId')
			})

			const post = await Post.create({ title: 'Test Post', authorId: null })

			const result = await Post.findUnique({
				where: { id: post.id },
				include: { author: true }
			})

			expect(result).toBeDefined()
			expect((result as Record<string, unknown>).author).toBeNull()
		})
	})

	describe('Include hasMany', () => {
		it('should include child records', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' })
			})

			const Post = FlashcoreSystem.registerModel<{
				id: string
				title: string
				authorId: string
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed()
			})

			const user = await User.create({ name: 'John' })
			await Post.create({ title: 'Post 1', authorId: user.id })
			await Post.create({ title: 'Post 2', authorId: user.id })
			await Post.create({ title: 'Post 3', authorId: user.id })

			const result = await User.findUnique({
				where: { id: user.id },
				include: { posts: true }
			})

			expect(result).toBeDefined()
			expect((result as Record<string, unknown>).posts).toBeDefined()
			expect(Array.isArray((result as Record<string, unknown>).posts)).toBe(true)
			expect(((result as Record<string, unknown>).posts as unknown[]).length).toBe(3)
		})

		it('should return empty array for no children', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' })
			})

			FlashcoreSystem.registerModel<{
				id: string
				title: string
				authorId: string
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed()
			})

			const user = await User.create({ name: 'John' })

			const result = await User.findUnique({
				where: { id: user.id },
				include: { posts: true }
			})

			expect(result).toBeDefined()
			expect((result as Record<string, unknown>).posts).toEqual([])
		})
	})

	describe('Include hasOne', () => {
		it('should include single related record', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				profile: f.hasOne('Profile', { foreignKey: 'userId' })
			})

			const Profile = FlashcoreSystem.registerModel<{
				id: string
				bio: string
				userId: string
			}>('Profile', {
				id: f.id(),
				bio: f.string(),
				userId: f.string().indexed()
			})

			const user = await User.create({ name: 'John' })
			await Profile.create({ bio: 'Hello World', userId: user.id })

			const result = await User.findUnique({
				where: { id: user.id },
				include: { profile: true }
			})

			expect(result).toBeDefined()
			expect((result as Record<string, unknown>).profile).toBeDefined()
			expect(((result as Record<string, unknown>).profile as { bio: string }).bio).toBe('Hello World')
		})
	})

	describe('Batched Includes (N+1 Prevention)', () => {
		it('should batch include for findMany', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string()
			})

			const Post = FlashcoreSystem.registerModel<{
				id: string
				title: string
				authorId: string
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed(),
				author: f.relation('User', 'authorId')
			})

			// Create users
			const user1 = await User.create({ name: 'John' })
			const user2 = await User.create({ name: 'Jane' })

			// Create posts
			await Post.create({ title: 'Post 1', authorId: user1.id })
			await Post.create({ title: 'Post 2', authorId: user1.id })
			await Post.create({ title: 'Post 3', authorId: user2.id })

			// FindMany with include should batch the author lookups
			const results = await Post.findMany({
				include: { author: true }
			})

			expect(results.length).toBe(3)
			expect((results[0] as Record<string, unknown>).author).toBeDefined()
			expect((results[1] as Record<string, unknown>).author).toBeDefined()
			expect((results[2] as Record<string, unknown>).author).toBeDefined()
		})

		it('should batch include for hasMany in findMany', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' })
			})

			const Post = FlashcoreSystem.registerModel<{
				id: string
				title: string
				authorId: string
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed()
			})

			// Create users
			const user1 = await User.create({ name: 'John' })
			const user2 = await User.create({ name: 'Jane' })

			// Create posts for each user
			await Post.create({ title: 'Post 1', authorId: user1.id })
			await Post.create({ title: 'Post 2', authorId: user1.id })
			await Post.create({ title: 'Post 3', authorId: user2.id })

			// FindMany with include should batch the posts lookups
			const results = await User.findMany({
				include: { posts: true }
			})

			expect(results.length).toBe(2)

			const johnPosts = (results.find(u => u.name === 'John') as Record<string, unknown>).posts as unknown[]
			const janePosts = (results.find(u => u.name === 'Jane') as Record<string, unknown>).posts as unknown[]

			expect(johnPosts.length).toBe(2)
			expect(janePosts.length).toBe(1)
		})
	})

	describe('Nested Includes', () => {
		it('should support nested includes', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' })
			})

			const Post = FlashcoreSystem.registerModel<{
				id: string
				title: string
				authorId: string
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed(),
				comments: f.hasMany('Comment', { foreignKey: 'postId' })
			})

			const Comment = FlashcoreSystem.registerModel<{
				id: string
				text: string
				postId: string
			}>('Comment', {
				id: f.id(),
				text: f.string(),
				postId: f.string().indexed()
			})

			const user = await User.create({ name: 'John' })
			const post = await Post.create({ title: 'Test Post', authorId: user.id })
			await Comment.create({ text: 'Comment 1', postId: post.id })
			await Comment.create({ text: 'Comment 2', postId: post.id })

			// Nested include: User -> posts -> comments
			const result = await User.findUnique({
				where: { id: user.id },
				include: {
					posts: {
						include: { comments: true }
					}
				}
			})

			expect(result).toBeDefined()
			const posts = (result as Record<string, unknown>).posts as Record<string, unknown>[]
			expect(posts.length).toBe(1)

			const comments = posts[0].comments as unknown[]
			expect(comments.length).toBe(2)
		})
	})
})
