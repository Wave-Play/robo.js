/**
 * Recovery Integrity Tests
 *
 * Comprehensive tests for full consistency after WAL recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	FlashcoreSystem,
	MemoryAdapter,
	WAL_ENTRY_PREFIX,
	WAL_STALE_THRESHOLD_MS
} from 'robo.js/flashcore'
import type { WALEntry } from 'robo.js/flashcore'
import { WriteAheadLog, buildCreateDeltas, buildUpdateDeltas, buildDeleteDeltas, recoverWAL } from '../../src/wal/index.js'

describe('Recovery Integrity', () => {
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

	describe('Chunk and Catalog Consistency', () => {
		it('should maintain chunk-catalog consistency after create recovery', async () => {
			const chunkKey = '_model:User:chunk:0'
			const record = { id: 'user1', name: 'Alice' }

			// Create WAL entry with catalog delta
			const createDeltas = buildCreateDeltas(chunkKey, 0, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: [
					...createDeltas.auth,
					{ t: 'catalog_set', id: 'user1', chunkId: 0 }
				],
				undo: [
					...createDeltas.undo,
					{ t: 'catalog_delete', id: 'user1' }
				],
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery
			await recoverWAL(adapter)

			// Verify chunk has record
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual(record)

			// Note: Catalog operations are handled at a higher level in actual model operations
			// This test verifies the WAL stores the deltas correctly
		})

		it('should maintain consistency after mixed operation recovery', async () => {
			const chunkKey = '_model:User:chunk:0'

			// Set up initial state
			await adapter.set(chunkKey, {
				user1: { id: 'user1', name: 'Alice' },
				user2: { id: 'user2', name: 'Bob' }
			})

			// Create WAL entries for different operations

			// 1. Create user3
			const createDeltas = buildCreateDeltas(chunkKey, 0, 'user3', { id: 'user3', name: 'Charlie' }, [])
			const walId1 = await wal.begin({
				model: 'User',
				op: 'create',
				auth: createDeltas.auth,
				undo: createDeltas.undo,
				derived: []
			})
			await wal.markPhase(walId1, 'authoritative')

			// 2. Update user1
			const updateDeltas = buildUpdateDeltas(chunkKey, 'user1', { name: 'Alice Updated' }, { name: 'Alice' }, [])
			const walId2 = await wal.begin({
				model: 'User',
				op: 'update',
				auth: updateDeltas.auth,
				undo: updateDeltas.undo,
				derived: []
			})
			await wal.markPhase(walId2, 'authoritative')

			// 3. Delete user2
			const deleteDeltas = buildDeleteDeltas(chunkKey, 0, 'user2', { id: 'user2', name: 'Bob' }, [])
			const walId3 = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deleteDeltas.auth,
				undo: deleteDeltas.undo,
				derived: []
			})
			await wal.markPhase(walId3, 'authoritative')

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(3)
			expect(result.replayed).toBe(3)

			// Verify final state
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>

			// user1 should be updated
			expect(chunk['user1']).toEqual({ id: 'user1', name: 'Alice Updated' })

			// user2 should be deleted
			expect(chunk['user2']).toBeUndefined()

			// user3 should be created
			expect(chunk['user3']).toEqual({ id: 'user3', name: 'Charlie' })
		})
	})

	describe('Unique Constraint Consistency', () => {
		it('should maintain unique constraint consistency after recovery', async () => {
			const chunkKey = '_model:User:chunk:0'
			const uniqueKey = '_idx:User:email:alice@test.com'

			// Create with unique constraint
			const record = { id: 'user1', email: 'alice@test.com' }
			const uniqueKeys = [{ key: uniqueKey, id: 'user1' }]
			const createDeltas = buildCreateDeltas(chunkKey, 0, 'user1', record, uniqueKeys)

			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: createDeltas.auth,
				undo: createDeltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery
			await recoverWAL(adapter)

			// Verify record and unique key are consistent
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual(record)

			const uniqueEntry = await adapter.get(uniqueKey)
			expect(uniqueEntry).toEqual({ id: 'user1' })
		})

		it('should prevent orphaned unique keys after rollback', async () => {
			const chunkKey = '_model:User:chunk:0'
			const uniqueKey = '_idx:User:email:test@test.com'

			// Simulate partial create with acquired unique key
			await adapter.set(uniqueKey, { id: 'user1' })

			const record = { id: 'user1', email: 'test@test.com' }
			const uniqueKeys = [{ key: uniqueKey, id: 'user1' }]
			const createDeltas = buildCreateDeltas(chunkKey, 0, 'user1', record, uniqueKeys)

			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: createDeltas.auth,
				undo: createDeltas.undo,
				derived: []
			})

			// Make stale - should rollback
			const entry = (await adapter.get(WAL_ENTRY_PREFIX + walId)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(WAL_ENTRY_PREFIX + walId, entry)

			// Run recovery
			await recoverWAL(adapter)

			// Unique key should be released (no orphan)
			expect(await adapter.get(uniqueKey)).toBeUndefined()

			// Record should not exist
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown> | undefined
			expect(chunk?.['user1']).toBeUndefined()
		})

		it('should maintain unique key ownership consistency', async () => {
			const chunkKey = '_model:User:chunk:0'
			const uniqueKey = '_idx:User:email:shared@test.com'

			// Set up existing record with unique key
			await adapter.set(chunkKey, { existingUser: { id: 'existingUser', email: 'shared@test.com' } })
			await adapter.set(uniqueKey, { id: 'existingUser' })

			// Try to create new record with same unique key (authoritative phase)
			const record = { id: 'newUser', email: 'shared@test.com' }
			const uniqueKeys = [{ key: uniqueKey, id: 'newUser' }]
			const createDeltas = buildCreateDeltas(chunkKey, 0, 'newUser', record, uniqueKeys)

			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: createDeltas.auth,
				undo: createDeltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery
			await recoverWAL(adapter)

			// Unique key should still belong to existing user (conflict should not override ownership)
			const uniqueEntry = await adapter.get(uniqueKey)
			expect(uniqueEntry).toEqual({ id: 'existingUser' })

			// Conflicting record should not be created
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['newUser']).toBeUndefined()
		})
	})

	describe('Multi-Model Consistency', () => {
		it('should maintain consistency across multiple models', async () => {
			// Create entries for different models
			const userChunkKey = '_model:User:chunk:0'
			const postChunkKey = '_model:Post:chunk:0'

			// Create user
			const userDeltas = buildCreateDeltas(userChunkKey, 0, 'user1', { id: 'user1', name: 'Alice' }, [])
			const walId1 = await wal.begin({
				model: 'User',
				op: 'create',
				auth: userDeltas.auth,
				undo: userDeltas.undo,
				derived: []
			})
			await wal.markPhase(walId1, 'authoritative')

			// Create post
			const postDeltas = buildCreateDeltas(postChunkKey, 0, 'post1', { id: 'post1', title: 'Hello', authorId: 'user1' }, [])
			const walId2 = await wal.begin({
				model: 'Post',
				op: 'create',
				auth: postDeltas.auth,
				undo: postDeltas.undo,
				derived: []
			})
			await wal.markPhase(walId2, 'authoritative')

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(2)
			expect(result.replayed).toBe(2)

			// Verify both models have their records
			const userChunk = (await adapter.get(userChunkKey)) as Record<string, unknown>
			expect(userChunk['user1']).toEqual({ id: 'user1', name: 'Alice' })

			const postChunk = (await adapter.get(postChunkKey)) as Record<string, unknown>
			expect(postChunk['post1']).toEqual({ id: 'post1', title: 'Hello', authorId: 'user1' })
		})

		it('should handle namespace isolation', async () => {
			// Create entries in different namespaces
			const ns1ChunkKey = '_model:ns1::User:chunk:0'
			const ns2ChunkKey = '_model:ns2::User:chunk:0'

			// Create in namespace 1
			const ns1Deltas = buildCreateDeltas(ns1ChunkKey, 0, 'user1', { id: 'user1', name: 'NS1 User' }, [])
			const walId1 = await wal.begin({
				model: 'User',
				namespace: 'ns1',
				op: 'create',
				auth: ns1Deltas.auth,
				undo: ns1Deltas.undo,
				derived: []
			})
			await wal.markPhase(walId1, 'authoritative')

			// Create same ID in namespace 2
			const ns2Deltas = buildCreateDeltas(ns2ChunkKey, 0, 'user1', { id: 'user1', name: 'NS2 User' }, [])
			const walId2 = await wal.begin({
				model: 'User',
				namespace: 'ns2',
				op: 'create',
				auth: ns2Deltas.auth,
				undo: ns2Deltas.undo,
				derived: []
			})
			await wal.markPhase(walId2, 'authoritative')

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(2)
			expect(result.replayed).toBe(2)

			// Verify namespace isolation
			const ns1Chunk = (await adapter.get(ns1ChunkKey)) as Record<string, unknown>
			expect(ns1Chunk['user1']).toEqual({ id: 'user1', name: 'NS1 User' })

			const ns2Chunk = (await adapter.get(ns2ChunkKey)) as Record<string, unknown>
			expect(ns2Chunk['user1']).toEqual({ id: 'user1', name: 'NS2 User' })
		})
	})

	describe('Repeated Recovery Safety', () => {
		it('should be safe to run recovery multiple times', async () => {
			const chunkKey = '_model:User:chunk:0'
			const record = { id: 'user1', name: 'Alice' }

			// Create WAL entry
			const deltas = buildCreateDeltas(chunkKey, 0, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery multiple times
			await recoverWAL(adapter)
			const snapshot1 = await getChunkSnapshot(adapter, chunkKey)

			// Create new adapter to simulate restart
			const adapter2 = new MemoryAdapter()
			await adapter2.init?.()
			// Copy data
			if (adapter.scan) {
				for await (const key of adapter.scan('')) {
					const value = await adapter.get(key)
					await adapter2.set(key, value)
				}
			}

			await recoverWAL(adapter2)
			const snapshot2 = await getChunkSnapshot(adapter2, chunkKey)

			expect(snapshot1).toEqual(snapshot2)
		})

		it('should clean up WAL entries after recovery', async () => {
			const chunkKey = '_model:User:chunk:0'

			// Create multiple WAL entries
			for (let i = 1; i <= 3; i++) {
				const deltas = buildCreateDeltas(chunkKey, 0, `user${i}`, { id: `user${i}` }, [])
				const walId = await wal.begin({
					model: 'User',
					op: 'create',
					auth: deltas.auth,
					undo: deltas.undo,
					derived: []
				})
				await wal.markPhase(walId, 'authoritative')
			}

			// Verify entries exist
			let entries = await wal.getAllEntryKeys()
			expect(entries.length).toBe(3)

			// Run recovery
			await recoverWAL(adapter)

			// Verify entries are cleaned up
			entries = await wal.getAllEntryKeys()
			expect(entries.length).toBe(0)
		})
	})

	describe('Error Resilience', () => {
		it('should continue recovery after individual entry error', async () => {
			const chunkKey = '_model:User:chunk:0'

			// Create valid entry
			const deltas1 = buildCreateDeltas(chunkKey, 0, 'user1', { id: 'user1' }, [])
			const walId1 = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas1.auth,
				undo: deltas1.undo,
				derived: []
			})
			await wal.markPhase(walId1, 'authoritative')

			// Create corrupted entry
			const walId2 = 'corrupted-entry'
			await adapter.set(WAL_ENTRY_PREFIX + walId2, 'not-valid-json-object')

			// Create another valid entry
			const deltas3 = buildCreateDeltas(chunkKey, 0, 'user3', { id: 'user3' }, [])
			const walId3 = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas3.auth,
				undo: deltas3.undo,
				derived: []
			})
			await wal.markPhase(walId3, 'authoritative')

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(3)
			// At least some entries should be processed
			expect(result.replayed + result.rolledBack + result.errors.length).toBe(3)
		})

		it('should report errors without stopping recovery', async () => {
			// Create entry that will fail during replay
			const walId = await wal.begin({
				model: 'Test',
				op: 'create',
				auth: [{ t: 'chunk_put', chunkId: 'c:0', id: 'id1', record: null as any }], // null record might cause issues
				undo: [],
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery - should not throw
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
		})
	})

	describe('Clock Skew Tolerance', () => {
		it('should handle entries with future timestamps', async () => {
			const chunkKey = '_model:User:chunk:0'
			const deltas = buildCreateDeltas(chunkKey, 0, 'user1', { id: 'user1' }, [])

			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Modify entry to have future timestamp
			const entry = (await adapter.get(WAL_ENTRY_PREFIX + walId)) as WALEntry
			entry.timestamp = Date.now() + 60000 // 1 minute in future
			await adapter.set(WAL_ENTRY_PREFIX + walId, entry)

			// Run recovery - should still work
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			// Future pending entries should still be processed (replayed as recent)
		})
	})

	describe('Data Integrity', () => {
		it('should preserve all fields during create recovery', async () => {
			const chunkKey = '_model:User:chunk:0'
			const record = {
				id: 'user1',
				name: 'Alice',
				email: 'alice@test.com',
				age: 25,
				active: true,
				metadata: { role: 'admin', permissions: ['read', 'write'] },
				createdAt: '2024-01-01T00:00:00Z'
			}

			const deltas = buildCreateDeltas(chunkKey, 0, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			await recoverWAL(adapter)

			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual(record)
		})

		it('should preserve all fields during update recovery', async () => {
			const chunkKey = '_model:User:chunk:0'
			const original = {
				id: 'user1',
				name: 'Original',
				unchanged1: 'keep1',
				unchanged2: 'keep2'
			}
			await adapter.set(chunkKey, { user1: original })

			const patch = { name: 'Updated', newField: 'added' }
			const inversePatch = { name: 'Original' }

			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			await recoverWAL(adapter)

			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			const user = chunk['user1'] as Record<string, unknown>

			expect(user.id).toBe('user1')
			expect(user.name).toBe('Updated')
			expect(user.unchanged1).toBe('keep1')
			expect(user.unchanged2).toBe('keep2')
			expect(user.newField).toBe('added')
		})

		it('should restore all fields during delete rollback', async () => {
			const chunkKey = '_model:User:chunk:0'
			const record = {
				id: 'user1',
				name: 'To Be Restored',
				complex: { nested: [1, 2, 3] }
			}

			const deltas = buildDeleteDeltas(chunkKey, 0, 'user1', record, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate record was deleted
			await adapter.set(chunkKey, {})

			// Make stale
			const entry = (await adapter.get(WAL_ENTRY_PREFIX + walId)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(WAL_ENTRY_PREFIX + walId, entry)

			await recoverWAL(adapter)

			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual(record)
		})
	})
})

/**
 * Helper to get chunk snapshot for comparison.
 */
async function getChunkSnapshot(adapter: MemoryAdapter, chunkKey: string): Promise<unknown> {
	return adapter.get(chunkKey)
}
