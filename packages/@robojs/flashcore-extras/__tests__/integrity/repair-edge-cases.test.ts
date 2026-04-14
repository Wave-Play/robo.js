/**
 * Phase 6: Repair Engine Edge Cases
 *
 * Tests filter repair, sorted index repair, dry-run mode, quickCheck,
 * orphaned unique key cleanup, rebuildAll, and namespaced models.
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { IntegrityChecker } from '../../src/integrity/check.js'
import { RepairEngine } from '../../src/integrity/repair.js'
import {
	MemoryAdapter,
	CuckooFilter,
	SortedIndex,
	Catalog,
	ChunkManager,
	buildModelKey,
	buildUniqueKey,
	encodeUniqueValue
} from 'robo.js/flashcore'

describe('RepairEngine edge cases', () => {
	let adapter: MemoryAdapter
	let checker: IntegrityChecker
	let engine: RepairEngine

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		checker = new IntegrityChecker(adapter)
		engine = new RepairEngine(adapter)
	})

	// ── Helper: create a catalog with records stored in chunks ─────

	function seedModel(
		modelName: string,
		records: Record<string, Record<string, unknown>>[],
		namespace?: string
	): Catalog {
		const catalog = Catalog.empty()
		records.forEach((chunk, chunkIndex) => {
			const chunkKey = buildModelKey(modelName, `chunk:${chunkIndex}`, namespace)
			adapter.set(chunkKey, chunk)
			let chunkSize = 0
			for (const [id, record] of Object.entries(chunk)) {
				const size = JSON.stringify(record).length * 2 + 100
				catalog.addEntry(id, chunkIndex, size)
				chunkSize += size
			}
			catalog.setChunkSize(chunkIndex, chunkSize)
		})
		return catalog
	}

	// ── Repair filter from corrupted state ────────────────────────

	it('should rebuild a filter that is missing entries', async () => {
		const catalog = seedModel('User', [
			{ id1: { name: 'Alice' }, id2: { name: 'Bob' } },
			{ id3: { name: 'Charlie' } }
		])

		// Create an incomplete filter (missing id2)
		const brokenFilter = new CuckooFilter()
		brokenFilter.add('id1')
		brokenFilter.add('id3')

		// Check detects missing entry
		const checkResult = await checker.checkFilter(catalog, brokenFilter)
		expect(checkResult.isValid).toBe(false)
		expect(checkResult.missingInFilter).toContain('id2')

		// Repair rebuilds the filter
		const repairResult = await engine.repairFilter(catalog)
		expect(repairResult.success).toBe(true)
		expect(repairResult.repaired).toBe(3)

		// The new filter (attached to result) should contain all IDs
		const newFilter = (repairResult as any).filter as CuckooFilter
		expect(newFilter.mightContain('id1')).toBe(true)
		expect(newFilter.mightContain('id2')).toBe(true)
		expect(newFilter.mightContain('id3')).toBe(true)
	})

	// ── Repair sorted index ───────────────────────────────────────

	it('should rebuild a sorted index from chunk data', async () => {
		const catalog = seedModel('Score', [
			{ r1: { score: 100, name: 'A' }, r2: { score: 50, name: 'B' } },
			{ r3: { score: 200, name: 'C' } }
		])

		const chunkManager = new ChunkManager({ adapter, modelName: 'Score', maxChunkSize: 10000 })

		// Create a broken index that is missing r2
		const brokenIndex = new SortedIndex('score')
		brokenIndex.insert(100, 'r1')
		brokenIndex.insert(200, 'r3')
		// r2 missing

		// Check detects orphaned/missing entries
		const indexResult = await checker.checkSortedIndex('Score', catalog, 'score', brokenIndex)
		// The index itself is valid for what it has; missing entries are flagged separately
		expect(indexResult.entriesChecked).toBeGreaterThanOrEqual(2)

		// Repair rebuilds from chunks
		const repairResult = await engine.repairSortedIndex('Score', catalog, chunkManager, 'score')
		expect(repairResult.success).toBe(true)
		expect(repairResult.repaired).toBe(3) // all 3 records

		const newIndex = (repairResult as any).index as SortedIndex
		const allIds = newIndex.getAll()
		expect(allIds).toContain('r1')
		expect(allIds).toContain('r2')
		expect(allIds).toContain('r3')
	})

	// ── Dry-run mode ──────────────────────────────────────────────

	it('should report what would be repaired without changing data in dryRun', async () => {
		const catalog = seedModel('Task', [
			{ t1: { priority: 1 }, t2: { priority: 2 } }
		])

		const filterResult = await engine.repairFilter(catalog, true)
		expect(filterResult.success).toBe(true)
		expect(filterResult.repaired).toBe(2) // would repair 2 entries

		// No actual filter was created (dryRun)
		expect((filterResult as any).filter).toBeUndefined()
	})

	// ── quickCheck on healthy data ────────────────────────────────

	it('should return healthy when filter matches catalog', async () => {
		const catalog = Catalog.empty()
		catalog.addEntry('a', 0, 100)
		catalog.addEntry('b', 0, 100)
		catalog.addEntry('c', 1, 100)

		const filter = CuckooFilter.fromIds(['a', 'b', 'c'])

		const result = await checker.quickCheck('Healthy', catalog, filter)
		expect(result.healthy).toBe(true)
		expect(result.issues).toHaveLength(0)
	})

	it('should detect issues in quickCheck when filter is missing entries', async () => {
		const catalog = Catalog.empty()
		catalog.addEntry('a', 0, 100)
		catalog.addEntry('b', 0, 100)

		const filter = new CuckooFilter()
		filter.add('a')
		// 'b' missing

		const result = await checker.quickCheck('Broken', catalog, filter)
		expect(result.healthy).toBe(false)
		expect(result.issues.length).toBeGreaterThan(0)
	})

	// ── Orphaned unique key cleanup ───────────────────────────────

	it('should clean orphaned unique keys during repair', async () => {
		const modelName = 'User'

		// Create a catalog with one record
		const catalog = Catalog.empty()
		catalog.addEntry('u1', 0, 100)
		adapter.set(buildModelKey(modelName, 'catalog'), catalog.serialize())

		// Create unique key entries (simulating unique email index)
		const uxKey1 = buildModelKey(modelName, `ux:email:${encodeUniqueValue('alice@example.com')}`)
		const uxKey2 = buildModelKey(modelName, `ux:email:${encodeUniqueValue('orphan@example.com')}`)

		adapter.set(uxKey1, 'u1')     // Valid: points to existing record
		adapter.set(uxKey2, 'u999')   // Orphaned: u999 not in catalog

		const integrityResult = {
			isValid: false,
			orphanedKeys: [uxKey2],
			duplicates: [],
			keysChecked: 2
		}

		const repairResult = await engine.repairUniqueIndex(modelName, integrityResult)
		expect(repairResult.repaired).toBe(1)
		expect(adapter.has(uxKey2)).toBe(false) // orphan removed
		expect(adapter.has(uxKey1)).toBe(true)  // valid key preserved
	})

	// ── Integrity check: missing filter entries ───────────────────

	it('should find missing filter entries for known catalog records', async () => {
		const catalog = Catalog.empty()
		catalog.addEntry('x1', 0, 100)
		catalog.addEntry('x2', 0, 100)
		catalog.addEntry('x3', 1, 100)

		// Filter only has x1
		const filter = new CuckooFilter()
		filter.add('x1')

		const result = await checker.checkFilter(catalog, filter)
		expect(result.isValid).toBe(false)
		expect(result.missingInFilter).toContain('x2')
		expect(result.missingInFilter).toContain('x3')
		expect(result.recordsChecked).toBe(3)
	})

	// ── rebuildAll ────────────────────────────────────────────────

	it('should rebuild filter and sorted indexes from authoritative data', async () => {
		const catalog = seedModel('Item', [
			{ i1: { price: 10, name: 'Pen' }, i2: { price: 25, name: 'Book' } },
			{ i3: { price: 5, name: 'Eraser' } }
		])

		const chunkManager = new ChunkManager({ adapter, modelName: 'Item', maxChunkSize: 10000 })

		const result = await engine.rebuildAll('Item', catalog, chunkManager, ['price'])
		expect(result.durationMs).toBeGreaterThanOrEqual(0)

		// Filter should contain all IDs
		expect(result.filter.mightContain('i1')).toBe(true)
		expect(result.filter.mightContain('i2')).toBe(true)
		expect(result.filter.mightContain('i3')).toBe(true)

		// Sorted index for 'price' should exist and contain all records
		const priceIndex = result.sortedIndexes.get('price')
		expect(priceIndex).toBeDefined()
		const allIds = priceIndex!.getAll()
		expect(allIds).toContain('i1')
		expect(allIds).toContain('i2')
		expect(allIds).toContain('i3')
	})

	// ── Namespaced model ──────────────────────────────────────────

	it('should work with namespaced models for sorted index repair', async () => {
		const ns = 'tenant-a'
		const catalog = seedModel('Order', [
			{ o1: { total: 100 }, o2: { total: 200 } }
		], ns)

		const chunkManager = new ChunkManager({ adapter, modelName: 'Order', namespace: ns, maxChunkSize: 10000 })

		const repairResult = await engine.repairSortedIndex('Order', catalog, chunkManager, 'total', ns)
		expect(repairResult.success).toBe(true)
		expect(repairResult.repaired).toBe(2)

		const newIndex = (repairResult as any).index as SortedIndex
		expect(newIndex.getAll()).toContain('o1')
		expect(newIndex.getAll()).toContain('o2')
	})

	// ── repairFromReport: filter + sorted ─────────────────────────

	it('should repair filter and sorted indexes from an integrity report', async () => {
		const catalog = seedModel('Report', [
			{ r1: { age: 20 }, r2: { age: 30 } }
		])

		const chunkManager = new ChunkManager({ adapter, modelName: 'Report', maxChunkSize: 10000 })

		// Build a report where filter and sorted index are invalid
		const filter = new CuckooFilter()
		filter.add('r1')
		// r2 missing from filter

		const sortedIndex = new SortedIndex('age')
		sortedIndex.insert(20, 'r1')
		// r2 missing from sorted index

		const report = await checker.checkAll('Report', catalog, {
			filter,
			sortedIndexes: new Map([['age', sortedIndex]])
		})

		expect(report.isValid).toBe(false)

		const fullRepair = await engine.repairFromReport('Report', catalog, chunkManager, report)
		expect(fullRepair.durationMs).toBeGreaterThanOrEqual(0)

		// Filter should have been repaired
		expect(fullRepair.filter).toBeDefined()
		expect(fullRepair.filter!.repaired).toBe(2)
	})
})
