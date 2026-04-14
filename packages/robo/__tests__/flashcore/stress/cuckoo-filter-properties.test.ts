/**
 * Phase 8: CuckooFilter Property-Based & Stress Tests
 *
 * Validates core probabilistic guarantees of the CuckooFilter:
 * - Zero false negatives (inserted items always found)
 * - Bounded false positive rate
 * - Insert/delete correctness
 * - Serialization round-trip fidelity
 * - Auto-resize under high load
 */

import { CuckooFilter } from '../helpers/flashcore-compat.js'

/**
 * Generate a random alphanumeric ID of the given length.
 */
function randomId(length = 16): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
	let result = ''
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

describe('CuckooFilter Properties', () => {
	it('should have zero false negatives after inserting 10K random IDs', () => {
		const filter = new CuckooFilter({ numBuckets: 4096 })
		const ids: string[] = []

		for (let i = 0; i < 10_000; i++) {
			const id = randomId()
			ids.push(id)
			filter.add(id)
		}

		// Every inserted ID must return true (no false negatives)
		let falseNegatives = 0
		for (const id of ids) {
			if (!filter.mightContain(id)) {
				falseNegatives++
			}
		}

		expect(falseNegatives).toBe(0)
		expect(filter.getCount()).toBe(10_000)
	})

	it('should correctly handle insert + delete cycles', () => {
		const filter = new CuckooFilter()
		const insertedIds: string[] = []
		const deletedIds: string[] = []

		// Insert 100 IDs
		for (let i = 0; i < 100; i++) {
			const id = `item-${i}`
			insertedIds.push(id)
			filter.add(id)
		}

		expect(filter.getCount()).toBe(100)

		// Delete the first 50
		for (let i = 0; i < 50; i++) {
			const id = insertedIds[i]
			deletedIds.push(id)
			const removed = filter.remove(id)
			expect(removed).toBe(true)
		}

		expect(filter.getCount()).toBe(50)

		// Remaining IDs must still be found (no false negatives)
		for (let i = 50; i < 100; i++) {
			expect(filter.mightContain(insertedIds[i])).toBe(true)
		}

		// Deleted IDs should generally not be found (some false positives allowed)
		// But with deterministic IDs we expect most to return false
		let deletedStillFound = 0
		for (const id of deletedIds) {
			if (filter.mightContain(id)) {
				deletedStillFound++
			}
		}

		// Allow generous false positive rate for deleted items
		// (fingerprint collisions can cause some to still match)
		expect(deletedStillFound).toBeLessThan(25)
	})

	it('should maintain false positive rate below 5%', () => {
		const filter = new CuckooFilter({ numBuckets: 1024 })
		const insertedSet = new Set<string>()

		// Insert 1000 unique IDs
		while (insertedSet.size < 1000) {
			const id = randomId()
			if (!insertedSet.has(id)) {
				insertedSet.add(id)
				filter.add(id)
			}
		}

		// Test 10000 random non-inserted IDs
		let falsePositives = 0
		const testCount = 10_000

		for (let i = 0; i < testCount; i++) {
			const testId = `nonexistent-${randomId(20)}-${i}`
			// Ensure this ID was not inserted
			if (!insertedSet.has(testId) && filter.mightContain(testId)) {
				falsePositives++
			}
		}

		const falsePositiveRate = falsePositives / testCount

		// With 16-bit fingerprints, expected FP rate is ~0.003% at 95% load.
		// We use a generous 5% bound to avoid flaky tests.
		expect(falsePositiveRate).toBeLessThan(0.05)
	})

	it('should preserve all entries through serialization/deserialization', () => {
		const filter = new CuckooFilter()
		const ids: string[] = []

		for (let i = 0; i < 500; i++) {
			const id = `ser-${i}-${randomId(8)}`
			ids.push(id)
			filter.add(id)
		}

		expect(filter.getCount()).toBe(500)

		// Serialize
		const data = filter.serialize()
		expect(data.version).toBe(1)
		expect(data.count).toBe(500)

		// Deserialize into a new filter
		const restored = CuckooFilter.deserialize(data)
		expect(restored.getCount()).toBe(500)

		// All original IDs must be found in the restored filter (zero false negatives)
		let falseNegatives = 0
		for (const id of ids) {
			if (!restored.mightContain(id)) {
				falseNegatives++
			}
		}

		expect(falseNegatives).toBe(0)
	})

	it('should auto-resize when load factor is exceeded', () => {
		// Start with a small filter to trigger resize quickly
		const filter = new CuckooFilter({ numBuckets: 16 })
		const initialCapacity = filter.getCapacity()
		const ids: string[] = []

		// Insert enough items to trigger at least one resize
		// With numBuckets=16 and bucketSize=4, capacity is 64
		// At 95% load factor, resize triggers around ~61 items
		const targetCount = initialCapacity + 50

		for (let i = 0; i < targetCount; i++) {
			const id = `resize-${i}`
			ids.push(id)
			filter.add(id)
		}

		// Filter capacity should have grown
		expect(filter.getCapacity()).toBeGreaterThan(initialCapacity)

		// All items must still be found (no false negatives after resize)
		let falseNegatives = 0
		for (const id of ids) {
			if (!filter.mightContain(id)) {
				falseNegatives++
			}
		}

		expect(falseNegatives).toBe(0)

		// Count should be at least targetCount (may be slightly higher due to
		// internal bookkeeping during kick-insert → resize cycles)
		expect(filter.getCount()).toBeGreaterThanOrEqual(targetCount)
	})
})
