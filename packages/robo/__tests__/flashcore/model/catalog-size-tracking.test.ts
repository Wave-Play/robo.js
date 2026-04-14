/**
 * Catalog Size Tracking Tests (Bug 9)
 *
 * Verifies that removeEntryStats correctly decrements chunk size
 * using the stored estimatedSize on each CatalogEntry.
 */

import { Catalog } from '../../../src/flashcore/model/catalog.js'

describe('Catalog Size Tracking (Bug 9)', () => {
	test('removeEntry decrements chunk size', () => {
		const catalog = Catalog.empty()

		catalog.addEntry('a', 0, 100)
		catalog.addEntry('b', 0, 200)
		catalog.addEntry('c', 0, 300)

		expect(catalog.getChunkSize(0)).toBe(600)
		expect(catalog.getChunkCount(0)).toBe(3)

		// Remove middle entry
		catalog.removeEntry('b')

		expect(catalog.getChunkSize(0)).toBe(400)
		expect(catalog.getChunkCount(0)).toBe(2)
	})

	test('size accurate after add+remove cycles', () => {
		const catalog = Catalog.empty()

		// Add 5 entries
		catalog.addEntry('a', 0, 100)
		catalog.addEntry('b', 0, 150)
		catalog.addEntry('c', 0, 200)
		catalog.addEntry('d', 0, 250)
		catalog.addEntry('e', 0, 300)
		expect(catalog.getChunkSize(0)).toBe(1000)

		// Remove 3 entries
		catalog.removeEntry('a')
		catalog.removeEntry('c')
		catalog.removeEntry('e')

		// Remaining: b(150) + d(250) = 400
		expect(catalog.getChunkSize(0)).toBe(400)

		// Add 2 new entries
		catalog.addEntry('f', 0, 50)
		catalog.addEntry('g', 0, 75)

		// Total: 400 + 50 + 75 = 525
		expect(catalog.getChunkSize(0)).toBe(525)
		expect(catalog.getChunkCount(0)).toBe(4)
	})

	test('replacing a record adjusts size correctly', () => {
		const catalog = Catalog.empty()

		catalog.addEntry('a', 0, 100)
		expect(catalog.getChunkSize(0)).toBe(100)

		// Re-add same ID with different size (addEntry removes old entry first)
		catalog.addEntry('a', 0, 200)
		expect(catalog.getChunkSize(0)).toBe(200)
		expect(catalog.getChunkCount(0)).toBe(1)
	})

	test('size does not grow monotonically on add+remove churn', () => {
		const catalog = Catalog.empty()

		for (let i = 0; i < 100; i++) {
			catalog.addEntry(`record-${i}`, 0, 500)
			catalog.removeEntry(`record-${i}`)
		}

		expect(catalog.getChunkSize(0)).toBe(0)
		expect(catalog.getChunkCount(0)).toBe(0)
	})

	test('removeEntry with no estimatedSize does not decrement size', () => {
		// Simulate a v1 catalog without estimatedSize by deserializing old format
		const catalog = Catalog.deserialize({
			version: 1,
			entries: [
				{ id: 'old-1', kind: 'chunk', chunkId: 0 },
				{ id: 'old-2', kind: 'chunk', chunkId: 0 }
			],
			chunkStats: [{ chunkId: 0, count: 2, size: 500 }],
			count: 2
		})

		// Entries from v1 have no estimatedSize
		expect(catalog.getChunkSize(0)).toBe(500)

		// Remove an entry — size should NOT change since estimatedSize is undefined
		catalog.removeEntry('old-1')
		expect(catalog.getChunkSize(0)).toBe(500)
		expect(catalog.getChunkCount(0)).toBe(1)
	})

	test('serialize and deserialize preserves estimatedSize', () => {
		const catalog = Catalog.empty()

		catalog.addEntry('a', 0, 100)
		catalog.addEntry('b', 0, 200)
		catalog.addEntry('c', 1, 300)

		// Round-trip
		const serialized = catalog.serialize()
		const restored = Catalog.deserialize(serialized)

		// Verify sizes match after round-trip
		expect(restored.getChunkSize(0)).toBe(300)
		expect(restored.getChunkSize(1)).toBe(300)

		// Remove entries and verify size decrements work after deserialization
		restored.removeEntry('a')
		expect(restored.getChunkSize(0)).toBe(200)

		restored.removeEntry('c')
		expect(restored.getChunkSize(1)).toBe(0)
	})
})
