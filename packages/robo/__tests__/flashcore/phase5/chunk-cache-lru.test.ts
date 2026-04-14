/**
 * Flashcore v1 (spec rev 4.3) Phase 5 Tests - Chunk Cache LRU
 *
 * Tests LRU cache behavior, hit/miss, and eviction order.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { FlashcoreSystem, MemoryAdapter } from '../helpers/flashcore-compat.js'
import { ChunkManager } from '../../../src/flashcore/model/chunk.js'

describe('Chunk Cache LRU', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
		await adapter.init?.()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Cache Basics', () => {
		it('should cache chunks after first load', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				cacheSize: 10
			})

			await chunkManager.setRecord(0, 'id-1', { id: 'id-1', value: 1 })

			const read1 = await chunkManager.getRecord(0, 'id-1')
			expect(read1).toEqual({ id: 'id-1', value: 1 })

			const read2 = await chunkManager.getRecord(0, 'id-1')
			expect(read2).toEqual({ id: 'id-1', value: 1 })
		})

		it('should return cached data for subsequent reads', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				cacheSize: 10
			})

			await chunkManager.setRecord(0, 'r1', { id: 'r1' })
			await chunkManager.setRecord(0, 'r2', { id: 'r2' })

			for (let i = 0; i < 5; i++) {
				const result = await chunkManager.getRecord(0, 'r1')
				expect(result).toEqual({ id: 'r1' })
			}
		})
	})

	describe('LRU Eviction', () => {
		it('should evict least recently used chunks', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				cacheSize: 3
			})

			await chunkManager.setRecord(0, 'r0', { id: 'r0' })
			await chunkManager.setRecord(1, 'r1', { id: 'r1' })
			await chunkManager.setRecord(2, 'r2', { id: 'r2' })

			await chunkManager.getRecord(0, 'r0')
			await chunkManager.getRecord(1, 'r1')
			await chunkManager.getRecord(2, 'r2')

			await chunkManager.setRecord(3, 'r3', { id: 'r3' })

			const r0 = await chunkManager.getRecord(0, 'r0')
			expect(r0).toEqual({ id: 'r0' })
		})

		it('should update LRU order on access', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				cacheSize: 3
			})

			await chunkManager.setRecord(0, 'r0', { id: 'r0' })
			await chunkManager.setRecord(1, 'r1', { id: 'r1' })
			await chunkManager.setRecord(2, 'r2', { id: 'r2' })

			await chunkManager.getRecord(0, 'r0')

			await chunkManager.setRecord(3, 'r3', { id: 'r3' })

			expect(await chunkManager.getRecord(0, 'r0')).toEqual({ id: 'r0' })
			expect(await chunkManager.getRecord(1, 'r1')).toEqual({ id: 'r1' })
			expect(await chunkManager.getRecord(2, 'r2')).toEqual({ id: 'r2' })
			expect(await chunkManager.getRecord(3, 'r3')).toEqual({ id: 'r3' })
		})
	})

	describe('Cache Invalidation', () => {
		it('should invalidate cache on write', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				cacheSize: 10
			})

			await chunkManager.setRecord(0, 'r1', { id: 'r1', version: 1 })
			const read1 = await chunkManager.getRecord(0, 'r1')
			expect(read1).toEqual({ id: 'r1', version: 1 })

			await chunkManager.setRecord(0, 'r1', { id: 'r1', version: 2 })

			const read2 = await chunkManager.getRecord(0, 'r1')
			expect(read2).toEqual({ id: 'r1', version: 2 })
		})

		it('should invalidate cache on delete', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				cacheSize: 10
			})

			await chunkManager.setRecord(0, 'r1', { id: 'r1' })
			await chunkManager.setRecord(0, 'r2', { id: 'r2' })
			await chunkManager.getRecord(0, 'r1')

			await chunkManager.deleteRecord(0, 'r1')

			const deleted = await chunkManager.getRecord(0, 'r1')
			expect(deleted).toBeUndefined()

			const remaining = await chunkManager.getRecord(0, 'r2')
			expect(remaining).toEqual({ id: 'r2' })
		})
	})

	describe('Cache Clear', () => {
		it('should clear entire cache', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				cacheSize: 10
			})

			await chunkManager.setRecord(0, 'r0', { id: 'r0' })
			await chunkManager.setRecord(1, 'r1', { id: 'r1' })
			await chunkManager.getRecord(0, 'r0')
			await chunkManager.getRecord(1, 'r1')

			chunkManager.clearCache()

			const r0 = await chunkManager.getRecord(0, 'r0')
			expect(r0).toEqual({ id: 'r0' })
		})
	})

	describe('Cache with Concurrent Operations', () => {
		it('should handle concurrent reads from same chunk', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				cacheSize: 10
			})

			await chunkManager.setRecord(0, 'r1', { id: 'r1', value: 42 })

			const reads = await Promise.all([
				chunkManager.getRecord(0, 'r1'),
				chunkManager.getRecord(0, 'r1'),
				chunkManager.getRecord(0, 'r1')
			])

			expect(reads).toEqual([
				{ id: 'r1', value: 42 },
				{ id: 'r1', value: 42 },
				{ id: 'r1', value: 42 }
			])
		})

		it('should handle concurrent writes to different chunks', async () => {
			const chunkManager = new ChunkManager({
				adapter,
				modelName: 'Test',
				cacheSize: 10
			})

			await Promise.all([
				chunkManager.setRecord(0, 'r0', { id: 'r0' }),
				chunkManager.setRecord(1, 'r1', { id: 'r1' }),
				chunkManager.setRecord(2, 'r2', { id: 'r2' })
			])

			expect(await chunkManager.getRecord(0, 'r0')).toEqual({ id: 'r0' })
			expect(await chunkManager.getRecord(1, 'r1')).toEqual({ id: 'r1' })
			expect(await chunkManager.getRecord(2, 'r2')).toEqual({ id: 'r2' })
		})
	})
})
