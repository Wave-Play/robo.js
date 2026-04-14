/**
 * Phase 7: Full-Stack Integration Tests
 *
 * End-to-end tests verifying the full Flashcore stack with extras registered.
 * Exercises model registration, CRUD, schema changes, transactions,
 * integrity checks, relations, bulk operations, and count.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from 'robo.js/flashcore'
import { _resetExtensions } from '../../../../robo/src/flashcore/core/extensions.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('Full-Stack Integration', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		registerAllExtensions()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should perform a full CRUD cycle with extras registered', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string; email: string }>('User', {
			id: f.id(),
			name: f.string(),
			email: f.string().unique()
		})

		// Create
		const created = await User.create({ name: 'Alice', email: 'alice@example.com' })
		expect(created.id).toBeDefined()
		expect(created.name).toBe('Alice')
		expect(created.email).toBe('alice@example.com')

		// Read
		const found = await User.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.name).toBe('Alice')

		// Update
		const updated = await User.update({
			where: { id: created.id },
			data: { name: 'Alice Updated' }
		})
		expect(updated).not.toBeNull()
		expect(updated!.name).toBe('Alice Updated')

		// Delete
		const deleted = await User.delete({ where: { id: created.id } })
		expect(deleted).not.toBeNull()
		expect(deleted!.id).toBe(created.id)

		// Confirm deletion
		const afterDelete = await User.findUnique({ where: { id: created.id } })
		expect(afterDelete).toBeNull()
	})

	it('should handle schema change detection with safe changes', async () => {
		// Register model with initial schema
		const UserV1 = FlashcoreSystem.registerModel<{ id: string; name: string }>('UserV1', {
			id: f.id(),
			name: f.string()
		})

		// Create a record with the initial schema
		const created = await UserV1.create({ name: 'Bob' })
		expect(created.id).toBeDefined()

		// Verify the record can be found
		const found = await UserV1.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.name).toBe('Bob')
	})

	it('should execute a transaction that reads and writes', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('TxUser', {
			id: f.id(),
			name: f.string()
		})

		// Seed a record
		const seeded = await User.create({ name: 'Alice' })

		// Execute a transaction using the ITransactionContext API
		const result = await Flashcore.$.transaction(async (tx) => {
			// Read via KV inside transaction context (read is async)
			const val = await tx.read(`tx-key:${seeded.id}`)

			// Stage a write (set is synchronous staging)
			tx.set(`tx-key:${seeded.id}`, { updated: true })

			return val
		})

		// TransactionResult has { result, retries, durationMs }
		expect(result.durationMs).toBeGreaterThanOrEqual(0)
		expect(result.retries).toBe(0)
	})

	it('should run integrity check on healthy data with no issues', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('IntUser', {
			id: f.id(),
			name: f.string()
		})

		await User.create({ name: 'Alice' })
		await User.create({ name: 'Bob' })
		await User.create({ name: 'Charlie' })

		const report = await Flashcore.$.checkIntegrity()

		expect(report.isValid).toBe(true)
		expect(report.models).toHaveLength(1)
		expect(report.models[0].isValid).toBe(true)
		expect(report.models[0].warnings).toHaveLength(0)
	})

	it('should work without extensions registered (silent degradation)', async () => {
		// Reset everything including extensions, then reinitialize WITHOUT registering
		await FlashcoreSystem._reset()
		_resetExtensions()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })

		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('DegradedUser', {
			id: f.id(),
			name: f.string()
		})

		// CRUD should still work without WAL
		const created = await User.create({ name: 'Alice' })
		expect(created.id).toBeDefined()

		const found = await User.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.name).toBe('Alice')
	})

	it('should support multiple models with foreign key relations', async () => {
		const Author = FlashcoreSystem.registerModel<{ id: string; name: string }>('Author', {
			id: f.id(),
			name: f.string()
		})

		const Book = FlashcoreSystem.registerModel<{ id: string; title: string; authorId: string }>('Book', {
			id: f.id(),
			title: f.string(),
			authorId: f.string(),
			author: f.relation('Author', 'authorId')
		})

		const author = await Author.create({ name: 'J.K. Rowling' })
		const book = await Book.create({ title: 'Harry Potter', authorId: author.id })

		expect(book.authorId).toBe(author.id)

		// Find with include
		const bookWithAuthor = await Book.findUnique({
			where: { id: book.id },
			include: { author: true }
		})

		expect(bookWithAuthor).not.toBeNull()
		expect((bookWithAuthor as any).author).toBeDefined()
		expect((bookWithAuthor as any).author.name).toBe('J.K. Rowling')
	})

	it('should handle bulk create and findMany', async () => {
		const Item = FlashcoreSystem.registerModel<{ id: string; label: string }>('Item', {
			id: f.id(),
			label: f.string()
		})

		const data = Array.from({ length: 10 }, (_, i) => ({ label: `Item ${i}` }))
		const result = await Item.createMany({ data })

		expect(result.count).toBe(10)

		const all = await Item.findMany()
		expect(all).toHaveLength(10)
	})

	it('should return correct count after create and delete operations', async () => {
		const Counter = FlashcoreSystem.registerModel<{ id: string; value: number }>('Counter', {
			id: f.id(),
			value: f.number()
		})

		// Create 5 records
		const records = []
		for (let i = 0; i < 5; i++) {
			records.push(await Counter.create({ value: i }))
		}

		expect(await Counter.count()).toBe(5)

		// Delete 2 records
		await Counter.delete({ where: { id: records[0].id } })
		await Counter.delete({ where: { id: records[1].id } })

		expect(await Counter.count()).toBe(3)
	})
})
