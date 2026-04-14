/**
 * Flashcore v1 (spec rev 4.3) Phase 1 Tests - Catalog Lock
 *
 * Tests catalog serialization, no lost mappings under concurrent creates.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'
import { CatalogLockManager } from '../../../src/flashcore/model/locks.js'
import { Catalog } from '../../../src/flashcore/model/catalog.js'

describe('Catalog Lock', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('CatalogLockManager', () => {
		it('should manage locks per model', async () => {
			const manager = new CatalogLockManager()
			const results: string[] = []

			const tasks = [
				manager.withCatalogLock('model1', async () => {
					await new Promise(resolve => setTimeout(resolve, 10))
					results.push('model1')
				}),
				manager.withCatalogLock('model2', async () => {
					results.push('model2')
				})
			]

			await Promise.all(tasks)

			// Both should complete (different models don't block)
			expect(results).toContain('model1')
			expect(results).toContain('model2')
		})

		it('should serialize access to same model catalog', async () => {
			const manager = new CatalogLockManager()
			const order: number[] = []

			const tasks = Array.from({ length: 10 }, (_, i) =>
				manager.withCatalogLock('model', async () => {
					await new Promise(resolve => setTimeout(resolve, 5))
					order.push(i)
				})
			)

			await Promise.all(tasks)

			// Should execute in order
			expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
		})

		it('should release lock on error', async () => {
			const manager = new CatalogLockManager()

			try {
				await manager.withCatalogLock('model', async () => {
					throw new Error('Test error')
				})
			} catch {
				// Expected
			}

			// Should be able to acquire again
			let executed = false
			await manager.withCatalogLock('model', async () => {
				executed = true
			})

			expect(executed).toBe(true)
		})

		it('should handle multiple models concurrently', async () => {
			const manager = new CatalogLockManager()
			let maxConcurrent = 0
			let current = 0

			const tasks = Array.from({ length: 30 }, (_, i) =>
				manager.withCatalogLock(`model${i % 5}`, async () => {
					current++
					maxConcurrent = Math.max(maxConcurrent, current)
					await new Promise(resolve => setTimeout(resolve, 10))
					current--
				})
			)

			await Promise.all(tasks)

			// Should have parallelism across different models (up to 5)
			expect(maxConcurrent).toBeGreaterThan(1)
			expect(maxConcurrent).toBeLessThanOrEqual(5)
		})
	})

	describe('Catalog Serialization Under Load', () => {
		it('should not lose mappings under concurrent creates', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// 100 concurrent creates
			const creates = Array.from({ length: 100 }, (_, i) =>
				User.create({ name: `User ${i}` })
			)

			const results = await Promise.all(creates)

			// All creates should succeed
			expect(results).toHaveLength(100)

			// All records should be in catalog
			for (const record of results) {
				const found = await User.findUnique({ where: { id: record.id } })
				expect(found).not.toBeNull()
			}

			// Count should match
			expect(await User.count()).toBe(100)
		})

		it('should maintain consistency with concurrent creates and deletes', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create 50 records first
			await Promise.all(
				Array.from({ length: 50 }, (_, i) =>
					User.create({ id: `user-${i}`, name: `User ${i}` })
				)
			)

			// Concurrent creates and deletes
			const operations = [
				// Create 50 more
				...Array.from({ length: 50 }, (_, i) =>
					User.create({ id: `new-${i}`, name: `New ${i}` })
				),
				// Delete first 25
				...Array.from({ length: 25 }, (_, i) =>
					User.delete({ where: { id: `user-${i}` } })
				)
			]

			await Promise.all(operations)

			// Should have 50 - 25 + 50 = 75 records
			expect(await User.count()).toBe(75)

			// Verify catalog accuracy
			const catalog = (User as unknown as { _getCatalog: () => Catalog })._getCatalog()
			const allIds = catalog.getAllIds()
			expect(allIds).toHaveLength(75)

			// Each ID in catalog should be findable
			for (const id of allIds) {
				const found = await User.findUnique({ where: { id } })
				expect(found).not.toBeNull()
			}
		})

		it('should handle rapid sequential operations', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create, update, delete in quick succession
			for (let i = 0; i < 50; i++) {
				const created = await User.create({ name: `User ${i}` })
				await User.update({
					where: { id: created.id },
					data: { name: `Updated ${i}` }
				})
				if (i % 2 === 0) {
					await User.delete({ where: { id: created.id } })
				}
			}

			// Should have 25 records (odd ones not deleted)
			expect(await User.count()).toBe(25)
		})
	})

	describe('Catalog Persistence', () => {
		it('should persist catalog after each modification', async () => {
			const adapter = new MemoryAdapter()
			await FlashcoreSystem._reset()
			await Flashcore.$.init({ adapter })

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create record
			await User.create({ id: 'user-1', name: 'Alice' })

			// Verify catalog was persisted
			const catalogKey = '_model:User:catalog'
			expect(adapter.has(catalogKey)).toBe(true)

			// Create another record
			await User.create({ id: 'user-2', name: 'Bob' })

			// Clear cache and reload
			await (User as unknown as { _reloadCatalog: () => Promise<void> })._reloadCatalog()

			// Both records should be found
			const user1 = await User.findUnique({ where: { id: 'user-1' } })
			const user2 = await User.findUnique({ where: { id: 'user-2' } })

			expect(user1).not.toBeNull()
			expect(user2).not.toBeNull()
		})

		it('should persist catalog after delete', async () => {
			const adapter = new MemoryAdapter()
			await FlashcoreSystem._reset()
			await Flashcore.$.init({ adapter })

			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create and delete
			await User.create({ id: 'user-1', name: 'Alice' })
			await User.delete({ where: { id: 'user-1' } })

			// Clear cache and reload
			await (User as unknown as { _reloadCatalog: () => Promise<void> })._reloadCatalog()

			// Record should not be found
			const user = await User.findUnique({ where: { id: 'user-1' } })
			expect(user).toBeNull()

			// Count should be 0
			expect(await User.count()).toBe(0)
		})
	})

	describe('Multiple Model Isolation', () => {
		it('should isolate catalogs between models', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const Post = FlashcoreSystem.registerModel<{ id: string; title: string }>('Post', {
				id: f.id(),
				title: f.string()
			})

			// Create with same IDs in both models
			await User.create({ id: 'item-1', name: 'Alice' })
			await Post.create({ id: 'item-1', title: 'Hello' })

			// Both should exist independently
			const user = await User.findUnique({ where: { id: 'item-1' } })
			const post = await Post.findUnique({ where: { id: 'item-1' } })

			expect(user?.name).toBe('Alice')
			expect(post?.title).toBe('Hello')

			// Counts should be separate
			expect(await User.count()).toBe(1)
			expect(await Post.count()).toBe(1)

			// Deleting from one shouldn't affect other
			await User.delete({ where: { id: 'item-1' } })

			expect(await User.findUnique({ where: { id: 'item-1' } })).toBeNull()
			expect(await Post.findUnique({ where: { id: 'item-1' } })).not.toBeNull()
		})

		it('should handle concurrent operations on different models', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const Post = FlashcoreSystem.registerModel<{ id: string; title: string }>('Post', {
				id: f.id(),
				title: f.string()
			})

			const Comment = FlashcoreSystem.registerModel<{ id: string; text: string }>('Comment', {
				id: f.id(),
				text: f.string()
			})

			// Concurrent operations on all models
			const operations = [
				...Array.from({ length: 30 }, (_, i) =>
					User.create({ name: `User ${i}` })
				),
				...Array.from({ length: 30 }, (_, i) =>
					Post.create({ title: `Post ${i}` })
				),
				...Array.from({ length: 30 }, (_, i) =>
					Comment.create({ text: `Comment ${i}` })
				)
			]

			await Promise.all(operations)

			expect(await User.count()).toBe(30)
			expect(await Post.count()).toBe(30)
			expect(await Comment.count()).toBe(30)
		})
	})

	describe('Edge Cases', () => {
		it('should handle empty catalog operations', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Find on empty model
			const found = await User.findUnique({ where: { id: 'non-existent' } })
			expect(found).toBeNull()

			// Delete on empty model
			const deleted = await User.delete({ where: { id: 'non-existent' } })
			expect(deleted).toBeNull()

			// Count on empty model
			expect(await User.count()).toBe(0)
		})

		it('should handle very long IDs near limit', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const longId = 'a'.repeat(200) // Max length
			await User.create({ id: longId, name: 'Alice' })

			const found = await User.findUnique({ where: { id: longId } })
			expect(found?.id).toBe(longId)
		})

		it('should handle special characters in IDs', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const specialId = 'user_123-abc_XYZ-789'
			await User.create({ id: specialId, name: 'Alice' })

			const found = await User.findUnique({ where: { id: specialId } })
			expect(found?.id).toBe(specialId)
		})
	})
})
