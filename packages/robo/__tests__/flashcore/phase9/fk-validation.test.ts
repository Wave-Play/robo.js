/**
 * Phase 9: Foreign Key Validation Tests
 *
 * Tests for FK validation during create/update operations.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { f, FlashcoreSystem, MemoryAdapter } from '../helpers/flashcore-compat.js'

describe('Phase 9: Foreign Key Validation', () => {
	beforeEach(async () => {
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Create with FK Validation', () => {
		it('should allow create with valid FK', async () => {
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

			// Create user first
			const user = await User.create({ name: 'John' })

			// Create post with valid FK
			const post = await Post.create({
				title: 'Test Post',
				authorId: user.id
			})

			expect(post).toBeDefined()
			expect(post.authorId).toBe(user.id)
		})

		it('should reject create with invalid FK', async () => {
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
				authorId: string
			}>('Post', {
				id: f.id(),
				title: f.string(),
				authorId: f.string().indexed(),
				author: f.relation('User', 'authorId')
			})

			// Try to create post with non-existent user ID
			await expect(
				Post.create({
					title: 'Test Post',
					authorId: 'non-existent-user-id'
				})
			).rejects.toThrow(/foreign key/i)
		})

		it('should allow null FK for optional relations', async () => {
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

			// Create post without author (null FK)
			const post = await Post.create({
				title: 'Test Post',
				authorId: null
			})

			expect(post).toBeDefined()
			expect(post.authorId).toBeNull()
		})
	})

	describe('Update with FK Validation', () => {
		it('should allow update with valid FK', async () => {
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

			// Create two users
			const user1 = await User.create({ name: 'John' })
			const user2 = await User.create({ name: 'Jane' })

			// Create post with first user
			const post = await Post.create({
				title: 'Test Post',
				authorId: user1.id
			})

			// Update to second user
			const updated = await Post.update({
				where: { id: post.id },
				data: { authorId: user2.id }
			})

			expect(updated).toBeDefined()
			expect(updated!.authorId).toBe(user2.id)
		})

		it('should reject update with invalid FK', async () => {
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
			const post = await Post.create({
				title: 'Test Post',
				authorId: user.id
			})

			// Try to update to non-existent user
			await expect(
				Post.update({
					where: { id: post.id },
					data: { authorId: 'non-existent-user-id' }
				})
			).rejects.toThrow(/foreign key/i)
		})

		it('should allow update of non-FK fields without FK validation', async () => {
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
			const post = await Post.create({
				title: 'Test Post',
				authorId: user.id
			})

			// Update only title (not FK)
			const updated = await Post.update({
				where: { id: post.id },
				data: { title: 'Updated Title' }
			})

			expect(updated).toBeDefined()
			expect(updated!.title).toBe('Updated Title')
			expect(updated!.authorId).toBe(user.id)
		})
	})
})
