/**
 * Crash Recovery Tests - Create Operation
 *
 * Tests recovery from crashes at each phase of create operation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	FlashcoreSystem,
	MemoryAdapter,
	WAL_ENTRY_PREFIX,
	WAL_STALE_THRESHOLD_MS
} from 'robo.js/flashcore'
import type { WALEntry } from 'robo.js/flashcore'
import { WriteAheadLog, buildCreateDeltas, recoverWAL } from '../../src/wal/index.js'

describe('Crash Recovery - Create Operation', () => {
	let adapter: MemoryAdapter
	let wal: WriteAheadLog

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		wal = new WriteAheadLog(adapter)
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Crash Before WAL Write', () => {
		it('should leave no trace if crash occurs before WAL begin', async () => {
			// Simulate: crash happens before wal.begin() is called
			// No WAL entry exists, no recovery needed

			const result = await recoverWAL(adapter)

			expect(result.found).toBe(0)
			expect(result.replayed).toBe(0)
			expect(result.rolledBack).toBe(0)
		})
	})

	describe('Crash in Pending Phase', () => {
		it('should replay recent pending entry', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = { id: 'user1', name: 'Alice', email: 'alice@test.com' }

			// Create WAL entry but don't complete (simulating crash after begin)
			const deltas = buildCreateDeltas(chunkKey, chunkId, 'user1', record, [])
			await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Verify record is NOT in storage yet (crash was before writes)
			expect(await adapter.get(chunkKey)).toBeUndefined()

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)
			expect(result.rolledBack).toBe(0)

			// Verify record is now in storage
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual(record)
		})

		it('should rollback stale pending entry', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = { id: 'user1', name: 'Bob' }

			// Create WAL entry
			const deltas = buildCreateDeltas(chunkKey, chunkId, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate partial writes before crash
			const chunk = { user1: record }
			await adapter.set(chunkKey, chunk)

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

			// Verify record is removed (rolled back)
			const recoveredChunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(recoveredChunk['user1']).toBeUndefined()
		})
	})

	describe('Crash in Authoritative Phase', () => {
		it('should replay entry that reached authoritative phase', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = { id: 'user1', name: 'Charlie' }

			// Create WAL entry and mark authoritative
			const deltas = buildCreateDeltas(chunkKey, chunkId, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Simulate crash before all authoritative writes completed
			// (only partial writes done)
			await adapter.set(chunkKey, {}) // Empty chunk

			// Run recovery - should replay and complete the create
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)

			// Verify record is now in storage
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual(record)
		})

		it('should replay even if stale when past pending phase', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = { id: 'user1', name: 'Diana' }

			// Create WAL entry and mark authoritative
			const deltas = buildCreateDeltas(chunkKey, chunkId, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
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

			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual(record)
		})
	})

	describe('Crash in Derived Phase', () => {
		it('should replay entry in derived phase', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = { id: 'user1', name: 'Eve' }

			// Create WAL entry and mark derived
			const deltas = buildCreateDeltas(chunkKey, chunkId, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')
			await wal.markPhase(walId, 'derived')

			// Simulate crash - authoritative writes should be done
			await adapter.set(chunkKey, { user1: record })

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)

			// Record should still be there (idempotent replay)
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual(record)
		})
	})

	describe('Crash After Complete', () => {
		it('should find no entries if crash was after complete', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = { id: 'user1', name: 'Frank' }

			// Full successful create with WAL
			const deltas = buildCreateDeltas(chunkKey, chunkId, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')
			await adapter.set(chunkKey, { user1: record })
			await wal.markPhase(walId, 'derived')
			await wal.complete(walId)

			// Run recovery - nothing to do
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(0)

			// Record remains intact
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual(record)
		})
	})

	describe('Unique Constraints', () => {
		it('should replay unique constraint acquisition on recovery', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const uniqueKey = '_idx:User:email:alice@test.com'
			const record = { id: 'user1', name: 'Alice', email: 'alice@test.com' }

			// Create with unique key
			const uniqueKeys = [{ key: uniqueKey, id: 'user1' }]
			const deltas = buildCreateDeltas(chunkKey, chunkId, 'user1', record, uniqueKeys)

			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Simulate crash - unique key not yet acquired
			expect(await adapter.get(uniqueKey)).toBeUndefined()

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.replayed).toBe(1)

			// Verify unique key is now acquired
			const uniqueEntry = await adapter.get(uniqueKey)
			expect(uniqueEntry).toEqual({ id: 'user1' })
		})

		it('should release unique constraint on rollback', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const uniqueKey = '_idx:User:email:bob@test.com'
			const record = { id: 'user1', name: 'Bob', email: 'bob@test.com' }

			// Create with unique key
			const uniqueKeys = [{ key: uniqueKey, id: 'user1' }]
			const deltas = buildCreateDeltas(chunkKey, chunkId, 'user1', record, uniqueKeys)

			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate partial writes - unique key was acquired
			await adapter.set(uniqueKey, { id: 'user1' })
			await adapter.set(chunkKey, { user1: record })

			// Make entry stale
			const entryKey = WAL_ENTRY_PREFIX + walId
			const entry = (await adapter.get(entryKey)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(entryKey, entry)

			// Run recovery - should rollback
			const result = await recoverWAL(adapter)

			expect(result.rolledBack).toBe(1)

			// Verify unique key is released
			expect(await adapter.get(uniqueKey)).toBeUndefined()

			// Verify record is removed
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toBeUndefined()
		})
	})

	describe('Multiple Records', () => {
		it('should recover multiple concurrent creates', async () => {
			// Create multiple orphaned WAL entries
			for (let i = 1; i <= 3; i++) {
				const chunkId = Math.floor((i - 1) / 2)
				const chunkKey = `_model:User:chunk:${chunkId}`
				const record = { id: `user${i}`, name: `User ${i}` }
				const deltas = buildCreateDeltas(chunkKey, chunkId, `user${i}`, record, [])

				const walId = await wal.begin({
					model: 'User',
					op: 'create',
					auth: deltas.auth,
					undo: deltas.undo,
					derived: []
				})
				await wal.markPhase(walId, 'authoritative')
			}

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(3)
			expect(result.replayed).toBe(3)

			// Verify all records are created
			const chunk0 = (await adapter.get('_model:User:chunk:0')) as Record<string, unknown>
			const chunk1 = (await adapter.get('_model:User:chunk:1')) as Record<string, unknown>

			expect(chunk0['user1']).toBeDefined()
			expect(chunk0['user2']).toBeDefined()
			expect(chunk1['user3']).toBeDefined()
		})

		it('should handle mixed replay and rollback', async () => {
			// Entry 1: authoritative (replay)
			const deltas1 = buildCreateDeltas('_model:A:chunk:0', 0, 'a1', { id: 'a1' }, [])
			const walId1 = await wal.begin({
				model: 'A',
				op: 'create',
				auth: deltas1.auth,
				undo: deltas1.undo,
				derived: []
			})
			await wal.markPhase(walId1, 'authoritative')

			// Entry 2: stale pending (rollback)
			const deltas2 = buildCreateDeltas('_model:B:chunk:0', 0, 'b1', { id: 'b1' }, [])
			const walId2 = await wal.begin({
				model: 'B',
				op: 'create',
				auth: deltas2.auth,
				undo: deltas2.undo,
				derived: []
			})
			await adapter.set('_model:B:chunk:0', { b1: { id: 'b1' } })
			const entry2 = (await adapter.get(WAL_ENTRY_PREFIX + walId2)) as WALEntry
			entry2.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(WAL_ENTRY_PREFIX + walId2, entry2)

			// Entry 3: recent pending (replay)
			const deltas3 = buildCreateDeltas('_model:C:chunk:0', 0, 'c1', { id: 'c1' }, [])
			await wal.begin({
				model: 'C',
				op: 'create',
				auth: deltas3.auth,
				undo: deltas3.undo,
				derived: []
			})

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(3)
			expect(result.replayed).toBe(2) // Entries 1 and 3
			expect(result.rolledBack).toBe(1) // Entry 2

			// Verify A is created
			const chunkA = (await adapter.get('_model:A:chunk:0')) as Record<string, unknown>
			expect(chunkA['a1']).toBeDefined()

			// Verify B is rolled back
			const chunkB = (await adapter.get('_model:B:chunk:0')) as Record<string, unknown>
			expect(chunkB['b1']).toBeUndefined()

			// Verify C is created
			const chunkC = (await adapter.get('_model:C:chunk:0')) as Record<string, unknown>
			expect(chunkC['c1']).toBeDefined()
		})
	})
})
