/**
 * Crash Recovery Tests - Update Operation
 *
 * Tests recovery from crashes at each phase of update operation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	FlashcoreSystem,
	MemoryAdapter,
	WAL_ENTRY_PREFIX,
	WAL_STALE_THRESHOLD_MS
} from 'robo.js/flashcore'
import type { WALEntry } from 'robo.js/flashcore'
import { WriteAheadLog, buildUpdateDeltas, recoverWAL } from '../../src/wal/index.js'

describe('Crash Recovery - Update Operation', () => {
	let adapter: MemoryAdapter
	let wal: WriteAheadLog

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		wal = new WriteAheadLog(adapter)

		// Set up initial data for update tests
		await adapter.set('_model:User:chunk:0', {
			user1: { id: 'user1', name: 'Alice', email: 'alice@test.com', age: 25 },
			user2: { id: 'user2', name: 'Bob', email: 'bob@test.com', age: 30 }
		})
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Crash Before WAL Write', () => {
		it('should leave record unchanged if crash occurs before WAL begin', async () => {
			// No WAL entry created - crash before begin
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(0)

			// Record unchanged
			const chunk = (await adapter.get('_model:User:chunk:0')) as Record<string, unknown>
			expect(chunk['user1']).toEqual({
				id: 'user1',
				name: 'Alice',
				email: 'alice@test.com',
				age: 25
			})
		})
	})

	describe('Crash in Pending Phase', () => {
		it('should replay recent pending update', async () => {
			const chunkKey = '_model:User:chunk:0'
			const patch = { name: 'Alice Updated', age: 26 }
			const inversePatch = { name: 'Alice', age: 25 }

			// Create WAL entry for update
			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, [])
			await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Crash before update was applied
			// Record still has old values

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)

			// Verify record is now updated
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user1']).toEqual({
				id: 'user1',
				name: 'Alice Updated',
				email: 'alice@test.com',
				age: 26
			})
		})

		it('should rollback stale pending update', async () => {
			const chunkKey = '_model:User:chunk:0'
			const patch = { name: 'Alice Changed' }
			const inversePatch = { name: 'Alice' }

			// Create WAL entry
			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate partial update before crash
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			chunk['user1'] = { ...chunk['user1'] as object, name: 'Alice Changed' }
			await adapter.set(chunkKey, chunk)

			// Make entry stale
			const entryKey = WAL_ENTRY_PREFIX + walId
			const entry = (await adapter.get(entryKey)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(entryKey, entry)

			// Run recovery - should rollback
			const result = await recoverWAL(adapter)

			expect(result.found).toBe(1)
			expect(result.rolledBack).toBe(1)

			// Verify record is reverted
			const recoveredChunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect((recoveredChunk['user1'] as Record<string, unknown>).name).toBe('Alice')
		})
	})

	describe('Crash in Authoritative Phase', () => {
		it('should replay update that reached authoritative phase', async () => {
			const chunkKey = '_model:User:chunk:0'
			const patch = { email: 'newalice@test.com' }
			const inversePatch = { email: 'alice@test.com' }

			// Create and mark authoritative
			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.replayed).toBe(1)

			// Verify update applied
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect((chunk['user1'] as Record<string, unknown>).email).toBe('newalice@test.com')
		})

		it('should complete partial update on recovery', async () => {
			const chunkKey = '_model:User:chunk:0'
			const patch = { name: 'New Name', age: 99 }
			const inversePatch = { name: 'Alice', age: 25 }

			// Create and mark authoritative
			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Simulate partial update (only name changed, not age)
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			const user = chunk['user1'] as Record<string, unknown>
			user.name = 'New Name' // but age is still 25
			await adapter.set(chunkKey, chunk)

			// Run recovery - should complete the patch
			await recoverWAL(adapter)

			// Verify both fields are updated
			const recovered = (await adapter.get(chunkKey)) as Record<string, unknown>
			const recoveredUser = recovered['user1'] as Record<string, unknown>
			expect(recoveredUser.name).toBe('New Name')
			expect(recoveredUser.age).toBe(99)
		})
	})

	describe('Crash in Derived Phase', () => {
		it('should replay update in derived phase', async () => {
			const chunkKey = '_model:User:chunk:0'
			const patch = { age: 50 }
			const inversePatch = { age: 25 }

			// Create, mark authoritative, mark derived
			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')
			await wal.markPhase(walId, 'derived')

			// Authoritative writes should be done
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			chunk['user1'] = { ...chunk['user1'] as object, age: 50 }
			await adapter.set(chunkKey, chunk)

			// Run recovery
			const result = await recoverWAL(adapter)

			expect(result.replayed).toBe(1)

			// Verify update is still there (idempotent)
			const recovered = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect((recovered['user1'] as Record<string, unknown>).age).toBe(50)
		})
	})

	describe('Unique Constraint Updates', () => {
		it('should handle unique constraint change on recovery', async () => {
			const chunkKey = '_model:User:chunk:0'
			const oldUniqueKey = '_idx:User:email:alice@test.com'
			const newUniqueKey = '_idx:User:email:newalice@test.com'

			// Set up initial unique constraint
			await adapter.set(oldUniqueKey, { id: 'user1' })

			const patch = { email: 'newalice@test.com' }
			const inversePatch = { email: 'alice@test.com' }
			const uniqueUpdates = [{
				oldKey: oldUniqueKey,
				newKey: newUniqueKey,
				id: 'user1'
			}]

			// Create update with unique constraint change
			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, uniqueUpdates)
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery
			await recoverWAL(adapter)

			// Verify old unique key is released
			expect(await adapter.get(oldUniqueKey)).toBeUndefined()

			// Verify new unique key is acquired
			expect(await adapter.get(newUniqueKey)).toEqual({ id: 'user1' })
		})

		it('should revert unique constraint on rollback', async () => {
			const chunkKey = '_model:User:chunk:0'
			const oldUniqueKey = '_idx:User:email:bob@test.com'
			const newUniqueKey = '_idx:User:email:newbob@test.com'

			// Set up initial unique constraint
			await adapter.set(oldUniqueKey, { id: 'user2' })

			const patch = { email: 'newbob@test.com' }
			const inversePatch = { email: 'bob@test.com' }
			const uniqueUpdates = [{
				oldKey: oldUniqueKey,
				newKey: newUniqueKey,
				id: 'user2'
			}]

			// Create WAL entry
			const deltas = buildUpdateDeltas(chunkKey, 'user2', patch, inversePatch, uniqueUpdates)
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate partial update - new unique acquired, old not yet released
			await adapter.set(newUniqueKey, { id: 'user2' })
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			chunk['user2'] = { ...chunk['user2'] as object, email: 'newbob@test.com' }
			await adapter.set(chunkKey, chunk)

			// Make stale
			const entry = (await adapter.get(WAL_ENTRY_PREFIX + walId)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(WAL_ENTRY_PREFIX + walId, entry)

			// Run recovery - should rollback
			await recoverWAL(adapter)

			// Verify old unique key is restored
			expect(await adapter.get(oldUniqueKey)).toEqual({ id: 'user2' })

			// Verify new unique key is released
			expect(await adapter.get(newUniqueKey)).toBeUndefined()

			// Verify record is reverted
			const recovered = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect((recovered['user2'] as Record<string, unknown>).email).toBe('bob@test.com')
		})
	})

	describe('Multi-field Updates', () => {
		it('should atomically apply all field updates on replay', async () => {
			const chunkKey = '_model:User:chunk:0'
			const patch = { name: 'Completely New Name', email: 'new@email.com', age: 100 }
			const inversePatch = { name: 'Alice', email: 'alice@test.com', age: 25 }

			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery
			await recoverWAL(adapter)

			// Verify all fields updated
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			const user = chunk['user1'] as Record<string, unknown>
			expect(user.name).toBe('Completely New Name')
			expect(user.email).toBe('new@email.com')
			expect(user.age).toBe(100)
		})

		it('should atomically revert all field updates on rollback', async () => {
			const chunkKey = '_model:User:chunk:0'
			const patch = { name: 'Updated', email: 'updated@email.com', age: 50 }
			const inversePatch = { name: 'Bob', email: 'bob@test.com', age: 30 }

			const deltas = buildUpdateDeltas(chunkKey, 'user2', patch, inversePatch, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Simulate partial update - only some fields changed
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			chunk['user2'] = { ...chunk['user2'] as object, name: 'Updated', age: 50 }
			await adapter.set(chunkKey, chunk)

			// Make stale
			const entry = (await adapter.get(WAL_ENTRY_PREFIX + walId)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(WAL_ENTRY_PREFIX + walId, entry)

			// Run recovery
			await recoverWAL(adapter)

			// Verify all fields reverted
			const recovered = (await adapter.get(chunkKey)) as Record<string, unknown>
			const user = recovered['user2'] as Record<string, unknown>
			expect(user.name).toBe('Bob')
			expect(user.email).toBe('bob@test.com')
			expect(user.age).toBe(30)
		})
	})

	describe('Other Records Unaffected', () => {
		it('should not affect other records in same chunk during replay', async () => {
			const chunkKey = '_model:User:chunk:0'
			const patch = { name: 'Alice Changed' }
			const inversePatch = { name: 'Alice' }

			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})
			await wal.markPhase(walId, 'authoritative')

			// Run recovery
			await recoverWAL(adapter)

			// Verify user2 is unaffected
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user2']).toEqual({
				id: 'user2',
				name: 'Bob',
				email: 'bob@test.com',
				age: 30
			})
		})

		it('should not affect other records in same chunk during rollback', async () => {
			const chunkKey = '_model:User:chunk:0'
			const patch = { name: 'Alice Changed' }
			const inversePatch = { name: 'Alice' }

			const deltas = buildUpdateDeltas(chunkKey, 'user1', patch, inversePatch, [])
			const walId = await wal.begin({
				model: 'User',
				op: 'update',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			// Make stale
			const entry = (await adapter.get(WAL_ENTRY_PREFIX + walId)) as WALEntry
			entry.timestamp = Date.now() - WAL_STALE_THRESHOLD_MS - 1000
			await adapter.set(WAL_ENTRY_PREFIX + walId, entry)

			// Run recovery
			await recoverWAL(adapter)

			// Verify user2 is unaffected
			const chunk = (await adapter.get(chunkKey)) as Record<string, unknown>
			expect(chunk['user2']).toEqual({
				id: 'user2',
				name: 'Bob',
				email: 'bob@test.com',
				age: 30
			})
		})
	})
})
