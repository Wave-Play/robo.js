/**
 * Flashcore v1 (spec rev 4.3) Phase 4 - WAL Idempotence Tests
 *
 * Ensures replay/rollback are idempotent for authoritative structures.
 */

import { MemoryAdapter, buildModelKey, buildUniqueKey, encodeUniqueValue } from 'robo.js/flashcore'
import type { WALEntry } from 'robo.js/flashcore'
import { buildCreateDeltas, replayEntryWithContext, rollbackEntryWithContext } from '../../src/wal/index.js'

describe('WAL Idempotence', () => {
	it('should replay and rollback idempotently', async () => {
		const adapter = new MemoryAdapter<string, unknown>()

		const model = 'User'
		const id = 'u1'
		const chunkId = 0
		const chunkKey = buildModelKey(model, `chunk:${chunkId}`)
		const catalogKey = buildModelKey(model, 'catalog')
		const uniqueKey = buildUniqueKey(model, 'email', encodeUniqueValue('a@example.com'))

		const record = { id, email: 'a@example.com' }
		const deltas = buildCreateDeltas(chunkKey, chunkId, id, record, [{ key: uniqueKey, id }])

		const entry: WALEntry = {
			id: 'wal1',
			timestamp: Date.now(),
			model,
			op: 'create',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: deltas.derived,
			phase: 'pending'
		}

		const ctx = {
			adapter,
			getCatalogKey: (_ns: string | undefined, modelName: string) => buildModelKey(modelName, 'catalog'),
			getChunkKey: (_ns: string | undefined, modelName: string, cId: string) => buildModelKey(modelName, `chunk:${cId}`)
		}

		await replayEntryWithContext(ctx, entry)
		await replayEntryWithContext(ctx, entry)

		const chunk = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunk[id]).toEqual(record)

		const catalog = adapter.get(catalogKey) as {
			version: number
			entries: Array<{ id: string; chunkId: number }>
			count: number
		}
		expect(catalog.count).toBe(1)
		expect(catalog.entries).toEqual([{ id, kind: 'chunk', chunkId }])

		expect(adapter.get(uniqueKey)).toEqual({ id })

		await rollbackEntryWithContext(ctx, entry)
		await rollbackEntryWithContext(ctx, entry)

		const chunkAfter = adapter.get(chunkKey) as Record<string, unknown> | undefined
		expect(chunkAfter?.[id]).toBeUndefined()

		const catalogAfter = adapter.get(catalogKey) as { entries: Array<{ id: string }>; count: number } | undefined
		expect(catalogAfter?.count ?? 0).toBe(0)
		expect(catalogAfter?.entries ?? []).toEqual([])

		expect(adapter.has(uniqueKey)).toBe(false)
	})
})
