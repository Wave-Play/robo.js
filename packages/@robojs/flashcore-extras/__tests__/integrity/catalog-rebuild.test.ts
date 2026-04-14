/**
 * Flashcore v1 (spec rev 4.3) Phase 5 Tests - Catalog Rebuild
 *
 * Tests for rebuilding catalog from chunk and segment data.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem, MemoryAdapter, buildModelKey } from 'robo.js/flashcore'
import { ChunkManager } from 'robo.js/flashcore'
import { Catalog } from 'robo.js/flashcore'
import { rebuildCatalogFromChunks, verifyCatalogIntegrity } from '../../src/integrity/catalog-rebuild.js'

describe('Catalog Rebuild', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
		await adapter.init?.()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Rebuild from Chunks', () => {
		it('should rebuild empty catalog', async () => {
			const result = await rebuildCatalogFromChunks(adapter, 'Empty')

			expect(result.catalog.getCount()).toBe(0)
			expect(result.chunksScanned).toBe(0)
			expect(result.recordsFound).toBe(0)
			expect(result.segmentedRecords).toBe(0)
		})

		it('should rebuild catalog from single chunk', async () => {
			const chunkKey = buildModelKey('Test', 'chunk:0')
			const chunkData = {
				'id-1': { id: 'id-1', name: 'Record 1' },
				'id-2': { id: 'id-2', name: 'Record 2' },
				'id-3': { id: 'id-3', name: 'Record 3' }
			}
			await adapter.set(chunkKey, chunkData)

			const result = await rebuildCatalogFromChunks(adapter, 'Test')

			expect(result.recordsFound).toBe(3)
			expect(result.chunksScanned).toBe(1)
			expect(result.catalog.has('id-1')).toBe(true)
			expect(result.catalog.has('id-2')).toBe(true)
			expect(result.catalog.has('id-3')).toBe(true)
			expect(result.catalog.getChunkFor('id-1')).toBe(0)
		})

		it('should rebuild catalog from multiple chunks', async () => {
			await adapter.set(buildModelKey('Test', 'chunk:0'), {
				'a1': { id: 'a1', value: 1 },
				'a2': { id: 'a2', value: 2 }
			})
			await adapter.set(buildModelKey('Test', 'chunk:1'), {
				'b1': { id: 'b1', value: 3 },
				'b2': { id: 'b2', value: 4 }
			})
			await adapter.set(buildModelKey('Test', 'chunk:2'), {
				'c1': { id: 'c1', value: 5 }
			})

			const result = await rebuildCatalogFromChunks(adapter, 'Test')

			expect(result.recordsFound).toBe(5)
			expect(result.chunksScanned).toBe(3)
			expect(result.catalog.getChunkFor('a1')).toBe(0)
			expect(result.catalog.getChunkFor('b1')).toBe(1)
			expect(result.catalog.getChunkFor('c1')).toBe(2)
		})

		it('should rebuild catalog with namespaced model', async () => {
			const namespace = 'prod'
			await adapter.set(buildModelKey('User', 'chunk:0', namespace), {
				'u1': { id: 'u1', name: 'Alice' },
				'u2': { id: 'u2', name: 'Bob' }
			})

			const result = await rebuildCatalogFromChunks(adapter, 'User', namespace)

			expect(result.recordsFound).toBe(2)
			expect(result.catalog.has('u1')).toBe(true)
			expect(result.catalog.has('u2')).toBe(true)
		})

		it('should rebuild catalog with segmented records', async () => {
			await adapter.set(buildModelKey('Test', 'chunk:0'), {
				'small': { id: 'small', data: 'tiny' }
			})

			await adapter.set(buildModelKey('Test', 'seg:large:0'), 'segment0data')
			await adapter.set(buildModelKey('Test', 'seg:large:1'), 'segment1data')
			await adapter.set(buildModelKey('Test', 'seg:large:2'), 'segment2data')

			const result = await rebuildCatalogFromChunks(adapter, 'Test')

			expect(result.recordsFound).toBe(1)
			expect(result.segmentedRecords).toBe(1)
			expect(result.catalog.getCount()).toBe(2)

			const largeEntry = result.catalog.getEntry('large')
			expect(largeEntry?.kind).toBe('segments')
			expect(largeEntry?.segmentIds).toEqual(['0', '1', '2'])
		})

		it('should report warnings for malformed chunks', async () => {
			await adapter.set(buildModelKey('Test', 'chunk:0'), {
				'valid': { id: 'valid' }
			})

			await adapter.set(buildModelKey('Test', 'chunk:1'), ['invalid', 'data'])

			const result = await rebuildCatalogFromChunks(adapter, 'Test')

			expect(result.recordsFound).toBe(1)
			expect(result.warnings.length).toBeGreaterThan(0)
			expect(result.warnings[0]).toContain('invalid format')
		})

		it('should report duration', async () => {
			await adapter.set(buildModelKey('Test', 'chunk:0'), {
				'r1': { id: 'r1' }
			})

			const result = await rebuildCatalogFromChunks(adapter, 'Test')

			expect(result.durationMs).toBeGreaterThanOrEqual(0)
		})

		it('should call progress callback', async () => {
			await adapter.set(buildModelKey('Test', 'chunk:0'), {
				'r1': { id: 'r1' },
				'r2': { id: 'r2' }
			})
			await adapter.set(buildModelKey('Test', 'seg:large:0'), 'data')

			const progressCalls: string[] = []
			await rebuildCatalogFromChunks(adapter, 'Test', undefined, {
				onProgress: (progress) => {
					progressCalls.push(progress.phase)
				}
			})

			expect(progressCalls).toContain('scanning_chunks')
			expect(progressCalls).toContain('scanning_segments')
			expect(progressCalls).toContain('complete')
		})
	})

	describe('Verify Catalog Integrity', () => {
		it('should verify valid catalog', async () => {
			const chunkKey = buildModelKey('Test', 'chunk:0')
			await adapter.set(chunkKey, {
				'id-1': { id: 'id-1' },
				'id-2': { id: 'id-2' }
			})

			const catalog = Catalog.empty()
			catalog.addEntry('id-1', 0, 100)
			catalog.addEntry('id-2', 0, 100)

			const result = await verifyCatalogIntegrity(adapter, catalog, 'Test')

			expect(result.isValid).toBe(true)
			expect(result.missingRecords).toHaveLength(0)
		})

		it('should detect missing records', async () => {
			const catalog = Catalog.empty()
			catalog.addEntry('missing-1', 0, 100)
			catalog.addEntry('missing-2', 1, 100)

			const result = await verifyCatalogIntegrity(adapter, catalog, 'Test')

			expect(result.isValid).toBe(false)
			expect(result.missingRecords.length).toBeGreaterThan(0)
		})

		it('should verify segmented records', async () => {
			await adapter.set(buildModelKey('Test', 'seg:seg-1:0'), 'data0')
			await adapter.set(buildModelKey('Test', 'seg:seg-1:1'), 'data1')

			const catalog = Catalog.empty()
			catalog.addSegmentedEntry('seg-1', ['0', '1'])

			const result = await verifyCatalogIntegrity(adapter, catalog, 'Test')

			expect(result.isValid).toBe(true)
		})

		it('should detect missing segments', async () => {
			const catalog = Catalog.empty()
			catalog.addSegmentedEntry('missing-seg', ['0', '1', '2'])

			const result = await verifyCatalogIntegrity(adapter, catalog, 'Test')

			expect(result.isValid).toBe(false)
			expect(result.missingRecords).toContain('missing-seg')
		})
	})

	describe('Recovery Scenario', () => {
		it('should fully recover from lost catalog', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'User',
				maxChunkSize: 1000
			})

			const originalCatalog = Catalog.empty()

			await chunkManager.setRecord(0, 'user-1', { id: 'user-1', name: 'Alice' })
			originalCatalog.addEntry('user-1', 0, 100)

			await chunkManager.setRecord(0, 'user-2', { id: 'user-2', name: 'Bob' })
			originalCatalog.addEntry('user-2', 0, 100)

			await chunkManager.setRecord(1, 'user-3', { id: 'user-3', name: 'Charlie' })
			originalCatalog.addEntry('user-3', 1, 100)

			const rebuildResult = await rebuildCatalogFromChunks(adapter, 'User')

			expect(rebuildResult.catalog.getCount()).toBe(originalCatalog.getCount())
			expect(rebuildResult.catalog.has('user-1')).toBe(true)
			expect(rebuildResult.catalog.has('user-2')).toBe(true)
			expect(rebuildResult.catalog.has('user-3')).toBe(true)

			expect(rebuildResult.catalog.getChunkFor('user-1')).toBe(0)
			expect(rebuildResult.catalog.getChunkFor('user-2')).toBe(0)
			expect(rebuildResult.catalog.getChunkFor('user-3')).toBe(1)
		})
	})
})
