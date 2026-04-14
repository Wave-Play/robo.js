/**
 * Crash Recovery Tests - Delete Operation
 *
 * Tests recovery from crashes at each phase of delete operation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	FlashcoreSystem,
	MemoryAdapter,
	WAL_ENTRY_PREFIX,
	WAL_STALE_THRESHOLD_MS
} from 'robo.js/flashcore'
import type { WALEntry } from 'robo.js/flashcore'
import { WriteAheadLog, buildDeleteDeltas, recoverWAL } from '../../src/wal/index.js'

describe('Crash Recovery - Delete Operation', () => {
	let adapter: MemoryAdapter
	let wal: WriteAheadLog

	const initialData = {
		user1: { id: 'user1', name: 'Alice', email: 'alice@test.com' },
		user2: { id: 'user2', name: 'Bob', email: 'bob@test.com' },
		user3: { id: 'user3', name: 'Charlie', email: 'charlie@test.com' }
	}

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		wal = new WriteAheadLog(adapter)

		// Set up initial data for delete tests
		await adapter.set('_model:User:chunk:0', { ...initialData })

		// Set up unique constraints
		await adapter.set('_idx:User:email:alice@test.com', { id: 'user1' })
		await adapter.set('_idx:User:email:bob@test.com', { id: 'user2' })
		await adapter.set('_idx:User:email:charlie@test.com', { id: 'user3' })
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Crash Before WAL Write', () => {
		it('should leave record intact if crash occurs before WAL begin', async () => {
			// No WAL entry created - crash before begin
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(0)

			// Record unchanged
			const chunk = (await adapter.get('_model:User:chunk:0')) as Record<string, unknown>
			expect(chunk['user1']).toEqual(initialData.user1)
		})
	})

	describe('Crash in Pending Phase', () => {
		it('should replay recent pending delete', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = initialData.user1
			const uniqueKeys = [{ key: '_idx:User:email:alice@test.com', id: 'user1' }]

			// Create WAL entry for delete
			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user1', record, uniqueKeys)
			await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Crash before delete was applied - record still exists

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)

			// Verify record is deleted
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toBeUndefined()

			// Verify unique constraint is released
			expect(await adapter.get('_idx:User:email:alice@test.com')).toBeUndefined()
		})

		it('should rollback stale pending delete and restore record', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = initialData.user1
			const uniqueKeys = [{ key: '_idx:User:email:alice@test.com', id: 'user1' }]

			// Create WAL entry
			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user1', record, uniqueKeys)
			const walId = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate partial delete - record removed but WAL entry still pending
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			delete chunk['user1']
			await adapter.set(chunkKey, chunk)
			await adapter.delete('_idx:User:email:alice@test.com')

			// Make entry stale
			const entryKey = WAL_ENTRY_PREFIX + walId
			const entry = (await adapter.get(entryKey)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(entryKey, entry)

			// Run recovery - should rollback
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.rolledBack).toBe(1)

			// Verify record is restored
			const recoveredChunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(recoveredChunk['user1']).toEqual(record)

			// Verify unique constraint is restored
			expect(await adapter.get('_idx:User:email:alice@test.com')).toEqual({ id: 'user1' })
		})
	})

	describe('Crash in Authoritative Phase', () => {
		it('should replay delete that reached authoritative phase', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = initialData.user2
			const uniqueKeys = [{ key: '_idx:User:email:bob@test.com', id: 'user2' }]

			// Create and mark authoritative
			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user2', record, uniqueKeys)
			const walId = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Record still exists (crash before delete completed)

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.replayed).toBe(1)

			// Verify record is deleted
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user2']).toBeUndefined()

			// Other records unaffected
			expect(chunk['user1']).toEqual(initialData.user1)
			expect(chunk['user3']).toEqual(initialData.user3)
		})

		it('should complete partial delete on recovery', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = initialData.user3
			const uniqueKeys = [{ key: '_idx:User:email:charlie@test.com', id: 'user3' }]

			// Create and mark authoritative
			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user3', record, uniqueKeys)
			const walId = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Simulate partial delete - record removed but unique key not released
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			delete chunk['user3']
			await adapter.set(chunkKey, chunk)
			// unique key still exists

			// Run recovery
			await recoverWAL(adapter)

			// Verify record is still deleted
			const recovered = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(recovered['user3']).toBeUndefined()

			// Verify unique constraint is released
			expect(await adapter.get('_idx:User:email:charlie@test.com')).toBeUndefined()
		})
	})

	describe('Crash in Derived Phase', () => {
		it('should replay delete in derived phase', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = initialData.user1
			const uniqueKeys = [{ key: '_idx:User:email:alice@test.com', id: 'user1' }]

			// Create, mark authoritative, mark derived
			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user1', record, uniqueKeys)
			const walId = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')
			await wal.markPhase(walId, 'derived')

			// Authoritative writes should be done - record deleted
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			delete chunk['user1']
			await adapter.set(chunkKey, chunk)
			await adapter.delete('_idx:User:email:alice@test.com')

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.replayed).toBe(1)

			// Verify delete is idempotent
			const recovered = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(recovered['user1']).toBeUndefined()
		})
	})

	describe('Full Record Preservation in WAL', () => {
		it('should store full record in undo deltas for rollback', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = {
				id: 'user1',
				name: 'Alice',
				email: 'alice@test.com',
				complex: {
					nested: {
						value: [1, 2, 3]
					}
				}
			}

			// Update initial data with complex record
			await adapter.set(chunkKey, { user1: record })

			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user1', record, [])

			// Verify full record is in undo deltas
			const putDelta = deltas.undo.find(d => d.t === 'chunk_put')
			expect(putDelta).toBeDefined()
			expect((putDelta as any).record).toEqual(record)
		})

		it('should restore complex record on rollback', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = {
				id: 'user1',
				name: 'Alice',
				email: 'alice@test.com',
				metadata: {
					createdAt: '2024-01-01',
					tags: ['admin', 'active'],
					settings: { theme: 'dark' }
				}
			}

			await adapter.set(chunkKey, { user1: record })

			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate delete completed
			await adapter.set(chunkKey, {})

			// Make stale
			const entry = (await adapter.get(WAL_ENTRY_PREFIX + walId)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(WAL_ENTRY_PREFIX + walId, entry)

			// Run recovery - should restore full record
			await recoverWAL(adapter)

			const recovered = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(recovered['user1']).toEqual(record)
		})
	})

	describe('Multiple Unique Constraints', () => {
		it('should release all unique constraints on delete replay', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0

			// Set up record with multiple unique fields
			const record = { id: 'user1', email: 'alice@test.com', username: 'alice123' }
			await adapter.set(chunkKey, { user1: record })
			await adapter.set('_idx:User:username:alice123', { id: 'user1' })

			const uniqueKeys = [
				{ key: '_idx:User:email:alice@test.com', id: 'user1' },
				{ key: '_idx:User:username:alice123', id: 'user1' }
			]

			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user1', record, uniqueKeys)
			const walId = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery
			await recoverWAL(adapter)

			// All unique constraints released
			expect(await adapter.get('_idx:User:email:alice@test.com')).toBeUndefined()
			expect(await adapter.get('_idx:User:username:alice123')).toBeUndefined()
		})

		it('should restore all unique constraints on rollback', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = { id: 'user1', email: 'alice@test.com', username: 'alice123' }
			await adapter.set(chunkKey, { user1: record })
			await adapter.set('_idx:User:username:alice123', { id: 'user1' })

			const uniqueKeys = [
				{ key: '_idx:User:email:alice@test.com', id: 'user1' },
				{ key: '_idx:User:username:alice123', id: 'user1' }
			]

			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user1', record, uniqueKeys)
			const walId = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate complete delete
			await adapter.set(chunkKey, {})
			await adapter.delete('_idx:User:email:alice@test.com')
			await adapter.delete('_idx:User:username:alice123')

			// Make stale
			const entry = (await adapter.get(WAL_ENTRY_PREFIX + walId)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(WAL_ENTRY_PREFIX + walId, entry)

			// Run recovery
			await recoverWAL(adapter)

			// Record restored
			const recovered = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(recovered['user1']).toEqual(record)

			// All unique constraints restored
			expect(await adapter.get('_idx:User:email:alice@test.com')).toEqual({ id: 'user1' })
			expect(await adapter.get('_idx:User:username:alice123')).toEqual({ id: 'user1' })
		})
	})

	describe('Multiple Deletes', () => {
		it('should handle multiple delete recoveries', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0

			// Create delete WAL entries for multiple records
			for (let i = 1; i <= 3; i++) {
				const record = (initialData as Record<string, unknown>)[`user${i}`]
				const uniqueKey = `_idx:User:email:${(record as Record<string, unknown>).email}`
				const deltas = buildDeleteDeltas(chunkKey, chunkId, `user${i}`, record, [{ key: uniqueKey, id: `user${i}` }])

				const walId = await wal.begin({
					model: 'User',
					op: 'delete',
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

			// All records deleted
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(Object.keys(chunk).length).toBe(0)

			// All unique constraints released
			expect(await adapter.get('_idx:User:email:alice@test.com')).toBeUndefined()
			expect(await adapter.get('_idx:User:email:bob@test.com')).toBeUndefined()
			expect(await adapter.get('_idx:User:email:charlie@test.com')).toBeUndefined()
		})
	})

	describe('Delete Idempotence', () => {
		it('should be idempotent when record already deleted', async () => {
			const chunkKey = '_model:User:chunk:0'
			const chunkId = 0
			const record = initialData.user1

			const deltas = buildDeleteDeltas(chunkKey, chunkId, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Record was already deleted before recovery
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			delete chunk['user1']
			await adapter.set(chunkKey, chunk)

			// Run recovery multiple times
			await recoverWAL(adapter)

			// Other records still intact
			const recovered = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(recovered['user2']).toEqual(initialData.user2)
			expect(recovered['user3']).toEqual(initialData.user3)
		})
	})
})
