/**
 * Phase 8: WAL Idempotence Stress Tests
 *
 * Ensures replay and rollback operations are idempotent under stress:
 * - Replaying the same WAL entry N times yields the same state
 * - Rolling back the same entry N times yields clean state
 * - Interleaved replay/add/recover cycles maintain consistency
 */

import {
	MemoryAdapter,
	buildModelKey,
	buildUniqueKey,
	encodeUniqueValue
} from 'robo.js/flashcore'
import type { WALEntry, RecoveryContext } from 'robo.js/flashcore'
import {
	buildCreateDeltas,
	replayEntryWithContext,
	rollbackEntryWithContext
} from '../../src/wal/index.js'

/**
 * Build a RecoveryContext for testing.
 */
function makeRecoveryContext(adapter: MemoryAdapter): RecoveryContext {
	return {
		adapter,
		getCatalogKey: (_ns: string | undefined, modelName: string) =>
			buildModelKey(modelName, 'catalog'),
		getChunkKey: (_ns: string | undefined, modelName: string, cId: string) =>
			buildModelKey(modelName, `chunk:${cId}`)
	}
}

describe('WAL Idempotence Stress', () => {
	it('should produce identical state after replaying the same entry 100 times', async () => {
		const adapter = new MemoryAdapter<string, unknown>()

		const model = 'User'
		const id = 'u-stress-1'
		const chunkId = 0
		const chunkKey = buildModelKey(model, `chunk:${chunkId}`)
		const catalogKey = buildModelKey(model, 'catalog')
		const uniqueKey = buildUniqueKey(model, 'email', encodeUniqueValue('stress@example.com'))

		const record = { id, email: 'stress@example.com', name: 'StressUser' }
		const deltas = buildCreateDeltas(chunkKey, chunkId, id, record, [{ key: uniqueKey, id }])

		const entry: WALEntry = {
			id: 'wal-stress-1',
			timestamp: Date.now(),
			model,
			op: 'create',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: deltas.derived,
			phase: 'pending'
		}

		const ctx = makeRecoveryContext(adapter)

		// Replay the same entry 100 times
		for (let i = 0; i < 100; i++) {
			await replayEntryWithContext(ctx, entry)
		}

		// Verify the record exists exactly once
		const chunk = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunk[id]).toEqual(record)

		// Verify the catalog has exactly one entry
		const catalog = adapter.get(catalogKey) as {
			version: number
			entries: Array<{ id: string; chunkId: number }>
			count: number
		}
		expect(catalog.count).toBe(1)
		const matchingEntries = catalog.entries.filter((e) => e.id === id)
		expect(matchingEntries).toHaveLength(1)

		// Verify unique key is correct
		expect(adapter.get(uniqueKey)).toEqual({ id })
	})

	it('should produce clean state after rolling back the same entry 100 times', async () => {
		const adapter = new MemoryAdapter<string, unknown>()

		const model = 'RBUser'
		const id = 'u-rb-1'
		const chunkId = 0
		const chunkKey = buildModelKey(model, `chunk:${chunkId}`)
		const catalogKey = buildModelKey(model, 'catalog')
		const uniqueKey = buildUniqueKey(model, 'email', encodeUniqueValue('rollback@example.com'))

		const record = { id, email: 'rollback@example.com' }
		const deltas = buildCreateDeltas(chunkKey, chunkId, id, record, [{ key: uniqueKey, id }])

		const entry: WALEntry = {
			id: 'wal-rb-1',
			timestamp: Date.now(),
			model,
			op: 'create',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: deltas.derived,
			phase: 'pending'
		}

		const ctx = makeRecoveryContext(adapter)

		// First, replay to establish state
		await replayEntryWithContext(ctx, entry)

		// Verify state is established
		const chunkBefore = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunkBefore[id]).toEqual(record)

		// Now rollback the same entry 100 times
		for (let i = 0; i < 100; i++) {
			await rollbackEntryWithContext(ctx, entry)
		}

		// Verify record is removed
		const chunkAfter = adapter.get(chunkKey) as Record<string, unknown> | undefined
		expect(chunkAfter?.[id]).toBeUndefined()

		// Verify catalog is empty
		const catalogAfter = adapter.get(catalogKey) as { entries: Array<{ id: string }>; count: number } | undefined
		expect(catalogAfter?.count ?? 0).toBe(0)
		expect(catalogAfter?.entries ?? []).toEqual([])

		// Verify unique key is released
		expect(adapter.has(uniqueKey)).toBe(false)
	})

	it('should maintain consistent state across replay-add-replay cycles', async () => {
		const adapter = new MemoryAdapter<string, unknown>()

		const model = 'CycleUser'
		const id = 'u-cycle-1'
		const chunkId = 0
		const chunkKey = buildModelKey(model, `chunk:${chunkId}`)
		const catalogKey = buildModelKey(model, 'catalog')

		const record = { id, name: 'CycleUser' }
		const deltas = buildCreateDeltas(chunkKey, chunkId, id, record, [])

		const entry: WALEntry = {
			id: 'wal-cycle-1',
			timestamp: Date.now(),
			model,
			op: 'create',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: deltas.derived,
			phase: 'pending'
		}

		const ctx = makeRecoveryContext(adapter)

		// Replay
		await replayEntryWithContext(ctx, entry)
		const chunkAfterReplay = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunkAfterReplay[id]).toEqual(record)

		// Rollback
		await rollbackEntryWithContext(ctx, entry)
		const chunkAfterRollback = adapter.get(chunkKey) as Record<string, unknown> | undefined
		expect(chunkAfterRollback?.[id]).toBeUndefined()

		// Replay again
		await replayEntryWithContext(ctx, entry)
		const chunkAfterReReplay = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunkAfterReReplay[id]).toEqual(record)

		// Verify catalog is consistent (exactly 1 entry)
		const catalog = adapter.get(catalogKey) as {
			entries: Array<{ id: string }>
			count: number
		}
		expect(catalog.count).toBe(1)
		const matchingEntries = catalog.entries.filter((e) => e.id === id)
		expect(matchingEntries).toHaveLength(1)
	})
})
