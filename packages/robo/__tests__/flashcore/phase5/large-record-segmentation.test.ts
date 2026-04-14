/**
 * Flashcore v1 (spec rev 4.3) Phase 5 Tests - Large Record Segmentation
 *
 * Tests for records that exceed maxChunkSize and require segmentation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem, MemoryAdapter } from '../helpers/flashcore-compat.js'
import { ChunkManager } from '../../../src/flashcore/model/chunk.js'
import { Catalog } from '../../../src/flashcore/model/catalog.js'

describe('Large Record Segmentation', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
		await adapter.init?.()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('ChunkManager Segmentation', () => {
		it('should identify records needing segmentation', () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 1000
			})

			const smallRecord = { id: 'small', name: 'Test' }
			const smallCheck = chunkManager.checkRecordSize(smallRecord)
			expect(smallCheck.needsSegmentation).toBe(false)

			const largeRecord = { id: 'large', data: 'x'.repeat(2000) }
			const largeCheck = chunkManager.checkRecordSize(largeRecord)
			expect(largeCheck.needsSegmentation).toBe(true)
		})

		it('should save and load segmented records', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 500
			})

			const largeRecord = {
				id: 'seg-test',
				data: 'x'.repeat(1000),
				nested: { value: 123, items: [1, 2, 3, 4, 5] }
			}

			const segmentIds = await chunkManager.saveSegmentedRecord('seg-test', largeRecord)
			expect(segmentIds.length).toBeGreaterThan(1)

			const loaded = await chunkManager.loadSegmentedRecord('seg-test', segmentIds)
			expect(loaded).toEqual(largeRecord)
		})

		it('should update segmented records', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 500
			})

			const original = { id: 'upd-seg', data: 'a'.repeat(800) }
			const segmentIds = await chunkManager.saveSegmentedRecord('upd-seg', original)

			const updated = { id: 'upd-seg', data: 'b'.repeat(800), extra: 'new' }
			const newSegmentIds = await chunkManager.updateSegmentedRecord('upd-seg', segmentIds, updated)

			const loaded = await chunkManager.loadSegmentedRecord('upd-seg', newSegmentIds)
			expect(loaded).toEqual(updated)
		})

		it('should delete segmented records completely', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				maxChunkSize: 500
			})

			const record = { id: 'del-seg', data: 'x'.repeat(1000) }
			const segmentIds = await chunkManager.saveSegmentedRecord('del-seg', record)

			for (let i = 0; i < segmentIds.length; i++) {
				const key = '_model:Test:seg:del-seg:' + i
				expect(await adapter.has(key)).toBe(true)
			}

			await chunkManager.deleteSegmentedRecord('del-seg', segmentIds)

			for (let i = 0; i < segmentIds.length; i++) {
				const key = '_model:Test:seg:del-seg:' + i
				expect(await adapter.has(key)).toBe(false)
			}
		})
	})

	describe('Catalog Segment Support', () => {
		it('should track segmented entries differently from chunk entries', () => {
			const catalog = Catalog.empty()

			catalog.addEntry('chunk-record', 0, 100)
			expect(catalog.getEntry('chunk-record')).toEqual({
				id: 'chunk-record',
				kind: 'chunk',
				chunkId: 0
			})

			catalog.addSegmentedEntry('seg-record', ['0', '1', '2'])
			expect(catalog.getEntry('seg-record')).toEqual({
				id: 'seg-record',
				kind: 'segments',
				segmentIds: ['0', '1', '2']
			})
		})

		it('should report segmented count separately', () => {
			const catalog = Catalog.empty()

			catalog.addEntry('r1', 0, 100)
			catalog.addEntry('r2', 0, 100)
			catalog.addSegmentedEntry('s1', ['0', '1'])
			catalog.addSegmentedEntry('s2', ['0', '1', '2'])

			expect(catalog.getCount()).toBe(4)
			expect(catalog.getSegmentedCount()).toBe(2)
		})

		it('should serialize and deserialize segmented entries', () => {
			const catalog = Catalog.empty()

			catalog.addEntry('chunk-1', 0, 100)
			catalog.addSegmentedEntry('seg-1', ['0', '1', '2'])
			catalog.addEntry('chunk-2', 1, 200)
			catalog.addSegmentedEntry('seg-2', ['0', '1'])

			const serialized = catalog.serialize()
			const restored = Catalog.deserialize(serialized)

			expect(restored.getCount()).toBe(4)
			expect(restored.getSegmentedCount()).toBe(2)
			expect(restored.getEntry('seg-1')).toEqual({
				id: 'seg-1',
				kind: 'segments',
				segmentIds: ['0', '1', '2']
			})
		})

		it('should handle transition from chunk to segmented', () => {
			const catalog = Catalog.empty()

			catalog.addEntry('record', 0, 100)
			expect(catalog.getEntry('record')?.kind).toBe('chunk')
			expect(catalog.getChunkCount(0)).toBe(1)

			catalog.addSegmentedEntry('record', ['0', '1', '2'])
			expect(catalog.getEntry('record')?.kind).toBe('segments')
			expect(catalog.getChunkCount(0)).toBe(0)
		})

		it('should handle transition from segmented to chunk', () => {
			const catalog = Catalog.empty()

			catalog.addSegmentedEntry('record', ['0', '1', '2'])
			expect(catalog.getEntry('record')?.kind).toBe('segments')
			expect(catalog.getSegmentedCount()).toBe(1)

			catalog.addEntry('record', 0, 100)
			expect(catalog.getEntry('record')?.kind).toBe('chunk')
			expect(catalog.getSegmentedCount()).toBe(0)
		})
	})

	describe('End-to-end Segmentation Flow', () => {
		it('should support complete CRUD flow with ChunkManager directly', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'LargeTest',
				maxChunkSize: 200
			})
			const catalog = Catalog.empty()

			const largeRecord = { id: 'large-1', name: 'Large', data: 'x'.repeat(500) }
			const sizeCheck = chunkManager.checkRecordSize(largeRecord)
			expect(sizeCheck.needsSegmentation).toBe(true)

			const segmentIds = await chunkManager.saveSegmentedRecord('large-1', largeRecord)
			catalog.addSegmentedEntry('large-1', segmentIds)

			expect(catalog.getEntry('large-1')?.kind).toBe('segments')
			expect(segmentIds.length).toBeGreaterThan(1)

			const loaded = await chunkManager.loadSegmentedRecord('large-1', segmentIds)
			expect(loaded).toEqual(largeRecord)

			const updatedRecord = { ...largeRecord, data: 'y'.repeat(600) }
			const newSegmentIds = await chunkManager.updateSegmentedRecord('large-1', segmentIds, updatedRecord)
			catalog.addSegmentedEntry('large-1', newSegmentIds)

			const reloaded = await chunkManager.loadSegmentedRecord('large-1', newSegmentIds)
			expect(reloaded).toEqual(updatedRecord)

			await chunkManager.deleteSegmentedRecord('large-1', newSegmentIds)
			catalog.removeEntry('large-1')
			expect(catalog.has('large-1')).toBe(false)
		})

		it('should handle small to large transition', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'TransTest',
				maxChunkSize: 1000
			})
			const catalog = Catalog.empty()

			// Small record: ~43 chars JSON -> ~186 bytes estimated (under 800 threshold)
			const smallRecord = { id: 'trans-1', name: 'Small', data: 'x' }
			const smallCheck = chunkManager.checkRecordSize(smallRecord)
			expect(smallCheck.needsSegmentation).toBe(false)

			await chunkManager.setRecord(0, 'trans-1', smallRecord)
			catalog.addEntry('trans-1', 0, smallCheck.estimatedSize)
			expect(catalog.getEntry('trans-1')?.kind).toBe('chunk')

			// Large record: ~530 chars JSON -> ~1160 bytes estimated (over 800 threshold)
			const largeRecord = { id: 'trans-1', name: 'Small', data: 'y'.repeat(500) }
			const largeCheck = chunkManager.checkRecordSize(largeRecord)
			expect(largeCheck.needsSegmentation).toBe(true)

			await chunkManager.deleteRecord(0, 'trans-1')

			const segmentIds = await chunkManager.saveSegmentedRecord('trans-1', largeRecord)
			catalog.addSegmentedEntry('trans-1', segmentIds)
			expect(catalog.getEntry('trans-1')?.kind).toBe('segments')

			const loaded = await chunkManager.loadSegmentedRecord('trans-1', segmentIds)
			expect(loaded).toEqual(largeRecord)
		})
	})
})
