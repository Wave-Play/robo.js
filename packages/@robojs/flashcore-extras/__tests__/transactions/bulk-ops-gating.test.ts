/**
 * Flashcore v1 (spec rev 4.3) Phase 8 - Bulk Operations ACID Gating Tests
 *
 * Tests that bulk operations require adapter ACID support.
 */

import { FlashcoreSystem, MemoryAdapter, f } from 'robo.js/flashcore'
import type { FlashcoreAdapter, BatchOperation } from 'robo.js/flashcore'
import { registerAllExtensions } from '../helpers/register-extensions.js'

/**
 * Create a minimal adapter without ACID support.
 */
function createMinimalAdapter(): FlashcoreAdapter {
	const store = new Map<string, unknown>()
	return {
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => { store.set(key, value); return true },
		delete: async (key: string) => { store.delete(key); return true },
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() }
	}
}

/**
 * Create an adapter with atomicBatch support.
 */
function createBatchAdapter(): FlashcoreAdapter {
	const store = new Map<string, unknown>()
	return {
		get: async (key: string) => store.get(key),
		set: async (key: string, value: unknown) => { store.set(key, value); return true },
		delete: async (key: string) => { store.delete(key); return true },
		has: async (key: string) => store.has(key),
		clear: async () => { store.clear() },
		atomicBatch: async (ops: BatchOperation<string, unknown>[]) => {
			for (const op of ops) {
				if (op.type === 'set') {
					store.set(op.key, op.value)
				} else if (op.type === 'delete') {
					store.delete(op.key)
				}
			}
		}
	}
}

interface User {
	id: string
	name: string
	age: number
}

describe('Bulk Operations ACID Gating', () => {
	describe('Without ACID Support', () => {
		beforeEach(async () => {
			await FlashcoreSystem._reset()
			registerAllExtensions()
			await FlashcoreSystem.init({ adapter: createMinimalAdapter() })
		})

		it('createMany should throw when adapter lacks ACID', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			await expect(User.createMany({
				data: [
					{ name: 'Alice', age: 30 },
					{ name: 'Bob', age: 25 }
				]
			})).rejects.toThrow(/atomic/)
		})

		it('updateMany should throw when adapter lacks ACID', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			// Create a record first
			await User.create({ name: 'Alice', age: 30 })

			await expect(User.updateMany({
				where: { age: { gte: 25 } },
				data: { age: 35 }
			})).rejects.toThrow(/atomic/)
		})

		it('deleteMany should throw when adapter lacks ACID', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			// Create a record first
			await User.create({ name: 'Alice', age: 30 })

			await expect(User.deleteMany({
				where: { age: { gte: 25 } }
			})).rejects.toThrow(/atomic/)
		})

		it('should provide helpful error message', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			try {
				await User.createMany({ data: [{ name: 'Test', age: 20 }] })
				fail('Should have thrown')
			} catch (error) {
				expect(error).toBeInstanceOf(Error)
				const e = error as Error
				expect(e.message).toContain('atomic')
			}
		})
	})

	describe('With ACID Support', () => {
		beforeEach(async () => {
			await FlashcoreSystem._reset()
			registerAllExtensions()
			await FlashcoreSystem.init({ adapter: createBatchAdapter() })
		})

		it('createMany should succeed', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			const result = await User.createMany({
				data: [
					{ name: 'Alice', age: 30 },
					{ name: 'Bob', age: 25 }
				]
			})

			expect(result.records.length).toBe(2)
			expect(result.count).toBe(2)
		})

		it('updateMany should succeed', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			// Create records first
			await User.create({ name: 'Alice', age: 30 })
			await User.create({ name: 'Bob', age: 25 })

			const result = await User.updateMany({
				where: { age: { gte: 25 } },
				data: { age: 35 }
			})

			expect(result.count).toBe(2)
		})

		it('deleteMany should succeed', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			// Create records first
			await User.create({ name: 'Alice', age: 30 })
			await User.create({ name: 'Bob', age: 25 })

			const result = await User.deleteMany({
				where: { age: { gte: 25 } }
			})

			expect(result.count).toBe(2)

			// Verify deleted
			const remaining = await User.findMany()
			expect(remaining.length).toBe(0)
		})
	})

	describe('MemoryAdapter Support', () => {
		beforeEach(async () => {
			await FlashcoreSystem._reset()
			registerAllExtensions()
			await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
		})

		it('MemoryAdapter should support bulk operations', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			// createMany
			const created = await User.createMany({
				data: [
					{ name: 'Alice', age: 30 },
					{ name: 'Bob', age: 25 },
					{ name: 'Charlie', age: 35 }
				]
			})
			expect(created.count).toBe(3)

			// updateMany
			const updated = await User.updateMany({
				where: { age: { gte: 30 } },
				data: { age: 40 }
			})
			expect(updated.count).toBe(2)

			// deleteMany
			const deleted = await User.deleteMany({
				where: { age: { lt: 40 } }
			})
			expect(deleted.count).toBe(1)
		})
	})
})
