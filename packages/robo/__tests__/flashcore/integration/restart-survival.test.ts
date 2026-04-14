/**
 * Flashcore - Restart Survival Integration Tests
 *
 * Verifies that data persists across simulated restarts when using FileAdapter
 * with real disk I/O. A "restart" is simulated by:
 * 1. FlashcoreSystem._reset() — calls adapter.shutdown() and clears in-memory state
 * 2. Creating a NEW FileAdapter pointing at the same directory
 * 3. Re-initializing Flashcore and re-registering models
 *
 * FileAdapter.shutdown() only sets initialized=false; files persist on disk.
 * Models are code-declared, not persisted, so they must be re-registered after restart.
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

import { Flashcore, FlashcoreSystem, f, UniqueConstraintError } from '../helpers/flashcore-compat.js'
import { FileAdapter } from '../../../src/flashcore/adapter/builtins/file.js'

// Unique temp directory per test run to avoid collisions
let testDir: string

/**
 * Helper: simulate a restart by resetting Flashcore and re-initializing
 * with a new FileAdapter pointing at the same directory.
 */
async function simulateRestart(): Promise<void> {
	await FlashcoreSystem._reset()
	const freshAdapter = new FileAdapter({ baseDir: testDir })
	await Flashcore.$.init({ adapter: freshAdapter })
}

beforeEach(async () => {
	testDir = join(tmpdir(), `flashcore-restart-${Date.now()}-${randomBytes(4).toString('hex')}`)
	const adapter = new FileAdapter({ baseDir: testDir })
	await Flashcore.$.init({ adapter })
})

afterEach(async () => {
	await FlashcoreSystem._reset()
	try {
		await rm(testDir, { recursive: true, force: true })
	} catch {
		// Ignore cleanup errors
	}
})

// ============================================================================
// KV Data Survival
// ============================================================================

describe('KV data survival', () => {
	it('string value survives restart', async () => {
		await Flashcore.set('greeting', 'hello world')

		await simulateRestart()

		const value = await Flashcore.get<string>('greeting')
		expect(value).toBe('hello world')
	})

	it('object value survives restart', async () => {
		const obj = { name: 'Alice', nested: { scores: [10, 20, 30] } }
		await Flashcore.set('user-data', obj)

		await simulateRestart()

		const value = await Flashcore.get('user-data')
		expect(value).toEqual(obj)
	})

	it('deleted key stays deleted after restart', async () => {
		await Flashcore.set('ephemeral', 'temp')
		await Flashcore.delete('ephemeral')

		await simulateRestart()

		const value = await Flashcore.get('ephemeral')
		expect(value).toBeUndefined()

		const exists = await Flashcore.has('ephemeral')
		expect(exists).toBe(false)
	})

	it('multiple namespaced values survive restart', async () => {
		await Flashcore.set('key1', 'value-a', { namespace: 'a' })
		await Flashcore.set('key1', 'value-b', { namespace: 'b' })

		await simulateRestart()

		const valA = await Flashcore.get<string>('key1', { namespace: 'a' })
		const valB = await Flashcore.get<string>('key1', { namespace: 'b' })
		expect(valA).toBe('value-a')
		expect(valB).toBe('value-b')
	})
})

// ============================================================================
// Model Record Survival
// ============================================================================

interface User {
	id: string
	name: string
	email: string
	age: number
}

const userSchema = {
	id: f.id(),
	name: f.string(),
	email: f.string().unique(),
	age: f.number()
}

describe('Model record survival', () => {
	it('created record survives restart', async () => {
		const User = FlashcoreSystem.registerModel<User>('User', userSchema)
		const created = await User.create({ name: 'Alice', email: 'alice@test.com', age: 30 })

		await simulateRestart()

		const User2 = FlashcoreSystem.registerModel<User>('User', userSchema)
		const found = await User2.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.name).toBe('Alice')
		expect(found!.email).toBe('alice@test.com')
		expect(found!.age).toBe(30)
	})

	it('updated record survives restart with latest values', async () => {
		const User = FlashcoreSystem.registerModel<User>('User', userSchema)
		const created = await User.create({ name: 'Bob', email: 'bob@test.com', age: 25 })
		await User.update({ where: { id: created.id }, data: { age: 26, name: 'Bobby' } })

		await simulateRestart()

		const User2 = FlashcoreSystem.registerModel<User>('User', userSchema)
		const found = await User2.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.name).toBe('Bobby')
		expect(found!.age).toBe(26)
	})

	it('deleted record stays deleted after restart', async () => {
		const User = FlashcoreSystem.registerModel<User>('User', userSchema)
		const created = await User.create({ name: 'Charlie', email: 'charlie@test.com', age: 40 })
		await User.delete({ where: { id: created.id } })

		await simulateRestart()

		const User2 = FlashcoreSystem.registerModel<User>('User', userSchema)
		const found = await User2.findUnique({ where: { id: created.id } })
		expect(found).toBeNull()

		const count = await User2.count()
		expect(count).toBe(0)
	})

	it('multiple records across chunks survive restart', async () => {
		const Item = FlashcoreSystem.registerModel<{ id: string; idx: number }>('Item', {
			id: f.id(),
			idx: f.number()
		})

		const N = 120
		for (let i = 0; i < N; i++) {
			await Item.create({ idx: i })
		}

		await simulateRestart()

		const Item2 = FlashcoreSystem.registerModel<{ id: string; idx: number }>('Item', {
			id: f.id(),
			idx: f.number()
		})

		const all = await Item2.findMany()
		expect(all.length).toBe(N)

		const count = await Item2.count()
		expect(count).toBe(N)

		// Verify values are intact
		const indexes = all.map((r) => r.idx).sort((a, b) => a - b)
		for (let i = 0; i < N; i++) {
			expect(indexes[i]).toBe(i)
		}
	})

	it('segmented (large) record survives restart', async () => {
		interface BigRecord {
			id: string
			name: string
			payload: string
		}

		const Big = FlashcoreSystem.registerModel<BigRecord>('BigRecord', {
			id: f.id(),
			name: f.string(),
			payload: f.string()
		})

		const largePayload = 'A'.repeat(150_000)
		const created = await Big.create({ name: 'huge', payload: largePayload })

		await simulateRestart()

		const Big2 = FlashcoreSystem.registerModel<BigRecord>('BigRecord', {
			id: f.id(),
			name: f.string(),
			payload: f.string()
		})

		const found = await Big2.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.name).toBe('huge')
		expect(found!.payload).toBe(largePayload)
		expect(found!.payload.length).toBe(150_000)
	})
})

// ============================================================================
// Catalog Persistence
// ============================================================================

describe('Catalog persistence', () => {
	it('count is accurate after restart', async () => {
		const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
			id: f.id(),
			value: f.number()
		})

		const N = 15
		for (let i = 0; i < N; i++) {
			await Item.create({ value: i })
		}

		const countBefore = await Item.count()
		expect(countBefore).toBe(N)

		await simulateRestart()

		const Item2 = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
			id: f.id(),
			value: f.number()
		})

		const countAfter = await Item2.count()
		expect(countAfter).toBe(N)
	})

	it('catalog tracks correct chunk distribution after restart', async () => {
		const Item = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
			id: f.id(),
			value: f.number()
		})

		// Create enough records to likely span multiple chunks
		const N = 80
		for (let i = 0; i < N; i++) {
			await Item.create({ value: i })
		}

		await simulateRestart()

		const Item2 = FlashcoreSystem.registerModel<{ id: string; value: number }>('Item', {
			id: f.id(),
			value: f.number()
		})

		// findMany reads across all chunks — if distribution is wrong, this fails
		const all = await Item2.findMany()
		expect(all.length).toBe(N)
	})
})

// ============================================================================
// Index Persistence
// ============================================================================

describe('Index persistence', () => {
	it('findMany with where clause works after restart', async () => {
		interface IndexedItem {
			id: string
			category: string
			value: number
		}

		const Item = FlashcoreSystem.registerModel<IndexedItem>('IndexedItem', {
			id: f.id(),
			category: f.string().indexed(),
			value: f.number()
		})

		await Item.create({ category: 'alpha', value: 1 })
		await Item.create({ category: 'beta', value: 2 })
		await Item.create({ category: 'alpha', value: 3 })

		await simulateRestart()

		const Item2 = FlashcoreSystem.registerModel<IndexedItem>('IndexedItem', {
			id: f.id(),
			category: f.string().indexed(),
			value: f.number()
		})

		const alphas = await Item2.findMany({ where: { category: 'alpha' } })
		expect(alphas.length).toBe(2)
		expect(alphas.every((r) => r.category === 'alpha')).toBe(true)
	})

	it('unique constraints are enforced after restart', async () => {
		const User = FlashcoreSystem.registerModel<User>('User', userSchema)
		await User.create({ name: 'Alice', email: 'unique@test.com', age: 30 })

		await simulateRestart()

		const User2 = FlashcoreSystem.registerModel<User>('User', userSchema)

		// Attempting to create a record with the same unique email should throw
		await expect(
			User2.create({ name: 'Bob', email: 'unique@test.com', age: 25 })
		).rejects.toThrow(UniqueConstraintError)
	})
})

// ============================================================================
// Mixed Operations then Restart
// ============================================================================

describe('Mixed operations then restart', () => {
	it('complex sequence: create, update, delete, create — correct state after restart', async () => {
		interface Item {
			id: string
			label: string
			score: number
		}

		const Item = FlashcoreSystem.registerModel<Item>('Item', {
			id: f.id(),
			label: f.string(),
			score: f.number()
		})

		// Create A, B, C
		const a = await Item.create({ label: 'A', score: 1 })
		const b = await Item.create({ label: 'B', score: 2 })
		await Item.create({ label: 'C', score: 3 })

		// Update B
		await Item.update({ where: { id: b.id }, data: { score: 22 } })

		// Delete A
		await Item.delete({ where: { id: a.id } })

		// Create D
		const d = await Item.create({ label: 'D', score: 4 })

		await simulateRestart()

		const Item2 = FlashcoreSystem.registerModel<Item>('Item', {
			id: f.id(),
			label: f.string(),
			score: f.number()
		})

		// Verify state: B(updated), C, D remain. A is gone.
		const all = await Item2.findMany()
		expect(all.length).toBe(3)

		const count = await Item2.count()
		expect(count).toBe(3)

		const labels = all.map((r) => r.label).sort()
		expect(labels).toEqual(['B', 'C', 'D'])

		// Verify B was updated
		const foundB = await Item2.findUnique({ where: { id: b.id } })
		expect(foundB).not.toBeNull()
		expect(foundB!.score).toBe(22)

		// Verify A is gone
		const foundA = await Item2.findUnique({ where: { id: a.id } })
		expect(foundA).toBeNull()

		// Verify D exists
		const foundD = await Item2.findUnique({ where: { id: d.id } })
		expect(foundD).not.toBeNull()
		expect(foundD!.label).toBe('D')
		expect(foundD!.score).toBe(4)
	})
})
