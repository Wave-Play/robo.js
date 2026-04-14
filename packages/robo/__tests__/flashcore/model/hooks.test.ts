/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Model Lifecycle Hooks Tests
 *
 * Tests that model lifecycle hooks (beforeCreate, afterCreate, beforeUpdate,
 * afterUpdate, beforeDelete, afterDelete) fire correctly during CRUD operations.
 * Uses full Flashcore init with MemoryAdapter for integration testing.
 */

import { jest } from '@jest/globals'
import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'
interface User {
	id: string
	name: string
	age: number
}

describe('Model Lifecycle Hooks', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('beforeCreate', () => {
		it('should fire on create and receive the input data', async () => {
			const beforeCreateFn = jest.fn<(data: unknown) => unknown>((data) => data)

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			}, {
				hooks: {
					beforeCreate: beforeCreateFn
				}
			})

			await User.create({ name: 'Alice', age: 30 })

			expect(beforeCreateFn).toHaveBeenCalledTimes(1)
			const callArg = beforeCreateFn.mock.calls[0][0] as Record<string, unknown>
			expect(callArg).toHaveProperty('name', 'Alice')
			expect(callArg).toHaveProperty('age', 30)
		})

		it('should allow modifying data before creation', async () => {
			const beforeCreateFn = jest.fn<(data: unknown) => unknown>((data) => {
				const d = data as Record<string, unknown>
				return { ...d, name: d.name + ' (modified)' }
			})

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			}, {
				hooks: {
					beforeCreate: beforeCreateFn
				}
			})

			const created = await User.create({ name: 'Alice', age: 30 })

			expect(created.name).toBe('Alice (modified)')
		})
	})

	describe('afterCreate', () => {
		it('should fire on create and receive the created record with id', async () => {
			const afterCreateFn = jest.fn<(record: unknown) => void>()

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			}, {
				hooks: {
					afterCreate: afterCreateFn
				}
			})

			const created = await User.create({ name: 'Bob', age: 25 })

			expect(afterCreateFn).toHaveBeenCalledTimes(1)
			const callArg = afterCreateFn.mock.calls[0][0] as User
			expect(callArg.id).toBe(created.id)
			expect(callArg.name).toBe('Bob')
			expect(callArg.age).toBe(25)
		})
	})

	describe('beforeUpdate', () => {
		it('should fire on update with update data and existing record', async () => {
			const beforeUpdateFn = jest.fn<(data: unknown, existing: unknown) => unknown>(
				(data, _existing) => data
			)

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			}, {
				hooks: {
					beforeUpdate: beforeUpdateFn
				}
			})

			const created = await User.create({ name: 'Alice', age: 30 })
			await User.update({
				where: { id: created.id },
				data: { age: 31 }
			})

			expect(beforeUpdateFn).toHaveBeenCalledTimes(1)
			const updateData = beforeUpdateFn.mock.calls[0][0] as Record<string, unknown>
			expect(updateData).toHaveProperty('age', 31)
			const existing = beforeUpdateFn.mock.calls[0][1] as User
			expect(existing.name).toBe('Alice')
			expect(existing.age).toBe(30)
		})
	})

	describe('afterUpdate', () => {
		it('should fire on update with updated record', async () => {
			const afterUpdateFn = jest.fn<(record: unknown) => void>()

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			}, {
				hooks: {
					afterUpdate: afterUpdateFn
				}
			})

			const created = await User.create({ name: 'Alice', age: 30 })
			await User.update({
				where: { id: created.id },
				data: { age: 31 }
			})

			expect(afterUpdateFn).toHaveBeenCalledTimes(1)
			const updatedRecord = afterUpdateFn.mock.calls[0][0] as User
			expect(updatedRecord.age).toBe(31)
			expect(updatedRecord.name).toBe('Alice')
		})
	})

	describe('beforeDelete', () => {
		it('should fire before delete with existing record', async () => {
			const beforeDeleteFn = jest.fn<(record: unknown) => void>()

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			}, {
				hooks: {
					beforeDelete: beforeDeleteFn
				}
			})

			const created = await User.create({ name: 'Alice', age: 30 })
			await User.delete({ where: { id: created.id } })

			expect(beforeDeleteFn).toHaveBeenCalledTimes(1)
			const record = beforeDeleteFn.mock.calls[0][0] as User
			expect(record.id).toBe(created.id)
			expect(record.name).toBe('Alice')
		})
	})

	describe('afterDelete', () => {
		it('should fire after delete with deleted record', async () => {
			const afterDeleteFn = jest.fn<(record: unknown) => void>()

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			}, {
				hooks: {
					afterDelete: afterDeleteFn
				}
			})

			const created = await User.create({ name: 'Alice', age: 30 })
			await User.delete({ where: { id: created.id } })

			expect(afterDeleteFn).toHaveBeenCalledTimes(1)
			const record = afterDeleteFn.mock.calls[0][0] as User
			expect(record.id).toBe(created.id)
			expect(record.name).toBe('Alice')
		})
	})

	describe('Error propagation', () => {
		it('should propagate hook errors to the caller', async () => {
			const beforeCreateFn = jest.fn<(data: unknown) => unknown>(() => {
				throw new Error('Hook validation failed')
			})

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			}, {
				hooks: {
					beforeCreate: beforeCreateFn
				}
			})

			await expect(User.create({ name: 'Alice', age: 30 }))
				.rejects.toThrow('Hook validation failed')
		})
	})

	describe('Optional hooks', () => {
		it('should work normally without hooks defined', async () => {
			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			})

			const created = await User.create({ name: 'Alice', age: 30 })
			expect(created.name).toBe('Alice')

			const updated = await User.update({
				where: { id: created.id },
				data: { age: 31 }
			})
			expect(updated.age).toBe(31)

			const deleted = await User.delete({ where: { id: created.id } })
			expect(deleted).toBeDefined()
		})
	})

	describe('Multiple operations', () => {
		it('should fire hooks on each create call', async () => {
			const beforeCreateFn = jest.fn<(data: unknown) => unknown>((data) => data)
			const afterCreateFn = jest.fn<(record: unknown) => void>()

			const User = FlashcoreSystem.registerModel<User>('User', {
				id: f.id(),
				name: f.string(),
				age: f.number()
			}, {
				hooks: {
					beforeCreate: beforeCreateFn,
					afterCreate: afterCreateFn
				}
			})

			await User.create({ name: 'Alice', age: 30 })
			await User.create({ name: 'Bob', age: 25 })
			await User.create({ name: 'Charlie', age: 35 })

			expect(beforeCreateFn).toHaveBeenCalledTimes(3)
			expect(afterCreateFn).toHaveBeenCalledTimes(3)
		})
	})
})
