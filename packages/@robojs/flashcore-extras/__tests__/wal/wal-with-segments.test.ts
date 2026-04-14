/**
 * Flashcore v1 (spec rev 4.3) Phase 5 Tests - WAL with Segments
 *
 * Tests WAL entries referencing segmented records and crash/recovery behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	FlashcoreSystem,
	MemoryAdapter,
	WAL_ENTRY_PREFIX,
	WAL_STALE_THRESHOLD_MS,
	buildModelKey
} from 'robo.js/flashcore'
import type { WALEntry } from 'robo.js/flashcore'
import { WriteAheadLog, recoverWAL } from '../../src/wal/index.js'
import {
	buildCreateSegmentedDeltas,
	buildDeleteSegmentedDeltas,
	buildUpdateSegmentedDeltas
} from '../../src/wal/deltas.js'
import type { SegmentWrite, UniqueChange } from '../../src/wal/deltas.js'

describe('WAL with Segments', () => {
	let adapter: MemoryAdapter
	let wal: WriteAheadLog

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
		await adapter.init?.()
		wal = new WriteAheadLog(adapter)
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Segmented Record Delta Building', () => {
		it('should build create deltas for segmented record', () => {
			const segments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: '{"id":"record-1",' },
				{ segmentKey: buildModelKey('Test', 'seg:record-1:1'), index: 1, data: '"data":"large..."}' }
			]
			const uniqueKeys: UniqueChange[] = []

			const deltas = buildCreateSegmentedDeltas('record-1', ['0', '1'], segments, uniqueKeys)

			expect(deltas.auth.length).toBeGreaterThan(0)
			expect(deltas.undo.length).toBeGreaterThan(0)

			// Should have seg_put for each segment
			const segPuts = deltas.auth.filter((d) => d.t === 'seg_put')
			expect(segPuts.length).toBe(2)

			// Should have catalog_set_segments
			const catalogSet = deltas.auth.find((d) => d.t === 'catalog_set_segments')
			expect(catalogSet).toBeDefined()
		})

		it('should build delete deltas for segmented record', () => {
			const segments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: '{"id":"record-1",' },
				{ segmentKey: buildModelKey('Test', 'seg:record-1:1'), index: 1, data: '"data":"large..."}' }
			]
			const uniqueKeys: UniqueChange[] = []

			const deltas = buildDeleteSegmentedDeltas('record-1', ['0', '1'], segments, uniqueKeys)

			// Should have seg_delete for each segment
			const segDeletes = deltas.auth.filter((d) => d.t === 'seg_delete')
			expect(segDeletes.length).toBe(2)

			// Should have catalog_delete
			const catalogDelete = deltas.auth.find((d) => d.t === 'catalog_delete')
			expect(catalogDelete).toBeDefined()

			// Undo should have seg_put to restore segments
			const undoSegPuts = deltas.undo.filter((d) => d.t === 'seg_put')
			expect(undoSegPuts.length).toBe(2)
		})

		it('should build update deltas for segmented record', () => {
			const oldSegments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: '{"id":"record-1",' },
				{ segmentKey: buildModelKey('Test', 'seg:record-1:1'), index: 1, data: '"data":"old..."}' }
			]
			const newSegments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: '{"id":"record-1",' },
				{ segmentKey: buildModelKey('Test', 'seg:record-1:1'), index: 1, data: '"data":"new..."}' },
				{ segmentKey: buildModelKey('Test', 'seg:record-1:2'), index: 2, data: '"extra":"data"}' }
			]

			const deltas = buildUpdateSegmentedDeltas(
				'record-1',
				['0', '1'],
				oldSegments,
				['0', '1', '2'],
				newSegments,
				[]
			)

			// Should have seg_put for new segments
			const segPuts = deltas.auth.filter((d) => d.t === 'seg_put')
			expect(segPuts.length).toBe(3)

			// Should have catalog_set_segments with new segment IDs
			const catalogSet = deltas.auth.find((d) => d.t === 'catalog_set_segments')
			expect(catalogSet).toBeDefined()
			if (catalogSet && catalogSet.t === 'catalog_set_segments') {
				expect(catalogSet.segmentIds).toEqual(['0', '1', '2'])
			}
		})

		it('should handle shrinking segments on update', () => {
			const oldSegments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: 'part1' },
				{ segmentKey: buildModelKey('Test', 'seg:record-1:1'), index: 1, data: 'part2' },
				{ segmentKey: buildModelKey('Test', 'seg:record-1:2'), index: 2, data: 'part3' }
			]
			const newSegments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: 'smaller' }
			]

			const deltas = buildUpdateSegmentedDeltas('record-1', ['0', '1', '2'], oldSegments, ['0'], newSegments, [])

			// Should have seg_delete for trailing old segments
			const segDeletes = deltas.auth.filter((d) => d.t === 'seg_delete')
			expect(segDeletes.length).toBe(2) // segments 1 and 2 should be deleted
		})
	})

	describe('WAL Entry with Segments', () => {
		it('should create WAL entry for segmented record create', async () => {
			const segments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: '{"id":"record-1"}' }
			]
			const deltas = buildCreateSegmentedDeltas('record-1', ['0'], segments, [])

			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: deltas.derived
			})

			expect(walId).toBeDefined()

			const entry = await wal.readEntry(walId)
			expect(entry).toBeDefined()
			expect(entry?.model).toBe('Test')
			expect(entry?.op).toBe('create')
			expect(entry?.auth.length).toBeGreaterThan(0)
		})

		it('should complete WAL entry for segmented record', async () => {
			const segments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: '{"id":"record-1"}' }
			]
			const deltas = buildCreateSegmentedDeltas('record-1', ['0'], segments, [])

			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: deltas.derived
			})

			await wal.markPhase(walId, 'authoritative')
			await wal.markPhase(walId, 'derived')
			await wal.complete(walId)

			// Entry should be removed after completion
			const entry = await wal.readEntry(walId)
			expect(entry).toBeNull()
		})
	})

	describe('Delta Types', () => {
		it('should have correct delta types for segment operations', () => {
			const segments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: 'data' }
			]

			const createDeltas = buildCreateSegmentedDeltas('record-1', ['0'], segments, [])

			// Check auth deltas
			const segPut = createDeltas.auth.find((d) => d.t === 'seg_put')
			expect(segPut).toBeDefined()
			if (segPut && segPut.t === 'seg_put') {
				expect(segPut.segmentKey).toBe(buildModelKey('Test', 'seg:record-1:0'))
				expect(segPut.id).toBe('record-1')
				expect(segPut.index).toBe(0)
				expect(segPut.data).toBe('data')
			}

			// Check undo deltas
			const segDelete = createDeltas.undo.find((d) => d.t === 'seg_delete')
			expect(segDelete).toBeDefined()
			if (segDelete && segDelete.t === 'seg_delete') {
				expect(segDelete.segmentKey).toBe(buildModelKey('Test', 'seg:record-1:0'))
				expect(segDelete.id).toBe('record-1')
				expect(segDelete.index).toBe(0)
			}
		})

		it('should include catalog_set_segments delta', () => {
			const segments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: 'part1' },
				{ segmentKey: buildModelKey('Test', 'seg:record-1:1'), index: 1, data: 'part2' }
			]

			const deltas = buildCreateSegmentedDeltas('record-1', ['0', '1'], segments, [])

			const catalogSet = deltas.auth.find((d) => d.t === 'catalog_set_segments')
			expect(catalogSet).toBeDefined()
			if (catalogSet && catalogSet.t === 'catalog_set_segments') {
				expect(catalogSet.id).toBe('record-1')
				expect(catalogSet.segmentIds).toEqual(['0', '1'])
			}
		})
	})

	describe('Unique Constraint Integration', () => {
		it('should include unique constraint deltas for segmented records', () => {
			const segments: SegmentWrite[] = [
				{ segmentKey: buildModelKey('Test', 'seg:record-1:0'), index: 0, data: '{"id":"record-1"}' }
			]
			const uniqueKeys: UniqueChange[] = [{ key: '_model:Test:ux:email:test@example.com', id: 'record-1' }]

			const deltas = buildCreateSegmentedDeltas('record-1', ['0'], segments, uniqueKeys)

			// Should have unique_acquire
			const uniqueAcquire = deltas.auth.find((d) => d.t === 'unique_acquire')
			expect(uniqueAcquire).toBeDefined()

			// Should have unique_release in undo
			const uniqueRelease = deltas.undo.find((d) => d.t === 'unique_release')
			expect(uniqueRelease).toBeDefined()
		})
	})

	describe('Crash Recovery with Segmented Records', () => {
		it('should replay recent pending segmented create', async () => {
			const segmentKey0 = buildModelKey('Test', 'seg:record-1:0')
			const segmentKey1 = buildModelKey('Test', 'seg:record-1:1')
			const segments: SegmentWrite[] = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"record-1",' },
				{ segmentKey: segmentKey1, index: 1, data: '"data":"large"}' }
			]

			const deltas = buildCreateSegmentedDeltas('record-1', ['0', '1'], segments, [])

			// Create WAL entry but don't complete (simulating crash after begin)
			await wal.begin({
				model: 'Test',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Verify segments are NOT in storage yet
			expect(await adapter.get(segmentKey0)).toBeUndefined()
			expect(await adapter.get(segmentKey1)).toBeUndefined()

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)
			expect(result.rolledBack).toBe(0)

			// Verify segments are now in storage
			expect(await adapter.get(segmentKey0)).toBe('{"id":"record-1",')
			expect(await adapter.get(segmentKey1)).toBe('"data":"large"}')
		})

		it('should rollback stale pending segmented create', async () => {
			const segmentKey0 = buildModelKey('Test', 'seg:record-1:0')
			const segmentKey1 = buildModelKey('Test', 'seg:record-1:1')
			const segments: SegmentWrite[] = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"record-1",' },
				{ segmentKey: segmentKey1, index: 1, data: '"data":"large"}' }
			]

			const deltas = buildCreateSegmentedDeltas('record-1', ['0', '1'], segments, [])

			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate partial writes before crash - segments were written
			await adapter.set(segmentKey0, '{"id":"record-1",')
			await adapter.set(segmentKey1, '"data":"large"}')

			// Make entry stale
			const entryKey = WAL_ENTRY_PREFIX + walId
			const entry = (await adapter.get(entryKey)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(entryKey, entry)

			// Run recovery - stale pending should rollback
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(0)
			expect(result.rolledBack).toBe(1)

			// Verify segments are removed (rolled back)
			expect(await adapter.get(segmentKey0)).toBeUndefined()
			expect(await adapter.get(segmentKey1)).toBeUndefined()
		})

		it('should replay segmented create in authoritative phase', async () => {
			const segmentKey0 = buildModelKey('Test', 'seg:record-1:0')
			const segmentKey1 = buildModelKey('Test', 'seg:record-1:1')
			const segments: SegmentWrite[] = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"record-1",' },
				{ segmentKey: segmentKey1, index: 1, data: '"data":"value"}' }
			]

			const deltas = buildCreateSegmentedDeltas('record-1', ['0', '1'], segments, [])

			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Simulate crash - only first segment was written
			await adapter.set(segmentKey0, '{"id":"record-1",')
			// segmentKey1 not written yet

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)

			// Both segments should now exist
			expect(await adapter.get(segmentKey0)).toBe('{"id":"record-1",')
			expect(await adapter.get(segmentKey1)).toBe('"data":"value"}')
		})

		it('should replay segmented delete on recovery', async () => {
			const segmentKey0 = buildModelKey('Test', 'seg:record-1:0')
			const segmentKey1 = buildModelKey('Test', 'seg:record-1:1')

			// Pre-populate segments
			await adapter.set(segmentKey0, '{"id":"record-1",')
			await adapter.set(segmentKey1, '"data":"value"}')

			const segments: SegmentWrite[] = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"record-1",' },
				{ segmentKey: segmentKey1, index: 1, data: '"data":"value"}' }
			]

			const deltas = buildDeleteSegmentedDeltas('record-1', ['0', '1'], segments, [])

			const walId = await wal.begin({
				model: 'Test',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Simulate crash - only first segment deleted
			await adapter.delete(segmentKey0)

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)

			// Both segments should be deleted
			expect(await adapter.get(segmentKey0)).toBeUndefined()
			expect(await adapter.get(segmentKey1)).toBeUndefined()
		})

		it('should rollback segmented delete and restore segments', async () => {
			const segmentKey0 = buildModelKey('Test', 'seg:record-1:0')
			const segmentKey1 = buildModelKey('Test', 'seg:record-1:1')
			const segments: SegmentWrite[] = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"record-1",' },
				{ segmentKey: segmentKey1, index: 1, data: '"data":"value"}' }
			]

			const deltas = buildDeleteSegmentedDeltas('record-1', ['0', '1'], segments, [])

			const walId = await wal.begin({
				model: 'Test',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate partial delete - segments were deleted
			// (no adapter.set calls, simulating they were deleted)

			// Make entry stale
			const entryKey = WAL_ENTRY_PREFIX + walId
			const entry = (await adapter.get(entryKey)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(entryKey, entry)

			// Run recovery - should rollback and restore segments
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.rolledBack).toBe(1)

			// Segments should be restored
			expect(await adapter.get(segmentKey0)).toBe('{"id":"record-1",')
			expect(await adapter.get(segmentKey1)).toBe('"data":"value"}')
		})

		it('should handle segmented update recovery', async () => {
			const segmentKey0 = buildModelKey('Test', 'seg:record-1:0')
			const segmentKey1 = buildModelKey('Test', 'seg:record-1:1')
			const segmentKey2 = buildModelKey('Test', 'seg:record-1:2')

			// Pre-populate with old data (2 segments)
			await adapter.set(segmentKey0, '{"id":"record-1",')
			await adapter.set(segmentKey1, '"old":"data"}')

			const oldSegments: SegmentWrite[] = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"record-1",' },
				{ segmentKey: segmentKey1, index: 1, data: '"old":"data"}' }
			]
			const newSegments: SegmentWrite[] = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"record-1",' },
				{ segmentKey: segmentKey1, index: 1, data: '"new":"updated",' },
				{ segmentKey: segmentKey2, index: 2, data: '"extra":"segment"}' }
			]

			const deltas = buildUpdateSegmentedDeltas(
				'record-1',
				['0', '1'],
				oldSegments,
				['0', '1', '2'],
				newSegments,
				[]
			)

			const walId = await wal.begin({
				model: 'Test',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Simulate crash - only first segment was updated
			await adapter.set(segmentKey0, '{"id":"record-1",')

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)

			// All new segments should exist
			expect(await adapter.get(segmentKey0)).toBe('{"id":"record-1",')
			expect(await adapter.get(segmentKey1)).toBe('"new":"updated",')
			expect(await adapter.get(segmentKey2)).toBe('"extra":"segment"}')
		})

		it('should replay even if stale when past pending phase for segments', async () => {
			const segmentKey0 = buildModelKey('Test', 'seg:record-1:0')
			const segments: SegmentWrite[] = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"record-1"}' }
			]

			const deltas = buildCreateSegmentedDeltas('record-1', ['0'], segments, [])

			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Make it stale
			const entryKey = WAL_ENTRY_PREFIX + walId
			const entry = (await adapter.get(entryKey)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 10000
			await adapter.set(entryKey, entry)

			// Run recovery - should still replay because past pending phase
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1) // Replay, not rollback

			expect(await adapter.get(segmentKey0)).toBe('{"id":"record-1"}')
		})

		it('should find no entries after completed segmented operation', async () => {
			const segmentKey0 = buildModelKey('Test', 'seg:record-1:0')
			const segments: SegmentWrite[] = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"record-1"}' }
			]

			const deltas = buildCreateSegmentedDeltas('record-1', ['0'], segments, [])

			// Full successful create with WAL
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')
			await adapter.set(segmentKey0, '{"id":"record-1"}')
			await wal.markPhase(walId, 'derived')
			await wal.complete(walId)

			// Run recovery - nothing to do
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(0)

			// Segment remains intact
			expect(await adapter.get(segmentKey0)).toBe('{"id":"record-1"}')
		})
	})
})
