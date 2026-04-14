/** Phase 2: Core Unit Tests - WAL Manager Shim */

import {
	getWALManager,
	setWALManager,
	isWALEnabled,
	getWalPendingEntriesCount,
	setWalPendingEntriesCount
} from '../../../src/flashcore/wal/manager.js'

/**
 * Minimal mock implementing the WalManager interface.
 */
function createMockWalManager(enabled: boolean) {
	return {
		isEnabled: (): boolean => enabled,
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

describe('WAL Manager Shim', () => {
	afterEach(() => {
		setWALManager(null)
		setWalPendingEntriesCount(0)
	})

	it('should return null by default from getWALManager', () => {
		expect(getWALManager()).toBe(null)
	})

	it('should return mock after setWALManager', () => {
		const mock = createMockWalManager(true)
		setWALManager(mock as any)
		expect(getWALManager()).toBe(mock)
	})

	it('should clear manager when setWALManager(null)', () => {
		const mock = createMockWalManager(true)
		setWALManager(mock as any)
		expect(getWALManager()).toBe(mock)
		setWALManager(null)
		expect(getWALManager()).toBe(null)
	})

	describe('isWALEnabled', () => {
		it('should return false when no manager set', () => {
			expect(isWALEnabled()).toBe(false)
		})

		it('should delegate to manager.isEnabled() returning true', () => {
			const mock = createMockWalManager(true)
			setWALManager(mock as any)
			expect(isWALEnabled()).toBe(true)
		})

		it('should delegate to manager.isEnabled() returning false', () => {
			const mock = createMockWalManager(false)
			setWALManager(mock as any)
			expect(isWALEnabled()).toBe(false)
		})
	})

	describe('walPendingEntriesCount', () => {
		it('should return 0 by default', () => {
			expect(getWalPendingEntriesCount()).toBe(0)
		})

		it('should return 5 after setting to 5', () => {
			setWalPendingEntriesCount(5)
			expect(getWalPendingEntriesCount()).toBe(5)
		})

		it('should clamp negative values to 0', () => {
			setWalPendingEntriesCount(-1)
			expect(getWalPendingEntriesCount()).toBe(0)
		})
	})
})
