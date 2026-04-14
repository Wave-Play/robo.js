/**
 * WAL Segmented Records
 *
 * Ensures WAL entries for segmented records use segment deltas (not chunk deltas),
 * and that recovery can replay segmented operations deterministically.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	FlashcoreSystem,
	MemoryAdapter,
	setWALManager,
	f
} from 'robo.js/flashcore'
import { WriteAheadLog, buildCreateSegmentedDeltas, recoverWAL } from '../../src/wal/index.js'
import { registerAllExtensions } from '../helpers/register-extensions.js'

describe('WAL - Segmented Records', () => {
	afterEach(async () => {
		setWALManager(null)
		await FlashcoreSystem._reset()
	})

	describe('CRUD integration', () => {
		let adapter: MemoryAdapter
		let captured: any

		beforeEach(async () => {
			registerAllExtensions()
			adapter = new MemoryAdapter() as any
			;(adapter as any).maxValueSize = 200 // Force segmentation via ChunkManager sizing
			await FlashcoreSystem.init({ adapter })

			captured = { last: null }
			setWALManager({
				isEnabled: (): boolean => true,
				begin: async (entry: any): Promise<string> => {
					captured.last = entry
					return 'wal_test'
				},
				markPhase: async (): Promise<void> => {},
				complete: async (): Promise<void> => {},
				deleteEntry: async (): Promise<void> => {},
				getAllEntryKeys: async (): Promise<string[]> => [],
				readEntry: async (): Promise<undefined> => undefined,
				shouldReplay: (): boolean => false
			} as any)
		})

		it('should use segment deltas for segmented create()', async () => {
			const Model = FlashcoreSystem.registerModel<{ id: string; name: string; data: string }>('Large', {
				id: f.id(),
				name: f.string(),
				data: f.string()
			})

			await Model.create({ id: 'r1', name: 'A', data: 'x'.repeat(500) })

			expect(captured.last).toBeTruthy()
			const auth = captured.last.auth as Array<{ t: string }>

			expect(auth.some((d) => d.t === 'seg_put')).toBe(true)
			expect(auth.some((d) => d.t === 'catalog_set_segments')).toBe(true)
			expect(auth.some((d) => d.t === 'chunk_put' || d.t === 'chunk_patch' || d.t === 'chunk_delete')).toBe(false)
		})

		it('should use segment deltas for segmented delete()', async () => {
			const Model = FlashcoreSystem.registerModel<{ id: string; name: string; data: string }>('LargeDel', {
				id: f.id(),
				name: f.string(),
				data: f.string()
			})

			// Create a segmented record (with WAL enabled but fake manager is fine)
			await Model.create({ id: 'r1', name: 'A', data: 'x'.repeat(500) })

			// Reset capture and delete
			captured.last = null
			await Model.delete({ where: { id: 'r1' } })

			expect(captured.last).toBeTruthy()
			const auth = captured.last.auth as Array<{ t: string }>

			expect(auth.some((d) => d.t === 'seg_delete')).toBe(true)
			expect(auth.some((d) => d.t === 'catalog_delete')).toBe(true)
			expect(auth.some((d) => d.t === 'chunk_put' || d.t === 'chunk_patch' || d.t === 'chunk_delete')).toBe(false)
		})
	})

	describe('Recovery', () => {
		it('should replay seg_put + catalog_set_segments deltas', async () => {
			const adapter = new MemoryAdapter()
			await adapter.init?.()

			const wal = new WriteAheadLog(adapter)

			const segmentKey0 = '_model:User:seg:u1:0'
			const segmentKey1 = '_model:User:seg:u1:1'
			const segments = [
				{ segmentKey: segmentKey0, index: 0, data: '{"id":"u1","data":"' },
				{ segmentKey: segmentKey1, index: 1, data: 'hello"}' }
			]
			const deltas = buildCreateSegmentedDeltas('u1', ['0', '1'], segments, [])

			await wal.begin({
				model: 'User',
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: []
			})

			const result = await recoverWAL(adapter)
			expect(result.found).toBe(1)
			expect(result.replayed).toBe(1)

			expect(await adapter.get(segmentKey0)).toBe(segments[0].data)
			expect(await adapter.get(segmentKey1)).toBe(segments[1].data)

			const catalogKey = '_model:User:catalog'
			const catalog = await adapter.get(catalogKey) as any
			expect(catalog.entries.some((e: any) => e.id === 'u1' && e.kind === 'segments')).toBe(true)
		})
	})
})
