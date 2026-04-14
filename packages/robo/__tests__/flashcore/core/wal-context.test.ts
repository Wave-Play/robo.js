/** Phase 2: Core Unit Tests - WAL Context */

import { getWalContext } from '../../../src/flashcore/wal/context.js'
import { setWALManager } from '../../../src/flashcore/wal/manager.js'
import { registerExtensions, _resetExtensions } from '../../../src/flashcore/core/extensions.js'

/**
 * Minimal mock implementing the WalManager interface.
 */
function createMockWalManager(): Record<string, unknown> {
	return {
		isEnabled: (): boolean => true,
		begin: async (): Promise<string> => 'wal-id',
		markPhase: async (): Promise<void> => {},
		complete: async (): Promise<void> => {},
		readEntry: async (): Promise<null> => null,
		writeEntry: async (): Promise<void> => {},
		deleteEntry: async (): Promise<void> => {},
		getAllEntryKeys: async (): Promise<string[]> => [],
		shouldReplay: (): boolean => true,
		isStale: (): boolean => false,
		staleThresholdMs: 300_000,
		maxEntrySize: 100_000
	}
}

/**
 * Minimal mock delta builders.
 */
interface MockDeltaResult {
	auth: never[]
	undo: never[]
	derived: never[]
}

const emptyResult = (): MockDeltaResult => ({ auth: [], undo: [], derived: [] })

const mockDeltas = {
	buildCreateDeltas: emptyResult,
	buildCreateSegmentedDeltas: emptyResult,
	buildUpdateDeltas: emptyResult,
	buildUpdateSegmentedDeltas: emptyResult,
	buildUpdateChunkToSegmentsDeltas: emptyResult,
	buildUpdateSegmentsToChunkDeltas: emptyResult,
	buildDeleteDeltas: emptyResult,
	buildDeleteSegmentedDeltas: emptyResult,
	computePatch: (): { patch: Record<string, unknown>; inversePatch: Record<string, unknown> } => ({ patch: {}, inversePatch: {} }),
	applyPatch: (record: Record<string, unknown>): Record<string, unknown> => record
}

describe('WAL Context', () => {
	afterEach(() => {
		_resetExtensions()
		setWALManager(null)
	})

	it('should return undefined when no WAL manager set', () => {
		expect(getWalContext()).toBeUndefined()
	})

	it('should return undefined when WAL manager set but no WAL extension registered', () => {
		const mockManager = createMockWalManager()
		setWALManager(mockManager as any)
		expect(getWalContext()).toBeUndefined()
	})

	it('should return valid WalContext when both WAL manager and extension are registered', () => {
		const mockManager = createMockWalManager()
		setWALManager(mockManager as any)
		registerExtensions({
			wal: {
				createWALManager: () => mockManager as any,
				recoverWAL: async () => ({ found: 0, replayed: 0, rolledBack: 0, errors: [] }),
				deltaBuilders: mockDeltas as any
			}
		})

		const ctx = getWalContext()
		expect(ctx).toBeDefined()
	})

	it('should have manager and deltas properties on the returned context', () => {
		const mockManager = createMockWalManager()
		setWALManager(mockManager as any)
		registerExtensions({
			wal: {
				createWALManager: () => mockManager as any,
				recoverWAL: async () => ({ found: 0, replayed: 0, rolledBack: 0, errors: [] }),
				deltaBuilders: mockDeltas as any
			}
		})

		const ctx = getWalContext()!
		expect(ctx.manager).toBe(mockManager)
		expect(ctx.deltas).toBe(mockDeltas)
	})

	it('should have deltas matching the deltaBuilders from the registered extension', () => {
		const mockManager = createMockWalManager()
		setWALManager(mockManager as any)
		registerExtensions({
			wal: {
				createWALManager: () => mockManager as any,
				recoverWAL: async () => ({ found: 0, replayed: 0, rolledBack: 0, errors: [] }),
				deltaBuilders: mockDeltas as any
			}
		})

		const ctx = getWalContext()!
		expect(ctx.deltas.buildCreateDeltas).toBe(mockDeltas.buildCreateDeltas)
		expect(ctx.deltas.computePatch).toBe(mockDeltas.computePatch)
	})
})
