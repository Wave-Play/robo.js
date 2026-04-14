/**
 * Phase 8: Chunk Packing Stress Tests
 *
 * Validates chunk management behavior under load:
 * - No chunk exceeds the records-per-chunk limit
 * - Large records trigger segmentation
 * - Small records pack into the same chunk
 * - Records distribute across chunks when capacity is reached
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f,
	DEFAULT_MAX_RECORDS_PER_CHUNK,
	buildModelKey
} from '../helpers/flashcore-compat.js'

describe('Chunk Packing', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await FlashcoreSystem._reset()
		await Flashcore.$.init({ adapter })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should not exceed DEFAULT_MAX_RECORDS_PER_CHUNK per chunk', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
			id: f.id(),
			name: f.string()
		})

		// Create 100 small records (more than one chunk's worth)
		for (let i = 0; i < 100; i++) {
			await User.create({ name: `User ${i}` })
		}

		// Inspect chunks directly via the adapter
		// Chunk keys follow the pattern: _model:User:chunk:{n}
		let chunkId = 0
		let totalRecords = 0

		while (true) {
			const chunkKey = buildModelKey('User', `chunk:${chunkId}`)
			const chunkData = adapter.get(chunkKey)

			if (chunkData === undefined) break

			const recordCount = Object.keys(chunkData as Record<string, unknown>).length
			expect(recordCount).toBeLessThanOrEqual(DEFAULT_MAX_RECORDS_PER_CHUNK)
			totalRecords += recordCount
			chunkId++
		}

		expect(totalRecords).toBe(100)
		// Should have at least 2 chunks (100 / 50 = 2)
		expect(chunkId).toBeGreaterThanOrEqual(2)
	})

	it('should segment large records', async () => {
		const LargeModel = FlashcoreSystem.registerModel<{ id: string; data: any }>('LargeModel', {
			id: f.id(),
			data: f.json()
		})

		// Create a record with a large JSON field (> 100KB)
		const largeData = 'x'.repeat(150_000)
		const created = await LargeModel.create({ data: largeData })

		// Check the catalog to verify it's segmented
		const catalogKey = buildModelKey('LargeModel', 'catalog')
		const catalog = adapter.get(catalogKey) as any

		expect(catalog).toBeDefined()

		// Find the catalog entry for the created record
		const entry = catalog.entries.find((e: any) => e.id === created.id)
		expect(entry).toBeDefined()
		expect(entry.kind).toBe('segments')
		expect(entry.segmentIds).toBeDefined()
		expect(entry.segmentIds.length).toBeGreaterThan(0)
	})

	it('should pack multiple small records into the same chunk', async () => {
		const SmallItem = FlashcoreSystem.registerModel<{ id: string; label: string }>('SmallItem', {
			id: f.id(),
			label: f.string()
		})

		// Create 10 small records
		for (let i = 0; i < 10; i++) {
			await SmallItem.create({ label: `item-${i}` })
		}

		// All 10 should fit in chunk 0
		const chunkKey = buildModelKey('SmallItem', 'chunk:0')
		const chunkData = adapter.get(chunkKey) as Record<string, unknown>

		expect(chunkData).toBeDefined()
		expect(Object.keys(chunkData).length).toBe(10)

		// Chunk 1 should not exist
		const chunk1Key = buildModelKey('SmallItem', 'chunk:1')
		expect(adapter.get(chunk1Key)).toBeUndefined()
	})

	it('should distribute records across chunks when capacity is reached', async () => {
		const Distributed = FlashcoreSystem.registerModel<{ id: string; value: number }>('Distributed', {
			id: f.id(),
			value: f.number()
		})

		// Create 60 records (should require at least 2 chunks at 50 per chunk)
		for (let i = 0; i < 60; i++) {
			await Distributed.create({ value: i })
		}

		// Count chunks
		const chunks: number[] = []
		let chunkId = 0

		while (true) {
			const chunkKey = buildModelKey('Distributed', `chunk:${chunkId}`)
			const chunkData = adapter.get(chunkKey)

			if (chunkData === undefined) break

			const recordCount = Object.keys(chunkData as Record<string, unknown>).length
			chunks.push(recordCount)
			chunkId++
		}

		// At least 2 chunks must exist
		expect(chunks.length).toBeGreaterThanOrEqual(2)

		// Total records across all chunks should be 60
		const total = chunks.reduce((sum, count) => sum + count, 0)
		expect(total).toBe(60)
	})
})
