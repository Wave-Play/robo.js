/**
 * Flashcore v1 (spec rev 4.3) Phase 4 - Bulk Partial Failure Tests
 *
 * Tests bulk operation behavior when the underlying adapter fails mid-operation.
 * Uses a FailingAdapter wrapper around MemoryAdapter that throws after a
 * configurable number of set operations.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

interface User {
	id: string
	name: string
	email: string
	age: number
}

/**
 * A test adapter that wraps MemoryAdapter and fails on the Nth set() call.
 * Used to simulate partial failures during bulk operations.
 */
class FailingAdapter extends MemoryAdapter {
	failAfter = Infinity
	private opCount = 0

	set(key: string, value: unknown): boolean {
		this.opCount++
		if (this.opCount > this.failAfter) {
			throw new Error('Simulated adapter failure')
		}
		return super.set(key as any, value as any)
	}

	resetOpCount(): void {
		this.opCount = 0
	}
}

describe('Bulk Partial Failure', () => {
	let failingAdapter: FailingAdapter

	beforeEach(async () => {
		failingAdapter = new FailingAdapter()
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: failingAdapter as any })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('createMany with skipDuplicates', () => {
		it('should skip duplicate IDs and create the rest', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			// Create first user
			await User.create({ id: 'user-1', name: 'Alice', email: 'alice@test.com', age: 30 })

			// createMany with a duplicate
			const result = await User.createMany({
				data: [
					{ id: 'user-1', name: 'Duplicate Alice', email: 'dup@test.com', age: 30 },
					{ id: 'user-2', name: 'Bob', email: 'bob@test.com', age: 25 },
					{ id: 'user-3', name: 'Charlie', email: 'charlie@test.com', age: 35 }
				],
				skipDuplicates: true
			})

			// Should have created 2 new records (skipped the duplicate)
			expect(result.count).toBe(2)

			const all = await User.findMany()
			expect(all.length).toBe(3) // 1 original + 2 new

			// Original Alice should be unchanged
			const alice = await User.findUnique({ where: { id: 'user-1' } })
			expect(alice!.name).toBe('Alice')
		})
	})

	describe('createMany with adapter failure', () => {
		it('should propagate adapter errors during creation', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			// Allow initial catalog/schema writes to succeed, then fail
			// The exact number depends on internal storage operations.
			// We set it high enough for model registration overhead,
			// then reset after first create to target the bulk operation.
			const firstRecord = await User.create({
				name: 'Pre-existing',
				email: 'pre@test.com',
				age: 20
			})
			expect(firstRecord).toBeDefined()

			// Now set a very low failure threshold
			failingAdapter.resetOpCount()
			failingAdapter.failAfter = 1

			// Bulk create should fail at some point
			await expect(User.createMany({
				data: [
					{ name: 'Alice', email: 'alice@test.com', age: 30 },
					{ name: 'Bob', email: 'bob@test.com', age: 25 },
					{ name: 'Charlie', email: 'charlie@test.com', age: 35 }
				]
			})).rejects.toThrow('Simulated adapter failure')
		})
	})

	describe('deleteMany with partial failure', () => {
		it('should propagate adapter errors during deletion', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			// Create records first (adapter works normally)
			await User.create({ id: 'user-1', name: 'Alice', email: 'alice@test.com', age: 30 })
			await User.create({ id: 'user-2', name: 'Bob', email: 'bob@test.com', age: 25 })
			await User.create({ id: 'user-3', name: 'Charlie', email: 'charlie@test.com', age: 35 })

			// Now make the adapter fail after a few operations
			failingAdapter.resetOpCount()
			failingAdapter.failAfter = 1

			// deleteMany should propagate the error
			await expect(User.deleteMany({
				where: { age: { gte: 25 } }
			})).rejects.toThrow('Simulated adapter failure')
		})
	})

	describe('updateMany with partial failure', () => {
		it('should propagate adapter errors during update', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			// Create records first
			await User.create({ id: 'user-1', name: 'Alice', email: 'alice@test.com', age: 30 })
			await User.create({ id: 'user-2', name: 'Bob', email: 'bob@test.com', age: 25 })
			await User.create({ id: 'user-3', name: 'Charlie', email: 'charlie@test.com', age: 35 })

			// Now make the adapter fail after a few operations
			failingAdapter.resetOpCount()
			failingAdapter.failAfter = 1

			// updateMany should propagate the error
			await expect(User.updateMany({
				where: { age: { gte: 25 } },
				data: { name: 'Updated' }
			})).rejects.toThrow('Simulated adapter failure')
		})
	})

	describe('Bulk error propagation', () => {
		it('should propagate adapter errors from bulk operations', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string(),
				age: f.number()
			})

			// Let initial setup succeed
			await User.create({ name: 'Setup', email: 'setup@test.com', age: 20 })

			// Fail immediately on next set
			failingAdapter.resetOpCount()
			failingAdapter.failAfter = 0

			// Even a single create should fail
			await expect(User.create({
				name: 'Fail',
				email: 'fail@test.com',
				age: 99
			})).rejects.toThrow('Simulated adapter failure')
		})
	})
})
