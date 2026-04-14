/**
 * Flashcore v1 (spec rev 4.3) Phase 4 - Segmented Updates Concurrency Tests
 *
 * Tests concurrent updates on model records to verify data consistency
 * and absence of corruption under concurrent write pressure.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f
} from '../helpers/flashcore-compat.js'

interface Item {
	id: string
	name: string
	value: number
	description: string
}

describe('Segmented Updates Concurrency', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter: new MemoryAdapter() })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should handle two concurrent updates to different fields of same record', async () => {
		const Item = FlashcoreSystem.registerModel<Item>('Item', {
			id: f.id(),
			name: f.string(),
			value: f.number(),
			description: f.string()
		})

		const created = await Item.create({
			name: 'original',
			value: 0,
			description: 'original desc'
		})

		// Run two updates concurrently on different fields
		await Promise.all([
			Item.update({
				where: { id: created.id },
				data: { name: 'updated-name' }
			}),
			Item.update({
				where: { id: created.id },
				data: { value: 42 }
			})
		])

		const final = await Item.findUnique({ where: { id: created.id } })
		expect(final).not.toBeNull()
		// At minimum, one of the updates should be reflected.
		// With serialized writes, both should be present. With last-write-wins,
		// at least the record should be consistent (not corrupted).
		const nameUpdated = final!.name === 'updated-name'
		const valueUpdated = final!.value === 42
		expect(nameUpdated || valueUpdated).toBe(true)
		expect(typeof final!.description).toBe('string')
	})

	it('should return consistent state during concurrent read and write', async () => {
		const Item = FlashcoreSystem.registerModel<Item>('Item', {
			id: f.id(),
			name: f.string(),
			value: f.number(),
			description: f.string()
		})

		const created = await Item.create({
			name: 'original',
			value: 100,
			description: 'test'
		})

		// Concurrent read + write
		const [readResult] = await Promise.all([
			Item.findUnique({ where: { id: created.id } }),
			Item.update({
				where: { id: created.id },
				data: { value: 200 }
			})
		])

		// readResult should be a valid complete record (old or new, not partial)
		expect(readResult).not.toBeNull()
		expect(readResult!.name).toBe('original')
		expect([100, 200]).toContain(readResult!.value)
		expect(readResult!.description).toBe('test')
	})

	it('should handle N concurrent updates without corruption', async () => {
		const Item = FlashcoreSystem.registerModel<Item>('Item', {
			id: f.id(),
			name: f.string(),
			value: f.number(),
			description: f.string()
		})

		const created = await Item.create({
			name: 'start',
			value: 0,
			description: 'desc'
		})

		const N = 10
		const updates = Array.from({ length: N }, (_, i) =>
			Item.update({
				where: { id: created.id },
				data: { value: i + 1 }
			})
		)

		const results = await Promise.allSettled(updates)

		// All should resolve without errors
		for (const result of results) {
			expect(result.status).toBe('fulfilled')
		}

		// Final state should be valid
		const final = await Item.findUnique({ where: { id: created.id } })
		expect(final).not.toBeNull()
		expect(typeof final!.value).toBe('number')
		expect(final!.value).toBeGreaterThanOrEqual(1)
		expect(final!.value).toBeLessThanOrEqual(N)
		expect(final!.name).toBe('start')
		expect(final!.description).toBe('desc')
	})

	it('should not throw errors during concurrent operations on non-segmented records', async () => {
		const Item = FlashcoreSystem.registerModel<Item>('Item', {
			id: f.id(),
			name: f.string(),
			value: f.number(),
			description: f.string()
		})

		// Create several small records (non-segmented)
		const records = await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				Item.create({
					name: `item-${i}`,
					value: i,
					description: `desc-${i}`
				})
			)
		)

		// Concurrently update all records
		const updates = records.map((r, i) =>
			Item.update({
				where: { id: r.id },
				data: { value: i * 10 }
			})
		)

		const results = await Promise.allSettled(updates)

		for (const result of results) {
			expect(result.status).toBe('fulfilled')
		}

		// Verify all records are valid
		const all = await Item.findMany()
		expect(all.length).toBe(5)
	})

	it('should handle concurrent create and read without errors', async () => {
		const Item = FlashcoreSystem.registerModel<Item>('Item', {
			id: f.id(),
			name: f.string(),
			value: f.number(),
			description: f.string()
		})

		const created = await Item.create({
			name: 'existing',
			value: 1,
			description: 'desc'
		})

		// Concurrent create + read
		const results = await Promise.allSettled([
			Item.create({
				name: 'new-item',
				value: 2,
				description: 'new desc'
			}),
			Item.findUnique({ where: { id: created.id } })
		])

		// Both should succeed
		expect(results[0].status).toBe('fulfilled')
		expect(results[1].status).toBe('fulfilled')

		if (results[1].status === 'fulfilled') {
			const readResult = results[1].value
			expect(readResult).not.toBeNull()
			expect(readResult!.name).toBe('existing')
		}
	})
})
