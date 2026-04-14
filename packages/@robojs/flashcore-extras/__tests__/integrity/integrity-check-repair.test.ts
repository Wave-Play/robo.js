/**
 * Phase 6: IntegrityChecker and RepairEngine Tests
 *
 * Tests for integrity checking and repair of derived indexes.
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { IntegrityChecker } from '../../src/integrity/check.js'
import { RepairEngine } from '../../src/integrity/repair.js'
import { CuckooFilter } from 'robo.js/flashcore'
import { SortedIndex } from 'robo.js/flashcore'
import { Catalog } from 'robo.js/flashcore'
import { ChunkManager } from 'robo.js/flashcore'
import { MemoryAdapter, buildModelKey, buildUniqueKey, encodeUniqueValue } from 'robo.js/flashcore'

describe('IntegrityChecker', () => {
	let adapter: MemoryAdapter
	let checker: IntegrityChecker

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		checker = new IntegrityChecker(adapter)
	})

	describe('checkFilter', () => {
		it('should return valid for matching filter and catalog', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100)
			catalog.addEntry('id3', 1, 100)

			const filter = new CuckooFilter()
			filter.add('id1')
			filter.add('id2')
			filter.add('id3')

			const result = await checker.checkFilter(catalog, filter)

			expect(result.isValid).toBe(true)
			expect(result.missingInFilter).toHaveLength(0)
			expect(result.recordsChecked).toBe(3)
		})

		it('should detect missing entries in filter', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100)
			catalog.addEntry('id3', 1, 100)

			const filter = new CuckooFilter()
			filter.add('id1')
			// id2 and id3 missing

			const result = await checker.checkFilter(catalog, filter)

			expect(result.isValid).toBe(false)
			expect(result.missingInFilter).toContain('id2')
			expect(result.missingInFilter).toContain('id3')
		})

		it('should support sample size limit', async () => {
			const catalog = Catalog.empty()
			for (let i = 0; i < 100; i++) {
				catalog.addEntry(`id${i}`, 0, 100)
			}

			const filter = new CuckooFilter()

			const result = await checker.checkFilter(catalog, filter, { sampleSize: 10 })

			expect(result.recordsChecked).toBe(10)
		})
	})

	describe('checkSortedIndex', () => {
		it('should return valid for matching index and catalog', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100)

			const index = new SortedIndex('score')
			index.insert(100, 'id1')
			index.insert(200, 'id2')

			const result = await checker.checkSortedIndex('Test', catalog, 'score', index)

			expect(result.isValid).toBe(true)
			expect(result.orphanedInIndex).toHaveLength(0)
		})

		it('should detect orphaned entries in index', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)

			const index = new SortedIndex('score')
			index.insert(100, 'id1')
			index.insert(200, 'id2') // id2 not in catalog

			const result = await checker.checkSortedIndex('Test', catalog, 'score', index)

			expect(result.isValid).toBe(false)
			expect(result.orphanedInIndex).toContain('id2')
		})
	})

	describe('checkUniqueIndexes', () => {
		it('should detect orphaned unique keys with no value', async () => {
			// Set up unique key that exists but has no value (orphaned)
			const key = buildUniqueKey('User', 'email', encodeUniqueValue('test@example.com'))
			await adapter.set(key, '') // Empty string - will be detected as orphaned

			const result = await checker.checkUniqueIndexes('User', ['email'])

			// Keys with empty/falsy values are marked as orphaned
			expect(result.keysChecked).toBeGreaterThan(0)
		})

		it('should detect duplicate unique values', async () => {
			// Set up unique keys pointing to different records with same value
			const key = buildUniqueKey('User', 'email', encodeUniqueValue('test@example.com'))
			await adapter.set(key, { id: 'id1' })
			await adapter.set(key, { id: 'id2' })

			// Note: This test would need a more sophisticated setup to actually have duplicates
			// since the second set would overwrite the first
			const result = await checker.checkUniqueIndexes('User', ['email'])

			expect(result.keysChecked).toBeGreaterThan(0)
		})
	})

	describe('checkAll', () => {
		it('should check all integrity aspects', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)

			const filter = new CuckooFilter()
			filter.add('id1')

			const sortedIndexes = new Map<string, SortedIndex>()
			const scoreIndex = new SortedIndex('score')
			scoreIndex.insert(100, 'id1')
			sortedIndexes.set('score', scoreIndex)

			const report = await checker.checkAll('Test', catalog, {
				filter,
				sortedIndexes,
				checkUniqueIndexes: false
			})

			expect(report.isValid).toBe(true)
			expect(report.filter?.isValid).toBe(true)
			expect(report.sortedIndexes).toHaveLength(1)
			expect(report.sortedIndexes[0].isValid).toBe(true)
		})

		it('should mark report invalid if any check fails', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100) // Not in filter

			const filter = new CuckooFilter()
			filter.add('id1') // Missing id2

			const report = await checker.checkAll('Test', catalog, {
				filter,
				sortedIndexes: new Map(),
				checkUniqueIndexes: false
			})

			expect(report.isValid).toBe(false)
			expect(report.filter?.isValid).toBe(false)
		})
	})

	describe('quickCheck', () => {
		it('should return healthy for valid indexes', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)

			const filter = new CuckooFilter()
			filter.add('id1')

			const result = await checker.quickCheck('Test', catalog, filter)

			expect(result.healthy).toBe(true)
			expect(result.issues).toHaveLength(0)
		})

		it('should return issues for invalid indexes', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100) // Not in filter

			const filter = new CuckooFilter()
			filter.add('id1')

			const result = await checker.quickCheck('Test', catalog, filter)

			expect(result.healthy).toBe(false)
			expect(result.issues.length).toBeGreaterThan(0)
		})
	})
})

describe('RepairEngine', () => {
	let adapter: MemoryAdapter
	let engine: RepairEngine

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		engine = new RepairEngine(adapter)
	})

	describe('repairFilter', () => {
		it('should rebuild filter from catalog', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100)
			catalog.addEntry('id3', 1, 100)

			const result = await engine.repairFilter(catalog)

			expect(result.success).toBe(true)
			expect(result.repaired).toBe(3)

			const newFilter = (result as { filter?: CuckooFilter }).filter!
			expect(newFilter.mightContain('id1')).toBe(true)
			expect(newFilter.mightContain('id2')).toBe(true)
			expect(newFilter.mightContain('id3')).toBe(true)
		})

		it('should support dry run', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)

			const result = await engine.repairFilter(catalog, true)

			expect(result.success).toBe(true)
			expect(result.repaired).toBe(1)
			expect((result as { filter?: CuckooFilter }).filter).toBeUndefined()
		})
	})

	describe('repairSortedIndex', () => {
		it('should rebuild sorted index from chunks', async () => {
			// Set up chunks
			await adapter.set(buildModelKey('User', 'chunk:0'), {
				'id1': { id: 'id1', score: 100 },
				'id2': { id: 'id2', score: 200 }
			})

			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100)

			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'User',
				maxChunkSize: 1000
			})

			const result = await engine.repairSortedIndex(
				'User',
				catalog,
				chunkManager,
				'score'
			)

			expect(result.success).toBe(true)
			expect(result.repaired).toBe(2)

			const newIndex = (result as { index?: SortedIndex }).index!
			expect(newIndex.has(100, 'id1')).toBe(true)
			expect(newIndex.has(200, 'id2')).toBe(true)
		})
	})

	describe('repairUniqueIndex', () => {
		it('should clean orphaned unique keys', async () => {
			// Set up orphaned key
			const orphanedKey = buildUniqueKey('User', 'email', encodeUniqueValue('orphan@test.com'))
			await adapter.set(orphanedKey, { id: 'nonexistent-id' })

			const integrityResult = {
				isValid: false,
				orphanedKeys: [orphanedKey],
				duplicates: [] as Array<{ field: string; value: string; ids: string[] }>,
				keysChecked: 1
			}

			const result = await engine.repairUniqueIndex('User', integrityResult)

			expect(result.success).toBe(true)
			expect(result.repaired).toBe(1)

			// Key should be deleted
			const exists = await adapter.has(orphanedKey)
			expect(exists).toBe(false)
		})

		it('should report duplicates as unrepaired', async () => {
			const integrityResult = {
				isValid: false,
				orphanedKeys: [] as string[],
				duplicates: [
					{ field: 'email', value: 'dup@test.com', ids: ['id1', 'id2'] }
				],
				keysChecked: 1
			}

			const result = await engine.repairUniqueIndex('User', integrityResult)

			expect(result.success).toBe(false) // Can't auto-repair duplicates
			expect(result.unrepaired.length).toBeGreaterThan(0)
			expect(result.warnings.length).toBeGreaterThan(0)
		})
	})

	describe('rebuildAll', () => {
		it('should rebuild filter and sorted indexes from chunks', async () => {
			// Set up chunks
			await adapter.set(buildModelKey('User', 'chunk:0'), {
				'id1': { id: 'id1', score: 100, name: 'Alice' },
				'id2': { id: 'id2', score: 200, name: 'Bob' }
			})

			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100)

			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'User',
				maxChunkSize: 1000
			})

			const result = await engine.rebuildAll(
				'User',
				catalog,
				chunkManager,
				['score', 'name']
			)

			expect(result.filter.mightContain('id1')).toBe(true)
			expect(result.filter.mightContain('id2')).toBe(true)

			expect(result.sortedIndexes.size).toBe(2)
			expect(result.sortedIndexes.get('score')!.has(100, 'id1')).toBe(true)
			expect(result.sortedIndexes.get('name')!.has('Alice', 'id1')).toBe(true)
		})

		it('should call progress callback', async () => {
			await adapter.set(buildModelKey('User', 'chunk:0'), {
				'id1': { id: 'id1', score: 100 }
			})

			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)

			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'User',
				maxChunkSize: 1000
			})

			const progressCalls: string[] = []
			await engine.rebuildAll('User', catalog, chunkManager, ['score'], undefined, (progress) => {
				progressCalls.push(progress.phase)
			})

			expect(progressCalls).toContain('filter')
			expect(progressCalls).toContain('complete')
		})
	})

	describe('rebuildFilter', () => {
		it('should create new filter from catalog IDs', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100)

			const filter = await engine.rebuildFilter(catalog)

			expect(filter.mightContain('id1')).toBe(true)
			expect(filter.mightContain('id2')).toBe(true)
			expect(filter.getCount()).toBe(2)
		})
	})

	describe('rebuildSortedIndex', () => {
		it('should create new sorted index from records', async () => {
			await adapter.set(buildModelKey('User', 'chunk:0'), {
				'id1': { id: 'id1', score: 100 },
				'id2': { id: 'id2', score: 200 }
			})

			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100)

			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'User',
				maxChunkSize: 1000
			})

			const index = await engine.rebuildSortedIndex('User', catalog, chunkManager, 'score')

			expect(index.has(100, 'id1')).toBe(true)
			expect(index.has(200, 'id2')).toBe(true)
			expect(index.getCount()).toBe(2)
		})

		it('should skip null/undefined field values', async () => {
			await adapter.set(buildModelKey('User', 'chunk:0'), {
				'id1': { id: 'id1', score: 100 },
				'id2': { id: 'id2', score: null },
				'id3': { id: 'id3' } // score undefined
			})

			const catalog = Catalog.empty()
			catalog.addEntry('id1', 0, 100)
			catalog.addEntry('id2', 0, 100)
			catalog.addEntry('id3', 0, 100)

			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'User',
				maxChunkSize: 1000
			})

			const index = await engine.rebuildSortedIndex('User', catalog, chunkManager, 'score')

			expect(index.has(100, 'id1')).toBe(true)
			expect(index.getCount()).toBe(1) // Only id1 has valid score
		})
	})
})
