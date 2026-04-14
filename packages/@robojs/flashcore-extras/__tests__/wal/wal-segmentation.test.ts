/**
 * WAL Segmentation Tests
 *
 * Tests large entry segmentation across multiple keys.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	FlashcoreSystem,
	MemoryAdapter,
	WAL_ENTRY_PREFIX,
	WAL_SEGMENT_PREFIX,
	WAL_DEFAULT_SEGMENT_SIZE
} from 'robo.js/flashcore'
import type { WALConfig } from 'robo.js/flashcore'
import { WriteAheadLog } from '../../src/wal/manager.js'

describe('WAL Segmentation', () => {
	let adapter: MemoryAdapter
	let wal: WriteAheadLog

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Small Entries', () => {
		beforeEach(() => {
			wal = new WriteAheadLog(adapter)
		})

		it('should store small entries without segmentation', async () => {
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1', name: 'Small' } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})

			const entry = await wal.readEntry(walId)
			expect(entry).toBeDefined()
			expect(entry!.segmented).toBeUndefined()
		})

		it('should read small entries correctly', async () => {
			const record = { id: 'id1', name: 'Test', value: 123 }
			const walId = await wal.begin({
				model: 'Model',
				namespace: 'ns',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})

			const entry = await wal.readEntry(walId)
			expect(entry!.auth[0]).toEqual({
				t: 'chunk_put',
				chunkId: 'c:0',
				id: 'id1',
				record
			})
		})
	})

	describe('Large Entries with Custom Segment Size', () => {
		const SMALL_ENTRY_SIZE = 100 // Very small for testing

		beforeEach(() => {
			const config: WALConfig = {
				maxEntrySize: SMALL_ENTRY_SIZE
			}
			wal = new WriteAheadLog(adapter, config)
		})

		it('should segment entries larger than segment size', async () => {
			// Create a record that will exceed the small segment size
			const largeRecord = {
				id: 'large1',
				name: 'A'.repeat(200), // Much larger than segment size
				description: 'B'.repeat(200)
			}

			const walId = await wal.begin({
				model: 'LargeModel',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'large1', record: largeRecord }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'large1' }],
				derived: []
			})

			// Read the header directly to check segmentation info
			const headerKey = WAL_ENTRY_PREFIX + walId
			const header = (await adapter.get(headerKey)) as Record<string, unknown>

			expect(header.segmented).toBeDefined()
			expect((header.segmented as { parts: number }).parts).toBeGreaterThan(1)
		})

		it('should reconstruct segmented entries correctly', async () => {
			const largeRecord = {
				id: 'large2',
				data: 'X'.repeat(500),
				meta: { nested: 'Y'.repeat(200) }
			}

			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'large2', record: largeRecord }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'large2' }],
				derived: []
			})

			// Read the full entry (should reconstruct from segments)
			const entry = await wal.readEntry(walId)

			expect(entry).toBeDefined()
			expect(entry!.model).toBe('Test')
			expect(entry!.op).toBe('create')
			expect((entry!.auth[0] as any).record).toEqual(largeRecord)
		})

		it('should store segments with correct key format', async () => {
			const largeData = 'Z'.repeat(500)
			const walId = await wal.begin({
				model: 'Test',
				op: 'update',
				auth: [{ t: 'chunk_patch', chunkId: 'c:0', id: 'id1', patch: { data: largeData } }],
				undo: [{ t: 'chunk_patch', chunkId: 'c:0', id: 'id1', patch: { data: 'old' } }],
				derived: []
			})

			// Check segment keys exist
			const headerKey = WAL_ENTRY_PREFIX + walId
			const header = (await adapter.get(headerKey)) as Record<string, unknown>

			if (header.segmented) {
				const numParts = (header.segmented as { parts: number }).parts
				for (let i = 0; i < numParts; i++) {
					const segmentKey = WAL_SEGMENT_PREFIX + walId + ':' + i
					const segment = await adapter.get(segmentKey)
					expect(segment).toBeDefined()
				}
			}
		})

		it('should delete all segments on complete', async () => {
			const largeData = 'D'.repeat(500)
			const walId = await wal.begin({
				model: 'Test',
				op: 'delete',
				auth: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				undo: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1', data: largeData } }],
				derived: []
			})

			// Get segment info before completing
			const headerKey = WAL_ENTRY_PREFIX + walId
			const header = (await adapter.get(headerKey)) as Record<string, unknown>
			const segmented = header.segmented as { parts: number } | undefined

			// Complete the entry
			await wal.complete(walId)

			// Verify header is deleted
			expect(await adapter.get(headerKey)).toBeUndefined()

			// Verify all segments are deleted
			if (segmented) {
				for (let i = 0; i < segmented.parts; i++) {
					const segmentKey = WAL_SEGMENT_PREFIX + walId + ':' + i
					expect(await adapter.get(segmentKey)).toBeUndefined()
				}
			}
		})

		it('should delete all segments on deleteEntry', async () => {
			const largeData = 'E'.repeat(500)
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1', data: largeData } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})

			// Get segment info
			const headerKey = WAL_ENTRY_PREFIX + walId
			const header = (await adapter.get(headerKey)) as Record<string, unknown>
			const segmented = header.segmented as { parts: number } | undefined

			// Delete the entry
			await wal.deleteEntry(walId)

			// Verify everything is cleaned up
			expect(await adapter.get(headerKey)).toBeUndefined()
			if (segmented) {
				for (let i = 0; i < segmented.parts; i++) {
					const segmentKey = WAL_SEGMENT_PREFIX + walId + ':' + i
					expect(await adapter.get(segmentKey)).toBeUndefined()
				}
			}
		})
	})

	describe('Edge Cases', () => {
		it('should handle entry exactly at segment boundary', async () => {
			// Use a segment size where we can predict behavior
			const config: WALConfig = { maxEntrySize: 500 }
			wal = new WriteAheadLog(adapter, config)

			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1' } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})

			const entry = await wal.readEntry(walId)
			expect(entry).toBeDefined()
			expect(entry!.model).toBe('Test')
		})

		it('should handle empty auth/undo arrays', async () => {
			wal = new WriteAheadLog(adapter)

			const walId = await wal.begin({
				model: 'Empty',
				op: 'create',
				auth: [],
				undo: [],
				derived: []
			})

			const entry = await wal.readEntry(walId)
			expect(entry!.auth).toEqual([])
			expect(entry!.undo).toEqual([])
		})

		it('should handle complex nested data in deltas', async () => {
			const config: WALConfig = { maxEntrySize: 100 }
			wal = new WriteAheadLog(adapter, config)

			const complexRecord: Record<string, unknown> = {
				id: 'complex1',
				nested: {
					level1: {
						level2: {
							level3: {
								data: Array(50).fill({ key: 'value', num: 123 })
							}
						}
					}
				},
				array: Array(100).fill('item'),
				nullValue: null,
				boolValue: true
			}

			const walId = await wal.begin({
				model: 'Complex',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'complex1', record: complexRecord }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'complex1' }],
				derived: []
			})

			const entry = await wal.readEntry(walId)
			expect((entry!.auth[0] as any).record).toEqual(complexRecord)
		})
	})

	describe('Default Segment Size', () => {
		it('should use default segment size from constants', () => {
			expect(WAL_DEFAULT_SEGMENT_SIZE).toBe(100_000) // 100KB
		})

		it('should not segment typical small records with default size', async () => {
			wal = new WriteAheadLog(adapter) // Default config

			const typicalRecord = {
				id: 'user1',
				name: 'Alice Smith',
				email: 'alice@example.com',
				age: 30,
				preferences: {
					theme: 'dark',
					notifications: true
				}
			}

			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'user1', record: typicalRecord }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'user1' }],
				derived: []
			})

			const headerKey = WAL_ENTRY_PREFIX + walId
			const header = (await adapter.get(headerKey)) as Record<string, unknown>
			expect(header.segmented).toBeUndefined()
		})
	})

	describe('Phase Updates with Segmented Entries', () => {
		it('should update phase in header without affecting segments', async () => {
			const config: WALConfig = { maxEntrySize: 100 }
			wal = new WriteAheadLog(adapter, config)

			const largeData = 'P'.repeat(500)
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1', data: largeData } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})

			// Mark phase changes
			await wal.markPhase(walId, 'authoritative')

			// Verify entry still reconstructs correctly
			const entry = await wal.readEntry(walId)
			expect(entry!.phase).toBe('authoritative')
			expect((entry!.auth[0] as any).record.data).toBe(largeData)

			// Mark derived
			await wal.markPhase(walId, 'derived')
			const entry2 = await wal.readEntry(walId)
			expect(entry2!.phase).toBe('derived')
			expect((entry2!.auth[0] as any).record.data).toBe(largeData)
		})
	})
})
