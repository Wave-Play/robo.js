/**
 * Integration: Integrity Check -> Repair -> Verify Cycle
 *
 * Verifies the full integrity check -> repair -> verify cycle on data
 * with real corruption. Uses the FlashcoreSystem API with extensions
 * registered to exercise the complete pipeline.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	f,
	buildModelKey,
	buildUniqueKey,
	encodeUniqueValue,
	CuckooFilter,
	SortedIndex
} from 'robo.js/flashcore'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('Integrity Repair Cycle', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
		registerAllExtensions()
		await Flashcore.$.init({ adapter })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	// ========================================================================
	// CuckooFilter corruption
	// ========================================================================

	describe('CuckooFilter corruption', () => {
		it('detects missing filter entries and repairs', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('FilterUser', {
				id: f.id(),
				name: f.string()
			})

			// Create 10 records to populate the filter
			const created: Array<{ id: string; name: string }> = []
			for (let i = 0; i < 10; i++) {
				created.push(await User.create({ name: `User ${i}` }))
			}

			// Verify all records exist
			expect(await User.count()).toBe(10)

			// Corrupt the filter by replacing it with an empty one
			const filterKey = buildModelKey('FilterUser', 'filter')
			const emptyFilter = CuckooFilter.empty()
			// Add only some IDs to the filter (simulating partial corruption)
			emptyFilter.add(created[0].id)
			emptyFilter.add(created[1].id)
			await adapter.set(filterKey, emptyFilter.serialize())

			// Force reload of model indexes
			const model = FlashcoreSystem.getModel('FilterUser')!
			model._clearIndexes()

			// Check integrity - should detect corruption
			const report = await Flashcore.$.checkIntegrity()
			expect(report.isValid).toBe(false)
			expect(report.models).toHaveLength(1)
			const modelReport = report.models[0]
			expect(modelReport.isValid).toBe(false)
			expect(modelReport.filter).toBeDefined()
			expect(modelReport.filter!.isValid).toBe(false)
			expect(modelReport.filter!.missingInFilter.length).toBeGreaterThanOrEqual(8)

			// Repair
			const repairResult = await Flashcore.$.repair('FilterUser')
			expect(repairResult.filter).toBeDefined()
			expect(repairResult.filter!.success).toBe(true)
			expect(repairResult.filter!.repaired).toBe(10)

			// Verify clean after repair
			const verifyReport = await Flashcore.$.checkIntegrity()
			expect(verifyReport.isValid).toBe(true)

			// Verify records are still findable
			for (const record of created) {
				const found = await User.findUnique({ where: { id: record.id } })
				expect(found).not.toBeNull()
				expect(found!.name).toBe(record.name)
			}
		})

		it('handles completely missing filter', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('MissingFilterUser', {
				id: f.id(),
				name: f.string()
			})

			// Create records
			const created: Array<{ id: string }> = []
			for (let i = 0; i < 5; i++) {
				created.push(await User.create({ name: `User ${i}` }))
			}

			// Delete the filter key entirely
			const filterKey = buildModelKey('MissingFilterUser', 'filter')
			await adapter.delete(filterKey)

			// Force reload
			const model = FlashcoreSystem.getModel('MissingFilterUser')!
			model._clearIndexes()

			// Check integrity - should detect the missing filter
			const report = await Flashcore.$.checkIntegrity()
			// When the filter is completely missing, model._getFilter() returns an empty CuckooFilter
			// so all catalog IDs will be missing from the filter
			expect(report.models[0].filter!.isValid).toBe(false)
			expect(report.models[0].filter!.missingInFilter.length).toBe(5)

			// Repair
			const repairResult = await Flashcore.$.repair('MissingFilterUser')
			expect(repairResult.filter).toBeDefined()
			expect(repairResult.filter!.success).toBe(true)

			// Verify clean
			const verifyReport = await Flashcore.$.checkIntegrity()
			expect(verifyReport.isValid).toBe(true)
		})
	})

	// ========================================================================
	// Sorted index corruption
	// ========================================================================

	describe('Sorted index corruption', () => {
		it('detects stale index entries and repairs', async () => {
			const Item = FlashcoreSystem.registerModel<{ id: string; score: number }>('StaleItem', {
				id: f.id(),
				score: f.number().indexed()
			})

			// Create records
			const items: Array<{ id: string; score: number }> = []
			for (let i = 0; i < 5; i++) {
				items.push(await Item.create({ score: (i + 1) * 100 }))
			}

			// Persist the current sorted index to adapter so it survives _clearIndexes()
			const model = FlashcoreSystem.getModel('StaleItem')!
			const sortedIndexes = await model._getSortedIndexes()
			const scoreIndex = sortedIndexes.get('score')!
			const indexKey = buildModelKey('StaleItem', 'idx:score')
			await adapter.set(indexKey, scoreIndex.serialize())

			// Delete 2 records directly from adapter (bypass model, leaving stale index entries)
			const catalogKey = buildModelKey('StaleItem', 'catalog')
			const catalogData = await adapter.get(catalogKey) as any
			const idsToRemove = [items[3].id, items[4].id]

			// Remove records from chunks directly
			for (const entry of catalogData.entries) {
				if (idsToRemove.includes(entry.id)) {
					const chunkKey = buildModelKey('StaleItem', `chunk:${entry.chunkId}`)
					const chunk = await adapter.get(chunkKey) as Record<string, unknown>
					if (chunk) {
						delete chunk[entry.id]
						await adapter.set(chunkKey, chunk)
					}
				}
			}

			// Remove from catalog entries but keep their IDs in the index (stale)
			catalogData.entries = catalogData.entries.filter(
				(e: any) => !idsToRemove.includes(e.id)
			)
			catalogData.count = catalogData.entries.length
			// Recalculate chunk stats
			const chunkCounts = new Map<number, number>()
			for (const entry of catalogData.entries) {
				chunkCounts.set(entry.chunkId, (chunkCounts.get(entry.chunkId) || 0) + 1)
			}
			catalogData.chunkStats = Array.from(chunkCounts.entries()).map(([chunkId, count]) => ({
				chunkId,
				count
			}))
			await adapter.set(catalogKey, catalogData)

			// Force model to reload from corrupted storage
			await Item._reloadCatalog()
			model._clearIndexes()

			// Check integrity - should detect stale entries in sorted index
			const report = await Flashcore.$.verify('StaleItem')
			// The sorted index still has the deleted IDs which aren't in catalog
			const indexReport = report.sortedIndexes.find(r => r.field === 'score')
			expect(indexReport).toBeDefined()
			expect(indexReport!.orphanedInIndex.length).toBe(2)
			expect(indexReport!.isValid).toBe(false)

			// Repair
			const repairResult = await Flashcore.$.repair('StaleItem')
			expect(repairResult.sortedIndexes.size).toBeGreaterThanOrEqual(1)
			const scoreRepair = repairResult.sortedIndexes.get('score')
			expect(scoreRepair).toBeDefined()
			expect(scoreRepair!.success).toBe(true)

			// Verify clean
			const verifyReport = await Flashcore.$.verify('StaleItem')
			expect(verifyReport.isValid).toBe(true)
		})

		it('detects missing index entries and repairs', async () => {
			const Product = FlashcoreSystem.registerModel<{ id: string; price: number }>('MissingIdxProduct', {
				id: f.id(),
				price: f.number().indexed()
			})

			// Create records
			const products: Array<{ id: string; price: number }> = []
			for (let i = 0; i < 5; i++) {
				products.push(await Product.create({ price: (i + 1) * 10 }))
			}

			// Corrupt sorted index by replacing it with an empty one
			const indexKey = buildModelKey('MissingIdxProduct', 'idx:price')
			const emptyIndex = new SortedIndex('price')
			// Only add 2 of 5 entries
			emptyIndex.insert(products[0].price, products[0].id)
			emptyIndex.insert(products[1].price, products[1].id)
			await adapter.set(indexKey, emptyIndex.serialize())

			// Force reload
			const model = FlashcoreSystem.getModel('MissingIdxProduct')!
			model._clearIndexes()

			// Repair using rebuildIndexes (full rebuild)
			await Flashcore.$.rebuildIndexes('MissingIdxProduct')

			// After rebuild, findMany with orderBy should work
			const sorted = await Product.findMany({ orderBy: { price: 'asc' } })
			expect(sorted).toHaveLength(5)
			// Verify ordering
			for (let i = 1; i < sorted.length; i++) {
				expect(sorted[i].price).toBeGreaterThanOrEqual(sorted[i - 1].price)
			}
		})
	})

	// ========================================================================
	// Unique index corruption
	// ========================================================================

	describe('Unique index corruption', () => {
		it('detects orphaned unique keys and cleans up', async () => {
			const Account = FlashcoreSystem.registerModel<{ id: string; email: string }>('UniqueAccount', {
				id: f.id(),
				email: f.string().unique()
			})

			// Create records
			const a1 = await Account.create({ email: 'alice@test.com' })
			const a2 = await Account.create({ email: 'bob@test.com' })

			// Create an orphaned unique key (pointing to a non-existent record)
			const orphanKey = buildUniqueKey('UniqueAccount', 'email', encodeUniqueValue('orphan@test.com'))
			await adapter.set(orphanKey, { id: 'nonexistent-record-id' })

			// Check integrity - unique check should detect the orphan
			const report = await Flashcore.$.verify('UniqueAccount')
			expect(report.uniqueIndex).toBeDefined()
			expect(report.uniqueIndex!.isValid).toBe(false)
			expect(report.uniqueIndex!.orphanedKeys).toContain(orphanKey)

			// Repair
			const repairResult = await Flashcore.$.repair('UniqueAccount')
			expect(repairResult.uniqueIndex).toBeDefined()
			expect(repairResult.uniqueIndex!.success).toBe(true)
			expect(repairResult.uniqueIndex!.repaired).toBeGreaterThanOrEqual(1)

			// Orphaned key should be deleted
			const orphanExists = await adapter.has(orphanKey)
			expect(orphanExists).toBe(false)

			// Valid records should still work
			const found1 = await Account.findUnique({ where: { id: a1.id } })
			expect(found1).not.toBeNull()
			expect(found1!.email).toBe('alice@test.com')

			const found2 = await Account.findUnique({ where: { id: a2.id } })
			expect(found2).not.toBeNull()
			expect(found2!.email).toBe('bob@test.com')

			// Should be able to create with the previously-orphaned value
			const a3 = await Account.create({ email: 'orphan@test.com' })
			expect(a3.email).toBe('orphan@test.com')
		})
	})

	// ========================================================================
	// Catalog corruption — rebuildIndexes restores from authoritative data
	// ========================================================================

	describe('Catalog corruption', () => {
		it('rebuildIndexes restores indexes from authoritative data', async () => {
			const Widget = FlashcoreSystem.registerModel<{ id: string; weight: number; label: string }>('Widget', {
				id: f.id(),
				weight: f.number().indexed(),
				label: f.string()
			})

			// Create 20 records
			const widgets: Array<{ id: string; weight: number; label: string }> = []
			for (let i = 0; i < 20; i++) {
				widgets.push(await Widget.create({ weight: i * 5, label: `Widget-${i}` }))
			}

			// Delete all filter and sorted index keys
			const filterKey = buildModelKey('Widget', 'filter')
			await adapter.delete(filterKey)
			const indexKey = buildModelKey('Widget', 'idx:weight')
			await adapter.delete(indexKey)

			// Force model to reload from corrupted storage
			const model = FlashcoreSystem.getModel('Widget')!
			model._clearIndexes()

			// Rebuild indexes
			await Flashcore.$.rebuildIndexes('Widget')

			// Verify findMany with where works
			const heavy = await Widget.findMany({ where: { weight: { gte: 50 } } })
			expect(heavy.length).toBeGreaterThanOrEqual(10)

			// Verify count matches
			expect(await Widget.count()).toBe(20)

			// Verify orderBy works
			const sorted = await Widget.findMany({ orderBy: { weight: 'desc' } })
			expect(sorted).toHaveLength(20)
			for (let i = 1; i < sorted.length; i++) {
				expect(sorted[i].weight).toBeLessThanOrEqual(sorted[i - 1].weight)
			}
		})
	})

	// ========================================================================
	// Multiple corruption types
	// ========================================================================

	describe('Multiple corruption types', () => {
		it('repairs filter + index + unique corruption in single repair pass', async () => {
			const Employee = FlashcoreSystem.registerModel<{ id: string; badge: string; rank: number }>('Employee', {
				id: f.id(),
				badge: f.string().unique(),
				rank: f.number().indexed()
			})

			// Create records
			const employees: Array<{ id: string; badge: string; rank: number }> = []
			for (let i = 0; i < 8; i++) {
				employees.push(await Employee.create({ badge: `EMP-${i}`, rank: i + 1 }))
			}

			// --- Corrupt filter: replace with one containing only 3 of 8 IDs ---
			const filterKey = buildModelKey('Employee', 'filter')
			const corruptFilter = CuckooFilter.empty()
			corruptFilter.add(employees[0].id)
			corruptFilter.add(employees[1].id)
			corruptFilter.add(employees[2].id)
			await adapter.set(filterKey, corruptFilter.serialize())

			// --- Corrupt sorted index: add a stale entry for a non-existent ID ---
			const model = FlashcoreSystem.getModel('Employee')!
			const sortedIndexes = await model._getSortedIndexes()
			const rankIndex = sortedIndexes.get('rank')
			if (rankIndex) {
				rankIndex.insert(999, 'phantom-id')
				// Persist the corrupted index to adapter so it survives _clearIndexes()
				const rankIndexKey = buildModelKey('Employee', 'idx:rank')
				await adapter.set(rankIndexKey, rankIndex.serialize())
			}

			// --- Corrupt unique index: add an orphaned unique key ---
			const orphanUniqueKey = buildUniqueKey('Employee', 'badge', encodeUniqueValue('EMP-GHOST'))
			await adapter.set(orphanUniqueKey, { id: 'ghost-record' })

			// Force filter and index reload from adapter (corrupted) state
			model._clearIndexes()

			// Check integrity - should detect all three types
			const report = await Flashcore.$.verify('Employee')
			expect(report.isValid).toBe(false)

			// Repair in a single pass
			const repairResult = await Flashcore.$.repair('Employee')

			// Filter should have been repaired
			expect(repairResult.filter).toBeDefined()
			expect(repairResult.filter!.success).toBe(true)
			expect(repairResult.filter!.repaired).toBe(8)

			// Sorted index should have been repaired
			expect(repairResult.sortedIndexes.size).toBeGreaterThanOrEqual(1)
			const rankRepair = repairResult.sortedIndexes.get('rank')
			expect(rankRepair).toBeDefined()
			expect(rankRepair!.success).toBe(true)

			// Unique index should have been repaired
			expect(repairResult.uniqueIndex).toBeDefined()
			expect(repairResult.uniqueIndex!.repaired).toBeGreaterThanOrEqual(1)

			// Verify clean state
			const verifyReport = await Flashcore.$.verify('Employee')
			expect(verifyReport.isValid).toBe(true)

			// Verify records are still intact
			for (const emp of employees) {
				const found = await Employee.findUnique({ where: { id: emp.id } })
				expect(found).not.toBeNull()
				expect(found!.badge).toBe(emp.badge)
				expect(found!.rank).toBe(emp.rank)
			}
		})
	})
})
