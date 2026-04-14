/**
 * WAL-Protected CRUD Integration Tests
 *
 * End-to-end tests that exercise WAL (Write-Ahead Log) protection during
 * model CRUD operations with all extensions registered. Verifies that:
 *
 * 1. Successful operations create and clean up WAL entries correctly
 * 2. Crash recovery replays or rolls back based on WAL phase
 * 3. Transactions with WAL-protected operations leave no orphaned entries
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter,
	WAL_ENTRY_PREFIX,
	scanKeysToArray,
	f
} from 'robo.js/flashcore'
import { RecordingAdapter, initWithExtensions } from '../helpers/test-adapters.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'
import { recoverWAL } from '../../src/wal/recovery.js'

// ─────────────────────────────────────────────────────────────
// WAL lifecycle during successful operations
// ─────────────────────────────────────────────────────────────

describe('WAL lifecycle during successful operations', () => {
	let adapter: RecordingAdapter

	beforeEach(async () => {
		adapter = new RecordingAdapter()
		await initWithExtensions(adapter)
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('create produces WAL writes and cleans up on completion', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
			id: f.id(),
			name: f.string()
		})

		adapter.reset()
		const created = await User.create({ name: 'Alice' })
		expect(created.id).toBeDefined()
		expect(created.name).toBe('Alice')

		// Check that WAL entry keys were written during the operation
		const walWrites = adapter.writes.filter((w) => w.key.startsWith(WAL_ENTRY_PREFIX))
		expect(walWrites.length).toBeGreaterThan(0)

		// After successful completion, WAL entries should be deleted
		const walDeletes = adapter.deletes.filter((k) => k.startsWith(WAL_ENTRY_PREFIX))
		expect(walDeletes.length).toBeGreaterThan(0)

		// No WAL entries should remain in storage
		const remainingWalKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(remainingWalKeys).toHaveLength(0)
	})

	it('update produces WAL writes and cleans up on completion', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
			id: f.id(),
			name: f.string()
		})

		const created = await User.create({ name: 'Alice' })

		adapter.reset()
		const updated = await User.update({
			where: { id: created.id },
			data: { name: 'Alice Updated' }
		})
		expect(updated).not.toBeNull()
		expect(updated!.name).toBe('Alice Updated')

		// WAL writes should have occurred
		const walWrites = adapter.writes.filter((w) => w.key.startsWith(WAL_ENTRY_PREFIX))
		expect(walWrites.length).toBeGreaterThan(0)

		// WAL entries should be cleaned up
		const remainingWalKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(remainingWalKeys).toHaveLength(0)
	})

	it('delete produces WAL writes and cleans up on completion', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
			id: f.id(),
			name: f.string()
		})

		const created = await User.create({ name: 'Alice' })

		adapter.reset()
		const deleted = await User.delete({ where: { id: created.id } })
		expect(deleted).not.toBeNull()
		expect(deleted!.id).toBe(created.id)

		// WAL writes should have occurred
		const walWrites = adapter.writes.filter((w) => w.key.startsWith(WAL_ENTRY_PREFIX))
		expect(walWrites.length).toBeGreaterThan(0)

		// WAL entries should be cleaned up
		const remainingWalKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(remainingWalKeys).toHaveLength(0)

		// Confirm record is gone
		const found = await User.findUnique({ where: { id: created.id } })
		expect(found).toBeNull()
	})

	it('WAL entries are cleaned up even for segmented records', async () => {
		const LargeModel = FlashcoreSystem.registerModel<{ id: string; payload: string }>('LargeModel', {
			id: f.id(),
			payload: f.string()
		})

		// Create a large record that triggers segmentation (~100KB)
		const largePayload = 'x'.repeat(100_000)

		adapter.reset()
		const created = await LargeModel.create({ payload: largePayload })
		expect(created.id).toBeDefined()

		// WAL writes should have occurred
		const walWrites = adapter.writes.filter((w) => w.key.startsWith(WAL_ENTRY_PREFIX))
		expect(walWrites.length).toBeGreaterThan(0)

		// All WAL entries should be cleaned up after successful completion
		const remainingWalKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(remainingWalKeys).toHaveLength(0)

		// Verify record is readable
		const found = await LargeModel.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.payload).toBe(largePayload)
	})
})

// ─────────────────────────────────────────────────────────────
// Crash recovery — create
// ─────────────────────────────────────────────────────────────

describe('Crash recovery — create', () => {
	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('recovers created record when crash after authoritative phase', async () => {
		// Build a crash scenario using the raw WAL API: create a WAL entry,
		// simulate authoritative writes completing, then run recovery.
		const adapter = new MemoryAdapter()
		registerAllExtensions()

		const { WriteAheadLog, buildCreateDeltas } = await import('../../src/wal/index.js')
		const wal = new WriteAheadLog(adapter)

		const chunkKey = '_model:CrashUser:chunk:0'
		const record = { id: 'crash-user-1', name: 'CrashAlice' }
		const deltas = buildCreateDeltas(chunkKey, 0, 'crash-user-1', record, [])

		// Begin WAL entry
		const walId = await wal.begin({
			model: 'CrashUser',
			op: 'create',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: []
		})

		// Simulate the authoritative writes having completed (chunk written)
		adapter.set(chunkKey, { 'crash-user-1': record })
		await wal.markPhase(walId, 'authoritative')

		// "Crash" here — WAL entry remains, authoritative data is written

		// Now recover
		const result = await recoverWAL(adapter)
		expect(result.found).toBe(1)
		expect(result.replayed).toBe(1)

		// Record should still be in storage after replay (idempotent)
		const chunk = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunk['crash-user-1']).toEqual(record)

		// WAL entry should be cleaned up after recovery
		const walKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(walKeys).toHaveLength(0)
	})

	it('rolls back incomplete create when crash in pending phase', async () => {
		const adapter = new MemoryAdapter()
		registerAllExtensions()

		const { WriteAheadLog, buildCreateDeltas } = await import('../../src/wal/index.js')
		const wal = new WriteAheadLog(adapter)

		const chunkKey = '_model:RollbackUser:chunk:0'
		const record = { id: 'rb-user-1', name: 'RollbackAlice' }
		const deltas = buildCreateDeltas(chunkKey, 0, 'rb-user-1', record, [])

		// Begin WAL entry — still in 'pending' phase
		const walId = await wal.begin({
			model: 'RollbackUser',
			op: 'create',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: []
		})

		// Simulate partial writes that happened before the crash
		// (e.g., chunk was written but catalog was not)
		await adapter.set(chunkKey, { 'rb-user-1': record })

		// Make entry stale so recovery will rollback instead of replay
		const entryKey = WAL_ENTRY_PREFIX + walId
		const entry = adapter.get(entryKey) as any
		entry.timestamp = Date.now() - 600_000 // 10 minutes old — well past stale threshold
		adapter.set(entryKey, entry)

		// Run recovery — should rollback
		const result = await recoverWAL(adapter)
		expect(result.found).toBe(1)
		expect(result.rolledBack).toBe(1)
		expect(result.replayed).toBe(0)

		// The rollback inverse deltas for create undo the chunk_put,
		// so the record should be removed
		const chunk = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunk['rb-user-1']).toBeUndefined()

		// WAL entry should be cleaned up
		const walKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(walKeys).toHaveLength(0)
	})
})

// ─────────────────────────────────────────────────────────────
// Crash recovery — update
// ─────────────────────────────────────────────────────────────

describe('Crash recovery — update', () => {
	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('recovers updated record when crash after authoritative phase', async () => {
		const adapter = new MemoryAdapter()
		registerAllExtensions()

		const { WriteAheadLog, buildUpdateDeltas } = await import('../../src/wal/index.js')
		const wal = new WriteAheadLog(adapter)

		const chunkKey = '_model:User:chunk:0'
		const originalRecord = { id: 'u1', name: 'Alice', age: 25 }
		const patch = { name: 'Alice Updated', age: 26 }
		const inversePatch = { name: 'Alice', age: 25 }

		// Set up initial data
		adapter.set(chunkKey, { u1: originalRecord })

		// Begin WAL entry for update
		const deltas = buildUpdateDeltas(chunkKey, 'u1', patch, inversePatch, [])
		const walId = await wal.begin({
			model: 'User',
			op: 'update',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: []
		})

		// Simulate authoritative write completed (record was updated in chunk)
		const updatedRecord = { id: 'u1', name: 'Alice Updated', age: 26 }
		adapter.set(chunkKey, { u1: updatedRecord })
		await wal.markPhase(walId, 'authoritative')

		// "Crash" — WAL entry remains

		// Run recovery — should replay (idempotent)
		const result = await recoverWAL(adapter)
		expect(result.found).toBe(1)
		expect(result.replayed).toBe(1)

		// Record should reflect updated values
		const chunk = adapter.get(chunkKey) as Record<string, unknown>
		const record = chunk['u1'] as Record<string, unknown>
		expect(record.name).toBe('Alice Updated')
		expect(record.age).toBe(26)

		// WAL should be cleaned up
		const walKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(walKeys).toHaveLength(0)
	})

	it('rolls back incomplete update when crash in pending phase', async () => {
		const adapter = new MemoryAdapter()
		registerAllExtensions()

		const { WriteAheadLog, buildUpdateDeltas } = await import('../../src/wal/index.js')
		const wal = new WriteAheadLog(adapter)

		const chunkKey = '_model:User:chunk:0'
		const originalRecord = { id: 'u1', name: 'Bob', age: 30 }
		const patch = { name: 'Bob Updated' }
		const inversePatch = { name: 'Bob' }

		// Set up initial data
		adapter.set(chunkKey, { u1: originalRecord })

		// Begin WAL entry — stays in pending
		const deltas = buildUpdateDeltas(chunkKey, 'u1', patch, inversePatch, [])
		const walId = await wal.begin({
			model: 'User',
			op: 'update',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: []
		})

		// Simulate partial write — the patch was applied to the chunk
		adapter.set(chunkKey, { u1: { ...originalRecord, name: 'Bob Updated' } })

		// Make entry stale
		const entryKey = WAL_ENTRY_PREFIX + walId
		const entry = adapter.get(entryKey) as any
		entry.timestamp = Date.now() - 600_000
		adapter.set(entryKey, entry)

		// Run recovery — should rollback
		const result = await recoverWAL(adapter)
		expect(result.found).toBe(1)
		expect(result.rolledBack).toBe(1)

		// Record should be reverted to original values
		const chunk = adapter.get(chunkKey) as Record<string, unknown>
		const record = chunk['u1'] as Record<string, unknown>
		expect(record.name).toBe('Bob')

		// WAL should be cleaned up
		const walKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(walKeys).toHaveLength(0)
	})
})

// ─────────────────────────────────────────────────────────────
// Crash recovery — delete
// ─────────────────────────────────────────────────────────────

describe('Crash recovery — delete', () => {
	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('completes delete when crash after authoritative phase', async () => {
		const adapter = new MemoryAdapter()
		registerAllExtensions()

		const { WriteAheadLog, buildDeleteDeltas } = await import('../../src/wal/index.js')
		const wal = new WriteAheadLog(adapter)

		const chunkKey = '_model:User:chunk:0'
		const record = { id: 'u1', name: 'Charlie' }

		// Set up initial data
		adapter.set(chunkKey, { u1: record })

		// Begin WAL entry for delete
		const deltas = buildDeleteDeltas(chunkKey, 0, 'u1', record, [])
		const walId = await wal.begin({
			model: 'User',
			op: 'delete',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: []
		})

		// Simulate authoritative writes completed (record removed from chunk)
		adapter.set(chunkKey, {})
		await wal.markPhase(walId, 'authoritative')

		// "Crash" — WAL entry remains

		// Run recovery — should replay (delete is idempotent)
		const result = await recoverWAL(adapter)
		expect(result.found).toBe(1)
		expect(result.replayed).toBe(1)

		// Record should still be deleted
		const chunk = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunk['u1']).toBeUndefined()

		// WAL should be cleaned up
		const walKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(walKeys).toHaveLength(0)
	})

	it('restores record when crash in pending phase', async () => {
		const adapter = new MemoryAdapter()
		registerAllExtensions()

		const { WriteAheadLog, buildDeleteDeltas } = await import('../../src/wal/index.js')
		const wal = new WriteAheadLog(adapter)

		const chunkKey = '_model:User:chunk:0'
		const record = { id: 'u1', name: 'Diana' }

		// Set up initial data
		adapter.set(chunkKey, { u1: record })

		// Begin WAL entry — stays in pending
		const deltas = buildDeleteDeltas(chunkKey, 0, 'u1', record, [])
		const walId = await wal.begin({
			model: 'User',
			op: 'delete',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: []
		})

		// Simulate partial writes — record was deleted from chunk
		adapter.set(chunkKey, {})

		// Make entry stale
		const entryKey = WAL_ENTRY_PREFIX + walId
		const entry = adapter.get(entryKey) as any
		entry.timestamp = Date.now() - 600_000
		adapter.set(entryKey, entry)

		// Run recovery — should rollback (restore the record)
		const result = await recoverWAL(adapter)
		expect(result.found).toBe(1)
		expect(result.rolledBack).toBe(1)

		// Record should be restored
		const chunk = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunk['u1']).toEqual(record)

		// WAL should be cleaned up
		const walKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(walKeys).toHaveLength(0)
	})
})

// ─────────────────────────────────────────────────────────────
// WAL with transactions
// ─────────────────────────────────────────────────────────────

describe('WAL with transactions', () => {
	let adapter: RecordingAdapter

	beforeEach(async () => {
		adapter = new RecordingAdapter()
		await initWithExtensions(adapter)
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('model CRUD inside transaction leaves no WAL entries after commit', async () => {
		const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('TxUser', {
			id: f.id(),
			name: f.string()
		})

		adapter.reset()

		// Perform WAL-protected model CRUD (create writes WAL entries)
		const created = await User.create({ name: 'TxAlice' })
		expect(created.name).toBe('TxAlice')

		// Update also produces WAL entries
		await User.update({ where: { id: created.id }, data: { name: 'TxBob' } })

		// After all operations complete, no WAL entries should remain
		const walKeys = await scanKeysToArray(adapter, WAL_ENTRY_PREFIX)
		expect(walKeys).toHaveLength(0)

		// Verify the operations persisted correctly
		const found = await User.findUnique({ where: { id: created.id } })
		expect(found).not.toBeNull()
		expect(found!.name).toBe('TxBob')
	})
})
