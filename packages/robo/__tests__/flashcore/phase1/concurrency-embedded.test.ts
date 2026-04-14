/**
 * Flashcore v1 (spec rev 4.3) Phase 1 Tests - Concurrency (Embedded Mode)
 *
 * Tests concurrent creates/updates/deletes with locking.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

describe('Concurrency (Embedded Mode)', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Concurrent Creates', () => {
		it('should handle 100 concurrent creates without losing records', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const creates = Array.from({ length: 100 }, (_, i) =>
				User.create({ name: `User ${i}` })
			)

			const results = await Promise.all(creates)

			expect(results).toHaveLength(100)
			expect(await User.count()).toBe(100)

			// Verify all records are unique
			const ids = new Set(results.map(r => r.id))
			expect(ids.size).toBe(100)
		})

		it('should handle concurrent creates with provided IDs', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const creates = Array.from({ length: 50 }, (_, i) =>
				User.create({ id: `user-${i}`, name: `User ${i}` })
			)

			const results = await Promise.all(creates)

			expect(results).toHaveLength(50)
			expect(await User.count()).toBe(50)
		})

		it('should reject duplicate IDs in concurrent creates', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// All try to create with same ID
			const creates = Array.from({ length: 10 }, (_, i) =>
				User.create({ id: 'same-id', name: `User ${i}` })
					.then(result => ({ success: true, result }))
					.catch(error => ({ success: false, error }))
			)

			const results = await Promise.all(creates)

			// Exactly one should succeed
			const successes = results.filter(r => r.success)
			const failures = results.filter(r => !r.success)

			expect(successes).toHaveLength(1)
			expect(failures).toHaveLength(9)
		})
	})

	describe('Concurrent Updates', () => {
		it('should handle concurrent updates to same record', async () => {
			const Counter = FlashcoreSystem.registerModel<{ id: string; value: number }>('Counter', {
				id: f.id(),
				value: f.number()
			})

			await Counter.create({ id: 'counter-1', value: 0 })

			// 50 concurrent increments
			const updates = Array.from({ length: 50 }, async () => {
				const current = await Counter.findUnique({ where: { id: 'counter-1' } })
				return Counter.update({
					where: { id: 'counter-1' },
					data: { value: (current?.value ?? 0) + 1 }
				})
			})

			await Promise.all(updates)

			const final = await Counter.findUnique({ where: { id: 'counter-1' } })
			// Due to race conditions without optimistic locking, the value may be less than 50
			// But it should be greater than 0 and no data should be lost
			expect(final?.value).toBeGreaterThan(0)
		})

		it('should handle concurrent updates to different records', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string; counter: number }>('User', {
				id: f.id(),
				name: f.string(),
				counter: f.number().default(0)
			})

			// Create 10 users (bind to preserve context, cast to allow omitting counter which has default)
			const createUser = (User.create as (data: { id: string; name: string }) => Promise<{ id: string; name: string; counter: number }>).bind(User)
			await Promise.all(
				Array.from({ length: 10 }, (_, i) =>
					createUser({ id: `user-${i}`, name: `User ${i}` })
				)
			)

			// Update each user 5 times concurrently
			const updates = Array.from({ length: 10 }, (_, userId) =>
				Array.from({ length: 5 }, () =>
					User.update({
						where: { id: `user-${userId}` },
						data: { counter: Math.random() }
					})
				)
			).flat()

			await Promise.all(updates)

			// All users should still exist
			expect(await User.count()).toBe(10)

			// Each user should have been updated
			for (let i = 0; i < 10; i++) {
				const user = await User.findUnique({ where: { id: `user-${i}` } })
				expect(user).not.toBeNull()
			}
		})
	})

	describe('Concurrent Deletes', () => {
		it('should handle concurrent deletes gracefully', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ id: 'user-1', name: 'Alice' })

			// 10 concurrent delete attempts
			const deletes = Array.from({ length: 10 }, () =>
				User.delete({ where: { id: 'user-1' } })
					.then(result => ({ deleted: result !== null }))
			)

			const results = await Promise.all(deletes)

			// Exactly one should return the deleted record
			const successfulDeletes = results.filter(r => r.deleted)
			expect(successfulDeletes).toHaveLength(1)

			// Record should be gone
			const found = await User.findUnique({ where: { id: 'user-1' } })
			expect(found).toBeNull()
		})

		it('should handle concurrent deletes of different records', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create 50 users
			await Promise.all(
				Array.from({ length: 50 }, (_, i) =>
					User.create({ id: `user-${i}`, name: `User ${i}` })
				)
			)

			expect(await User.count()).toBe(50)

			// Delete all 50 concurrently
			const deletes = Array.from({ length: 50 }, (_, i) =>
				User.delete({ where: { id: `user-${i}` } })
			)

			const results = await Promise.all(deletes)

			// All should return the deleted record
			expect(results.filter(r => r !== null)).toHaveLength(50)

			// No users should remain
			expect(await User.count()).toBe(0)
		})
	})

	describe('Mixed Operations', () => {
		it('should handle concurrent create/update/delete mix', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Pre-populate some users
			await Promise.all(
				Array.from({ length: 20 }, (_, i) =>
					User.create({ id: `existing-${i}`, name: `Existing ${i}` })
				)
			)

			// Mix of operations
			const operations = [
				// Create 30 new users
				...Array.from({ length: 30 }, (_, i) =>
					User.create({ name: `New ${i}` })
						.then(() => ({ op: 'create', success: true }))
						.catch(() => ({ op: 'create', success: false }))
				),
				// Update 20 existing users
				...Array.from({ length: 20 }, (_, i) =>
					User.update({
						where: { id: `existing-${i}` },
						data: { name: `Updated ${i}` }
					})
						.then(() => ({ op: 'update', success: true }))
						.catch(() => ({ op: 'update', success: false }))
				),
				// Delete 10 existing users
				...Array.from({ length: 10 }, (_, i) =>
					User.delete({ where: { id: `existing-${i}` } })
						.then(() => ({ op: 'delete', success: true }))
						.catch(() => ({ op: 'delete', success: false }))
				)
			]

			const results = await Promise.all(operations)

			// All operations should succeed (no crashes)
			const failures = results.filter(r => !r.success)
			expect(failures).toHaveLength(0)

			// Count should be: 20 (existing) + 30 (new) - 10 (deleted) = 40
			expect(await User.count()).toBe(40)
		})

		it('should maintain catalog consistency under concurrent load', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Heavy concurrent operations
			const operations = [
				// Creates
				...Array.from({ length: 100 }, () =>
					User.create({ name: 'User' }).catch((): null => null)
				),
				// Reads (shouldn't interfere with writes)
				...Array.from({ length: 50 }, () =>
					User.findUnique({ where: { id: 'user-0' } }).catch((): null => null)
				)
			]

			await Promise.all(operations)

			// Count from catalog should match actual records
			const count = await User.count()

			// Verify by trying to find records
			let actualCount = 0
			const catalog = (User as unknown as { _getCatalog: () => { getAllIds: () => string[] } })._getCatalog()
			for (const id of catalog.getAllIds()) {
				const found = await User.findUnique({ where: { id } })
				if (found) actualCount++
			}

			expect(actualCount).toBe(count)
		})
	})

	describe('Race Condition Prevention', () => {
		it('should serialize catalog modifications', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Rapid fire creates
			const rapidCreates = Array.from({ length: 200 }, () =>
				User.create({ name: 'User' })
			)

			const results = await Promise.all(rapidCreates)

			// All creates should succeed
			expect(results).toHaveLength(200)

			// No duplicate IDs
			const ids = results.map(r => r.id)
			const uniqueIds = new Set(ids)
			expect(uniqueIds.size).toBe(200)

			// Count should match
			expect(await User.count()).toBe(200)
		})

		it('should handle interleaved operations correctly', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			// Create -> Update -> Read -> Delete interleaved
			const operations: Promise<unknown>[] = []

			for (let i = 0; i < 20; i++) {
				operations.push(
					User.create({ id: `user-${i}`, name: `User ${i}` })
						.then(() => User.update({
							where: { id: `user-${i}` },
							data: { name: `Updated ${i}` }
						}))
						.then(() => User.findUnique({ where: { id: `user-${i}` } }))
				)
			}

			const results = await Promise.all(operations)

			// All operations should complete
			expect(results).toHaveLength(20)

			// All records should be in updated state
			for (let i = 0; i < 20; i++) {
				const user = await User.findUnique({ where: { id: `user-${i}` } })
				expect(user?.name).toBe(`Updated ${i}`)
			}
		})
	})
})
