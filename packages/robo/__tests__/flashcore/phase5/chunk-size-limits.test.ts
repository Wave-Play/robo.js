/**
 * Flashcore v1 (spec rev 4.3) Phase 5 Tests - Chunk Size Limits
 *
 * Tests chunk size awareness and adapter maxValueSize respect.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem, MemoryAdapter } from '../helpers/flashcore-compat.js'
import { ChunkManager } from '../../../src/flashcore/model/chunk.js'
import { Catalog } from '../../../src/flashcore/model/catalog.js'
import { DEFAULT_MAX_CHUNK_SIZE, DEFAULT_MAX_RECORDS_PER_CHUNK } from '../../../src/flashcore/core/constants.js'

describe('Chunk Size Limits', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
		await adapter.init?.()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Size Estimation', () => {
		it('should estimate record size', () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			const smallRecord = { id: 'small', name: 'test' }
			const smallSize = chunkManager.estimateRecordSize(smallRecord)
			expect(smallSize).toBeGreaterThan(0)

			const largeRecord = { id: 'large', data: 'x'.repeat(1000) }
			const largeSize = chunkManager.estimateRecordSize(largeRecord)
			expect(largeSize).toBeGreaterThan(smallSize)
		})

		it('should account for nested objects', () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			const flatRecord = { id: 'flat', a: 1, b: 2 }
			const nestedRecord = {
				id: 'nested',
				deep: { level1: { level2: { level3: { value: 'deep' } } } }
			}

			const flatSize = chunkManager.estimateRecordSize(flatRecord)
			const nestedSize = chunkManager.estimateRecordSize(nestedRecord)

			expect(nestedSize).toBeGreaterThan(flatSize)
		})

		it('should check if record needs segmentation', () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 500
			})

			const small = chunkManager.checkRecordSize({ id: '1', x: 1 })
			expect(small.needsSegmentation).toBe(false)
			expect(small.estimatedSize).toBeGreaterThan(0)

			const large = chunkManager.checkRecordSize({ id: '2', data: 'x'.repeat(1000) })
			expect(large.needsSegmentation).toBe(true)
		})
	})

	describe('Size-Aware Chunk Selection', () => {
		it('should select chunk with room by size', () => {
			const catalog = Catalog.empty()
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 1000,
				recordsPerChunk: 100
			})

			catalog.addEntry('r1', 0, 200)
			catalog.addEntry('r2', 0, 200)
			catalog.addEntry('r3', 0, 200)
			catalog.setChunkSize(0, 600)

			const smallChunk = chunkManager.selectChunkForInsert(catalog, 100)
			expect(smallChunk).toBe(0)

			const largeChunk = chunkManager.selectChunkForInsert(catalog, 500)
			expect(largeChunk).toBe(1)
		})

		it('should respect maxRecordsPerChunk', () => {
			const catalog = Catalog.empty()
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 10000,
				recordsPerChunk: 3
			})

			catalog.addEntry('r1', 0, 50)
			catalog.addEntry('r2', 0, 50)
			catalog.addEntry('r3', 0, 50)
			catalog.setChunkSize(0, 150)

			const chunkId = chunkManager.selectChunkForInsert(catalog, 50)
			expect(chunkId).toBe(1)
		})

		it('should use default constants when not specified', () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test'
			})

			expect((chunkManager as any).maxChunkSize).toBe(DEFAULT_MAX_CHUNK_SIZE)
			expect((chunkManager as any).recordsPerChunk).toBe(DEFAULT_MAX_RECORDS_PER_CHUNK)
		})
	})

	describe('Chunk Size Tracking', () => {
		it('should track chunk sizes in catalog', () => {
			const catalog = Catalog.empty()

			catalog.addEntry('r1', 0, 100)
			catalog.addEntry('r2', 0, 200)
			catalog.addEntry('r3', 1, 150)

			expect(catalog.getChunkSize(0)).toBe(300)
			expect(catalog.getChunkSize(1)).toBe(150)
		})

		it('should update size on record removal', () => {
			const catalog = Catalog.empty()

			catalog.addEntry('r1', 0, 100)
			catalog.addEntry('r2', 0, 200)

			expect(catalog.getChunkSize(0)).toBe(300)

			catalog.removeEntry('r1')
			expect(catalog.getChunkCount(0)).toBe(1)
		})

		it('should explicitly set chunk size', () => {
			const catalog = Catalog.empty()

			catalog.addEntry('r1', 0, 100)
			catalog.setChunkSize(0, 500)

			expect(catalog.getChunkSize(0)).toBe(500)
		})
	})

	describe('Adapter maxValueSize Respect', () => {
		it('should use adapter maxValueSize when available', () => {
			const limitedAdapter = new MemoryAdapter() as any
			limitedAdapter.maxValueSize = 1000

			const chunkManager = new ChunkManager({
				adapter: limitedAdapter,
				modelName: 'Test'
			})

			const largeRecord = { id: 'large', data: 'x'.repeat(2000) }
			const check = chunkManager.checkRecordSize(largeRecord)

			expect(check.estimatedSize).toBeGreaterThan(1000)
		})
	})
})
