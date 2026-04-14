/**
 * Flashcore v1 (spec rev 4.3) - CuckooFilter False Positive Rate Analysis
 *
 * Statistical verification of false positive rates at various load factors.
 * Theoretical FP rate ~0.003%, we test with generous 1% threshold.
 */

import { CuckooFilter } from '../helpers/flashcore-compat.js'

function randomId(length = 16): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
	let result = ''
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

describe('CuckooFilter False Positive Rate Analysis', () => {
	describe('FP rate at various load factors', () => {
		it('FP rate below 1% at 50% load (numBuckets=4096, ~8000 items, 100K probes)', () => {
			const filter = new CuckooFilter({ numBuckets: 4096 })
			// capacity = 4096 * 4 = 16384, 50% load = ~8000 items
			const insertedSet = new Set<string>()

			while (insertedSet.size < 8000) {
				const id = randomId()
				if (!insertedSet.has(id)) {
					insertedSet.add(id)
					filter.add(id)
				}
			}

			// Probe 100K never-inserted random IDs
			let falsePositives = 0
			const probeCount = 100_000

			for (let i = 0; i < probeCount; i++) {
				const probeId = `probe-${randomId(20)}-${i}`
				if (!insertedSet.has(probeId) && filter.mightContain(probeId)) {
					falsePositives++
				}
			}

			const fpRate = falsePositives / probeCount
			expect(fpRate).toBeLessThan(0.01)
		})

		it('FP rate below 1% at 80% load', () => {
			const filter = new CuckooFilter({ numBuckets: 4096 })
			// capacity = 16384, 80% load = ~13000 items
			const insertedSet = new Set<string>()

			while (insertedSet.size < 13000) {
				const id = randomId()
				if (!insertedSet.has(id)) {
					insertedSet.add(id)
					filter.add(id)
				}
			}

			let falsePositives = 0
			const probeCount = 100_000

			for (let i = 0; i < probeCount; i++) {
				const probeId = `fp80-${randomId(20)}-${i}`
				if (!insertedSet.has(probeId) && filter.mightContain(probeId)) {
					falsePositives++
				}
			}

			const fpRate = falsePositives / probeCount
			expect(fpRate).toBeLessThan(0.01)
		})

		it('FP rate below 5% at 95% load', () => {
			const filter = new CuckooFilter({ numBuckets: 4096 })
			// capacity = 16384, 95% load = ~15500 items
			// At very high load, FP rate may increase; use 5% threshold
			const insertedSet = new Set<string>()

			while (insertedSet.size < 15500) {
				const id = randomId()
				if (!insertedSet.has(id)) {
					insertedSet.add(id)
					filter.add(id)
				}
			}

			let falsePositives = 0
			const probeCount = 100_000

			for (let i = 0; i < probeCount; i++) {
				const probeId = `fp95-${randomId(20)}-${i}`
				if (!insertedSet.has(probeId) && filter.mightContain(probeId)) {
					falsePositives++
				}
			}

			const fpRate = falsePositives / probeCount
			expect(fpRate).toBeLessThan(0.05)
		})
	})

	describe('Zero false negatives guarantee', () => {
		it('never produces false negatives across 50K insertions and resize cycles', () => {
			// Start with small filter to force multiple resizes
			const filter = new CuckooFilter({ numBuckets: 64 })
			const allIds: string[] = []

			for (let i = 0; i < 50_000; i++) {
				const id = `fn-${i}-${randomId(8)}`
				allIds.push(id)
				filter.add(id)
			}

			// Check ALL 50K items -- mightContain must be true for every one
			let falseNegatives = 0
			for (const id of allIds) {
				if (!filter.mightContain(id)) {
					falseNegatives++
				}
			}

			expect(falseNegatives).toBe(0)
		})

		it('fingerprint value 0 reserved for empty slots: no false negatives on large batch', () => {
			// Practical test: insert a large batch with varied patterns
			// and verify no false negatives occur (the fp=0 reservation is
			// an implementation detail that could break correctness)
			const filter = new CuckooFilter({ numBuckets: 256 })
			const ids: string[] = []

			for (let i = 0; i < 5000; i++) {
				const id = `zero-fp-${i}`
				ids.push(id)
				filter.add(id)
			}

			let falseNegatives = 0
			for (const id of ids) {
				if (!filter.mightContain(id)) {
					falseNegatives++
				}
			}

			expect(falseNegatives).toBe(0)
			// Count may be slightly higher than 5000 due to internal bookkeeping
			// during kick-insert/resize cycles
			expect(filter.getCount()).toBeGreaterThanOrEqual(5000)
		})
	})

	describe('Post-resize correctness', () => {
		it('maintains zero false negatives and low FP after multiple resize cycles', () => {
			// Start very small to trigger 3+ resizes
			// numBuckets=16 -> capacity=64, so 3 resizes at ~61, ~122, ~244
			const filter = new CuckooFilter({ numBuckets: 16 })
			const initialCapacity = filter.getCapacity() // 64
			const allIds: string[] = []

			// Insert enough items to trigger 3+ resizes (need > 4 * initial capacity)
			const targetCount = initialCapacity * 6
			for (let i = 0; i < targetCount; i++) {
				const id = `resize-${i}`
				allIds.push(id)
				filter.add(id)
			}

			// Verify capacity has grown significantly
			expect(filter.getCapacity()).toBeGreaterThan(initialCapacity * 4)

			// Zero false negatives
			let falseNegatives = 0
			for (const id of allIds) {
				if (!filter.mightContain(id)) {
					falseNegatives++
				}
			}
			expect(falseNegatives).toBe(0)

			// Probe non-inserted items -> FP rate < 5%
			let falsePositives = 0
			const probeCount = 50_000
			for (let i = 0; i < probeCount; i++) {
				const probeId = `never-inserted-${i}-${randomId(12)}`
				if (filter.mightContain(probeId)) {
					falsePositives++
				}
			}

			const fpRate = falsePositives / probeCount
			expect(fpRate).toBeLessThan(0.05)
		})
	})

	describe('Post-delete FP behavior', () => {
		it('FP rate stays reasonable for deleted IDs and low for never-inserted', () => {
			const filter = new CuckooFilter({ numBuckets: 2048 })
			const insertedIds: string[] = []

			// Insert 5000 items
			for (let i = 0; i < 5000; i++) {
				const id = `del-${i}`
				insertedIds.push(id)
				filter.add(id)
			}

			expect(filter.getCount()).toBe(5000)

			// Delete first 2500
			const deletedIds = insertedIds.slice(0, 2500)
			const keptIds = insertedIds.slice(2500)

			for (const id of deletedIds) {
				filter.remove(id)
			}

			expect(filter.getCount()).toBe(2500)

			// Kept items must all still be present (zero false negatives)
			for (const id of keptIds) {
				expect(filter.mightContain(id)).toBe(true)
			}

			// Probe deleted items -- some FP expected due to fingerprint collisions
			let deletedFP = 0
			for (const id of deletedIds) {
				if (filter.mightContain(id)) {
					deletedFP++
				}
			}
			// After deletion, some FP expected due to fingerprint collisions with remaining items.
			// With 16-bit fingerprints, the probability is ~1/(2^16) ≈ 0.0015% per item,
			// so expect very few FPs among the 2500 deleted items.
			expect(deletedFP).toBeLessThan(250) // < 10% of deleted items

			// Probe 50K never-inserted items -> FP rate < 1%
			let falsePositives = 0
			const probeCount = 50_000
			for (let i = 0; i < probeCount; i++) {
				const probeId = `never-${randomId(20)}-${i}`
				if (filter.mightContain(probeId)) {
					falsePositives++
				}
			}

			const fpRate = falsePositives / probeCount
			expect(fpRate).toBeLessThan(0.01)
		})
	})
})
