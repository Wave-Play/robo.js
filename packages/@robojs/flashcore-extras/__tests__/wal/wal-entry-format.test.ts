/**
 * Flashcore v1 (spec rev 4.3) Phase 4 - WAL Entry Format Tests
 *
 * Validates WAL entry key format, segmentation, and read/write round-trips.
 */

import { MemoryAdapter, WAL_ENTRY_KEY_PREFIX, WAL_SEGMENT_PREFIX } from 'robo.js/flashcore'
import { WriteAheadLog } from '../../src/wal/manager.js'

describe('WAL Entry Format', () => {
	it('should segment large entries and reconstruct them via readEntry()', async () => {
		const adapter = new MemoryAdapter<string, unknown>()
		const wal = new WriteAheadLog(adapter, { maxEntrySize: 2000 })

		const walId = await wal.begin({
			model: 'User',
			op: 'create',
			auth: [
				{
					t: 'chunk_put',
					chunkId: '_model:User:chunk:0',
					id: 'u1',
					record: { big: 'x'.repeat(10_000) }
				}
			],
			undo: [],
			derived: []
		})

		const header = adapter.get(`${WAL_ENTRY_KEY_PREFIX}${walId}`) as { segmented?: { parts: number } } | undefined
		expect(header).toBeDefined()
		expect(header!.segmented).toBeDefined()

		const segmentKeys = adapter.keys().filter((k) => k.startsWith(`${WAL_SEGMENT_PREFIX}${walId}:`))
		expect(segmentKeys.length).toBeGreaterThan(1)
		expect(header!.segmented!.parts).toBe(segmentKeys.length)

		const entry = await wal.readEntry(walId)
		expect(entry).not.toBeNull()
		expect(entry!.id).toBe(walId)
		expect(entry!.auth[0]).toMatchObject({ t: 'chunk_put', id: 'u1' })
		expect((entry!.auth[0] as { record: { big: string } }).record.big.length).toBe(10_000)
	})
})
