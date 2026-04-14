/**
 * Phase 9: Cascade Policies Tests
 *
 * Tests for onDelete policies: cascade, setNull, restrict.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { f, FlashcoreSystem, MemoryAdapter } from '../helpers/flashcore-compat.js'

describe('Phase 9: Cascade Policies', () => {
	beforeEach(async () => {
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('onDelete: cascade', () => {
		it('should delete child records when parent is deleted', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' }).onDelete('cascade')
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

			// Create user and posts
			const user = await User.create({ name: 'John' })
			await Post.create({ title: 'Post 1', authorId: user.id })
			await Post.create({ title: 'Post 2', authorId: user.id })

			// Delete user - should cascade delete posts
			await User.delete({ where: { id: user.id } })

			// Posts should be deleted
			const remainingPosts = await Post.findMany()
			expect(remainingPosts.length).toBe(0)

			// User should be deleted
			const deletedUser = await User.findUnique({ where: { id: user.id } })
			expect(deletedUser).toBeNull()
		})

		it('should cascade through multiple levels', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' }).onDelete('cascade')
			})

			const Post = FlashcoreSystem.registerModel<{
				id: string
				title: string
				authorId: string
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed(),
				comments: f.hasMany('Comment', { foreignKey: 'postId' }).onDelete('cascade')
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

			// Create user -> post -> comments
			const user = await User.create({ name: 'John' })
			const post = await Post.create({ title: 'Post 1', authorId: user.id })
			await Comment.create({ text: 'Comment 1', postId: post.id })
			await Comment.create({ text: 'Comment 2', postId: post.id })

			// Delete user - should cascade to posts and comments
			await User.delete({ where: { id: user.id } })

			// All should be deleted
			expect(await User.findMany()).toHaveLength(0)
			expect(await Post.findMany()).toHaveLength(0)
			expect(await Comment.findMany()).toHaveLength(0)
		})
	})

	describe('onDelete: setNull', () => {
		it('should set FK to null when parent is deleted', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' }).onDelete('setNull')
			})

			const Post = FlashcoreSystem.registerModel<{
				id: string
				title: string
				authorId: string | null
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed().optional()
			})

			// Create user and posts
			const user = await User.create({ name: 'John' })
			await Post.create({ title: 'Post 1', authorId: user.id })
			await Post.create({ title: 'Post 2', authorId: user.id })

			// Delete user - should set authorId to null
			await User.delete({ where: { id: user.id } })

			// Posts should still exist with null authorId
			const posts = await Post.findMany()
			expect(posts.length).toBe(2)
			expect(posts[0].authorId).toBeNull()
			expect(posts[1].authorId).toBeNull()
		})
	})

	describe('onDelete: restrict', () => {
		it('should block delete when children exist', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' }).onDelete('restrict')
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

			// Create user and post
			const user = await User.create({ name: 'John' })
			await Post.create({ title: 'Post 1', authorId: user.id })

			// Try to delete user - should fail
			await expect(
				User.delete({ where: { id: user.id } })
			).rejects.toThrow(/Cannot delete.*related.*exist/i)

			// User should still exist
			const existingUser = await User.findUnique({ where: { id: user.id } })
			expect(existingUser).toBeDefined()
		})

		it('should allow delete when no children exist', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' }).onDelete('restrict')
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

			// Create user without posts
			const user = await User.create({ name: 'John' })

			// Delete should succeed
			const deleted = await User.delete({ where: { id: user.id } })
			expect(deleted).toBeDefined()

			// User should be deleted
			const deletedUser = await User.findUnique({ where: { id: user.id } })
			expect(deletedUser).toBeNull()
		})
	})

	describe('Default onDelete', () => {
		it('should default to restrict', async () => {
			const User = FlashcoreSystem.registerModel<{
				id: string
				name: string
			}>('User', {
				id: f.id(),
				name: f.string(),
				posts: f.hasMany('Post', { foreignKey: 'authorId' }) // No onDelete specified
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

			// Create user and post
			const user = await User.create({ name: 'John' })
			await Post.create({ title: 'Post 1', authorId: user.id })

			// Try to delete user - should fail (default restrict)
			await expect(
				User.delete({ where: { id: user.id } })
			).rejects.toThrow(/Cannot delete.*related.*exist/i)
		})
	})
})
