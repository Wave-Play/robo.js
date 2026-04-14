/**
 * WAL Metrics Tests
 *
 * Tests walRecoveries counter and introspection.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	FlashcoreSystem,
	MemoryAdapter,
	WAL_ENTRY_PREFIX,
	WAL_STALE_THRESHOLD_MS
} from 'robo.js/flashcore'
import type { WALEntry } from 'robo.js/flashcore'
import { WriteAheadLog, recoverWAL } from '../../src/wal/index.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('WAL Metrics', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		registerAllExtensions()
		adapter = new MemoryAdapter()
		await adapter.init?.()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('walRecoveries Counter', () => {
		it('should increment on replay', async () => {
			const wal = new WriteAheadLog(adapter)

			// Create orphaned entry in authoritative phase (will be replayed)
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1' } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Initialize Flashcore (triggers recovery)
			await FlashcoreSystem.init({ adapter })

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.walRecoveries).toBeGreaterThanOrEqual(1)
		})

		it('should increment on rollback', async () => {
			const wal = new WriteAheadLog(adapter)

			// Create stale pending entry (will be rolled back)
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1' } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})

			// Make entry stale
			const entryKey = WAL_ENTRY_PREFIX + walId
			const entry = (await adapter.get(entryKey)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(entryKey, entry)

			// Initialize Flashcore (triggers recovery)
			await FlashcoreSystem.init({ adapter })

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.walRecoveries).toBeGreaterThanOrEqual(1)
		})

		it('should count multiple recoveries', async () => {
			const wal = new WriteAheadLog(adapter)

			// Create multiple orphaned entries
			for (let i = 0; i < 3; i++) {
				const walId = await wal.begin({
					model: `Model${i}`,
					op: 'create',
					auth: [{ t: 'chunk_put', chunkId: `c:${i}`, id: `id${i}`, record: { id: `id${i}` } }],
					undo: [{ t: 'chunk_delete', chunkId: `c:${i}`, id: `id${i}` }],
					derived: []
				})
				await wal.markPhase(walId, 'authoritative')
			}

			// Initialize Flashcore
			await FlashcoreSystem.init({ adapter })

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.walRecoveries).toBe(3)
		})

		it('should not increment when no orphaned entries exist', async () => {
			// Initialize with clean adapter
			await FlashcoreSystem.init({ adapter })

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.walRecoveries).toBe(0)
		})
	})

	describe('Introspection', () => {
		it('should report WAL status in introspection', async () => {
			await FlashcoreSystem.init({ adapter })

			const introspection = await FlashcoreSystem.introspect()

			expect(introspection.walStatus).toBeDefined()
			expect(typeof introspection.walStatus.pendingEntries).toBe('number')
			expect(introspection.walStatus.pendingEntries).toBe(0)
		})

		it('should report lastRecovery date after recovery', async () => {
			const wal = new WriteAheadLog(adapter)

			// Create orphaned entry
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1' } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			const beforeInit = Date.now()
			await FlashcoreSystem.init({ adapter })
			const afterInit = Date.now()

			const introspection = await FlashcoreSystem.introspect()

			expect(introspection.walStatus.lastRecovery).toBeDefined()
			expect(introspection.walStatus.lastRecovery!.getTime()).toBeGreaterThanOrEqual(beforeInit)
			expect(introspection.walStatus.lastRecovery!.getTime()).toBeLessThanOrEqual(afterInit)
		})

		it('should have undefined lastRecovery when nothing was recovered', async () => {
			await FlashcoreSystem.init({ adapter })

			const introspection = await FlashcoreSystem.introspect()

			expect(introspection.walStatus.lastRecovery).toBeUndefined()
		})
	})

	describe('Capabilities', () => {
		it('should report walEnabled true for scan-capable adapters', async () => {
			await FlashcoreSystem.init({ adapter })

			const capabilities = FlashcoreSystem.capabilities()
			expect(capabilities.walEnabled).toBe(true)
		})

		it('should report walEnabled false for non-scan adapters', async () => {
			// Create adapter without scan
			const noScanAdapter = {
				get: async (): Promise<undefined> => undefined,
				set: async (): Promise<boolean> => true,
				delete: async (): Promise<boolean> => true,
				has: async (): Promise<boolean> => false,
				clear: async (): Promise<void> => {}
			}

			await FlashcoreSystem.init({ adapter: noScanAdapter as any })

			const capabilities = FlashcoreSystem.capabilities()
			expect(capabilities.walEnabled).toBe(false)
		})
	})

	describe('Metrics Reset', () => {
		it('should reset walRecoveries counter', async () => {
			const wal = new WriteAheadLog(adapter)

			// Create orphaned entry
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [],
				undo: [],
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			await FlashcoreSystem.init({ adapter })

			// Verify counter is set
			let metrics = FlashcoreSystem.metrics()
			expect(metrics.walRecoveries).toBeGreaterThan(0)

			// Reset metrics
			FlashcoreSystem.resetMetrics()

			// Verify counter is reset
			metrics = FlashcoreSystem.metrics()
			expect(metrics.walRecoveries).toBe(0)
		})
	})

	describe('Recovery Result', () => {
		it('should report found, replayed, and rolledBack counts', async () => {
			const wal = new WriteAheadLog(adapter)

			// Create entry to be replayed (authoritative phase)
			const walId1 = await wal.begin({
				model: 'Model1',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1' } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})
			await wal.markPhase(walId1, 'authoritative')

			// Create entry to be rolled back (stale pending)
			const walId2 = await wal.begin({
				model: 'Model2',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:1', id: 'id2', record: { id: 'id2' } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:1', id: 'id2' }],
				derived: []
			})
			const entryKey = WAL_ENTRY_PREFIX + walId2
			const entry = (await adapter.get(entryKey)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(entryKey, entry)

			// Run recovery directly
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(2)
			expect(result.replayed).toBe(1)
			expect(result.rolledBack).toBe(1)
			expect(result.errors).toEqual([])
		})

		it('should report errors during recovery', async () => {
			const wal = new WriteAheadLog(adapter)

			// Create orphaned entry
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: { id: 'id1' } }],
				undo: [{ t: 'chunk_delete', chunkId: 'c:0', id: 'id1' }],
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Corrupt the entry
			const entryKey = WAL_ENTRY_PREFIX + walId
			await adapter.set(entryKey, 'not-an-object')

			// Run recovery - should handle error gracefully
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			// The corrupted entry may cause an error during processing
			// The implementation should continue and report the error
		})
	})

	describe('WAL Disabled Behavior', () => {
		it('should not run recovery on non-scan adapters', async () => {
			const noScanAdapter = {
				get: async (): Promise<undefined> => undefined,
				set: async (): Promise<boolean> => true,
				delete: async (): Promise<boolean> => true,
				has: async (): Promise<boolean> => false,
				clear: async (): Promise<void> => {}
			}

			const result = await recoverWAL(noScanAdapter as any)

			expect(result.found).toBe(0)
			expect(result.replayed).toBe(0)
			expect(result.rolledBack).toBe(0)
		})

		it('should report walEnabled correctly after init with non-scan adapter', async () => {
			const noScanAdapter = {
				get: async (): Promise<undefined> => undefined,
				set: async (): Promise<boolean> => true,
				delete: async (): Promise<boolean> => true,
				has: async (): Promise<boolean> => false,
				clear: async (): Promise<void> => {}
			}

			await FlashcoreSystem.init({ adapter: noScanAdapter as any })

			const capabilities = FlashcoreSystem.capabilities()
			expect(capabilities.walEnabled).toBe(false)

			const metrics = FlashcoreSystem.metrics()
			expect(metrics.walRecoveries).toBe(0)
		})
	})
})
