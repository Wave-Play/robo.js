/**
 * Flashcore v1 (spec rev 4.3) Phase 4 - WAL Recovery Integration Tests
 *
 * Validates that `Flashcore.$.init()` performs recovery (scan-capable adapters)
 * and updates metrics/introspection.
 */

import { MemoryAdapter, FlashcoreSystem, buildModelKey, buildUniqueKey, encodeUniqueValue } from 'robo.js/flashcore'
import { WriteAheadLog, buildCreateDeltas } from '../../src/wal/index.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('WAL Recovery Integration', () => {
	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should recover an orphaned pending create entry on init and update metrics', async () => {
		const adapter = new MemoryAdapter<string, unknown>()

		// Create a pending WAL entry but do not apply any authoritative writes.
		const wal = new WriteAheadLog(adapter, { maxEntrySize: 1_000 })

		const model = 'User'
		const id = 'u1'
		const chunkId = 0
		const chunkKey = buildModelKey(model, `chunk:${chunkId}`)
		const catalogKey = buildModelKey(model, 'catalog')
		const uniqueKey = buildUniqueKey(model, 'email', encodeUniqueValue('a@example.com'))

		const record = { id, email: 'a@example.com' }
		const deltas = buildCreateDeltas(chunkKey, chunkId, id, record, [{ key: uniqueKey, id }])

		await wal.begin({
			model,
			op: 'create',
			auth: deltas.auth,
			undo: deltas.undo,
			derived: deltas.derived
		})

		// Register extensions so WAL recovery runs during init
		registerAllExtensions()
		await FlashcoreSystem.init({ adapter })

		// Recovery should have applied authoritative state.
		const chunk = adapter.get(chunkKey) as Record<string, unknown>
		expect(chunk[id]).toEqual(record)

		const catalog = adapter.get(catalogKey) as { entries: Array<{ id: string; kind: string; chunkId: number }>; count: number }
		expect(catalog.entries).toEqual([{ id, kind: 'chunk', chunkId }])
		expect(catalog.count).toBe(1)

		expect(adapter.get(uniqueKey)).toEqual({ id })

		// And it should have updated system introspection/metrics.
		const intro = await FlashcoreSystem.introspect()
		expect(intro.walStatus.pendingEntries).toBe(0)
		expect(intro.walStatus.lastRecovery).toBeInstanceOf(Date)
		expect(FlashcoreSystem.metrics().walRecoveries).toBe(1)
	})
})
