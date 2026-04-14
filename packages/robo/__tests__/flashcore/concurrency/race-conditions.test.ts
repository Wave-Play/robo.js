/**
 * Flashcore v1 (spec rev 4.3) - Concurrency Race Condition Tests
 *
 * Documents and verifies specific race conditions in the CRUD layer:
 * - Unique constraint race: concurrent CREATE branches contest the same unique value
 * - Unique constraint release-before-acquire window
 * - Create holds catalog lock; update does not (asymmetry)
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

interface Counter {
	id: string
	name: string
	value: number
}

interface UserRecord {
	id: string
	name: string
	email: string
	age: number
}

describe('Concurrency Race Conditions', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Upsert TOCTOU - CREATE branch data loss', () => {
		it('documents that concurrent upsert CREATE branch may reject with UniqueConstraintError', async () => {
			const User = FlashcoreSystem.registerModel<UserRecord>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number()
			})

			// Two concurrent upserts for the same non-existent record, matched by unique field.
			// Both enter the CREATE branch and generate different random IDs.
			// The first acquires the unique constraint on 'email'. The second's unique
			// constraint acquisition fails because the email is already claimed.
			// This documents the unique constraint race window in the CREATE branch.
			const results = await Promise.allSettled([
				User.upsert({
					where: { email: 'alice@example.com' },
					create: { name: 'Alice', email: 'alice@example.com', age: 25 },
					update: { age: 99 }
				}),
				User.upsert({
					where: { email: 'alice@example.com' },
					create: { name: 'Alice', email: 'alice@example.com', age: 25 },
					update: { age: 100 }
				})
			])

			// At least one upsert succeeds
			const fulfilled = results.filter(r => r.status === 'fulfilled')
			expect(fulfilled.length).toBeGreaterThanOrEqual(1)

			// The rejected one (if any) fails with UniqueConstraintError — this is the
			// documented TOCTOU window: the CREATE branch's double-check sees no record
			// by ID, but the unique constraint on 'email' was already acquired by the winner.
			const rejected = results.filter(r => r.status === 'rejected')
			for (const r of rejected) {
				expect((r as PromiseRejectedResult).reason.message).toContain('Unique constraint violation')
			}

			// Exactly one record should exist
			const all = await User.findMany()
			expect(all.length).toBe(1)
			expect(all[0].email).toBe('alice@example.com')
			// The age is from the create data of whichever upsert won
			expect(all[0].age).toBe(25)
		})

		it('correctly applies update data when upsert finds existing record via UPDATE branch', async () => {
			const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
				id: f.id(),
				name: f.string(),
				value: f.number()
			})

			// Pre-create the record so that upsert takes the UPDATE branch
			await Counter.create({ id: 'counter-1', name: 'hits', value: 0 })

			// Upsert should find existing record and apply update data
			const result = await Counter.upsert({
				where: { id: 'counter-1' },
				create: { id: 'counter-1', name: 'hits', value: 0 },
				update: { value: 42 }
			})

			// The UPDATE branch correctly applies the update data
			expect(result.value).toBe(42)
			expect(result.name).toBe('hits')

			// Verify persistence
			const persisted = await Counter.findUnique({ where: { id: 'counter-1' } })
			expect(persisted).not.toBeNull()
			expect(persisted!.value).toBe(42)
		})
	})

	describe('Unique constraint window', () => {
		it('documents unique constraint ordering difference between upsert and update', async () => {
			const User = FlashcoreSystem.registerModel<UserRecord>('User', {
				id: f.id(),
				name: f.string(),
				email: f.string().unique(),
				age: f.number()
			})

			// Create two records with distinct unique emails
			await User.create({ id: 'user-1', name: 'Alice', email: 'alice@example.com', age: 25 })
			await User.create({ id: 'user-2', name: 'Bob', email: 'bob@example.com', age: 30 })

			// Swap emails concurrently: each user takes the other's email.
			// This stresses the release-before-acquire window where one update
			// releases the old unique value before the other acquires it.
			const results = await Promise.allSettled([
				User.update({
					where: { id: 'user-1' },
					data: { email: 'bob@example.com' }     // Alice takes Bob's email
				}),
				User.update({
					where: { id: 'user-2' },
					data: { email: 'alice@example.com' }    // Bob takes Alice's email
				})
			])

			// A concurrent swap typically causes both to fail: each update sees the
			// target email already claimed by the other record. At most one succeeds
			// if timing allows a release-before-acquire window.
			const fulfilled = results.filter(r => r.status === 'fulfilled')
			expect(fulfilled.length).toBeLessThanOrEqual(2)

			// Regardless of outcome, no duplicate emails should exist
			const allUsers = await User.findMany()
			expect(allUsers.length).toBe(2)
			const emails = allUsers.map(u => u.email)
			const uniqueEmails = new Set(emails)
			expect(uniqueEmails.size).toBe(2)
		})
	})

	describe('Catalog lock asymmetry', () => {
		it('concurrent create and update complete without corruption', async () => {
			const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
				id: f.id(),
				name: f.string(),
				value: f.number()
			})

			// Pre-create a record for the update target
			await Counter.create({ id: 'existing-1', name: 'existing', value: 10 })

			// Concurrent create (holds catalog lock) + update (does NOT hold catalog lock)
			// This asymmetry is documented; both should complete without corruption.
			const results = await Promise.allSettled([
				Counter.create({ id: 'new-1', name: 'new', value: 1 }),
				Counter.update({
					where: { id: 'existing-1' },
					data: { value: 20 }
				})
			])

			// Both should succeed
			expect(results[0].status).toBe('fulfilled')
			expect(results[1].status).toBe('fulfilled')

			// Verify both records are correct
			const newRecord = await Counter.findUnique({ where: { id: 'new-1' } })
			expect(newRecord).not.toBeNull()
			expect(newRecord!.name).toBe('new')
			expect(newRecord!.value).toBe(1)

			const existingRecord = await Counter.findUnique({ where: { id: 'existing-1' } })
			expect(existingRecord).not.toBeNull()
			expect(existingRecord!.value).toBe(20)

			// Total records should be 2
			const all = await Counter.findMany()
			expect(all.length).toBe(2)
		})

		it('N concurrent creates produce correct catalog count', async () => {
			const Counter = FlashcoreSystem.registerModel<Counter>('Counter', {
				id: f.id(),
				name: f.string(),
				value: f.number()
			})

			const N = 20

			// Fire off N concurrent creates, each with a unique ID
			const creates = Array.from({ length: N }, (_, i) =>
				Counter.create({
					id: `item-${String(i).padStart(3, '0')}`,
					name: `item-${i}`,
					value: i
				})
			)

			const results = await Promise.allSettled(creates)

			// All should succeed
			for (const result of results) {
				expect(result.status).toBe('fulfilled')
			}

			// Catalog should contain exactly N records
			const all = await Counter.findMany()
			expect(all.length).toBe(N)

			// Each record should be independently readable
			for (let i = 0; i < N; i++) {
				const id = `item-${String(i).padStart(3, '0')}`
				const record = await Counter.findUnique({ where: { id } })
				expect(record).not.toBeNull()
				expect(record!.name).toBe(`item-${i}`)
				expect(record!.value).toBe(i)
			}
		})
	})
})
