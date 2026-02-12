/**
 * Unit tests for SnapshotStore class
 * Backward Navigation Semantics
 */

import { SnapshotStore } from '../src/session/scenario/snapshots.js'
import type { ScenarioStepResult } from '../src/types/index.js'

/**
 * Create a mock step result for testing.
 */
function createMockStepResult(stepIndex: number, overrides?: Partial<ScenarioStepResult>): ScenarioStepResult {
	return {
		stepIndex,
		stepId: `step_${stepIndex}`,
		stepType: 'dispatch',
		status: 'ok',
		startedAt: Date.now() - 100,
		completedAt: Date.now(),
		duration: 100,
		recordedActionIds: [`action_${stepIndex}`],
		...overrides
	}
}

describe('SnapshotStore', () => {
	describe('instantiation', () => {
		it('should create store with default max snapshots', () => {
			const store = new SnapshotStore()

			expect(store.size).toBe(0)
		})

		it('should create store with custom max snapshots', () => {
			const store = new SnapshotStore({ maxSnapshots: 10 })

			expect(store.size).toBe(0)
		})
	})

	describe('capture()', () => {
		it('should capture a snapshot at step boundary', () => {
			const store = new SnapshotStore()
			const stepResult = createMockStepResult(0)

			store.capture(0, stepResult, 'action_1')

			expect(store.size).toBe(1)
			expect(store.has(0)).toBe(true)
		})

		it('should store step result summary in snapshot', () => {
			const store = new SnapshotStore()
			const stepResult = createMockStepResult(0, {
				stepType: 'assert',
				status: 'failed',
				duration: 250,
				executedNodeId: 'node_123'
			})

			store.capture(0, stepResult, 'action_1')

			const snapshot = store.get(0)
			expect(snapshot).toBeDefined()
			expect(snapshot!.stepResult.stepIndex).toBe(0)
			expect(snapshot!.stepResult.stepType).toBe('assert')
			expect(snapshot!.stepResult.status).toBe('failed')
			expect(snapshot!.stepResult.duration).toBe(250)
			expect(snapshot!.stepResult.executedNodeId).toBe('node_123')
		})

		it('should store action ID boundary', () => {
			const store = new SnapshotStore()
			const stepResult = createMockStepResult(0)

			store.capture(0, stepResult, 'action_42')

			const snapshot = store.get(0)
			expect(snapshot!.actionIdsBoundary).toBe('action_42')
		})

		it('should store playback boundary when provided', () => {
			const store = new SnapshotStore()
			const stepResult = createMockStepResult(0)

			store.capture(0, stepResult, 'action_42', { time: 1234, eventCount: 9 })

			const snapshot = store.get(0)
			expect(snapshot!.playbackTime).toBe(1234)
			expect(snapshot!.playbackEventCount).toBe(9)
		})

		it('should include timestamp in snapshot', () => {
			const store = new SnapshotStore()
			const stepResult = createMockStepResult(0)
			const before = Date.now()

			store.capture(0, stepResult, 'action_1')

			const snapshot = store.get(0)
			expect(snapshot!.timestamp).toBeGreaterThanOrEqual(before)
			expect(snapshot!.timestamp).toBeLessThanOrEqual(Date.now())
		})

		it('should overwrite existing snapshot for same step index', () => {
			const store = new SnapshotStore()
			const stepResult1 = createMockStepResult(0, { status: 'ok' })
			const stepResult2 = createMockStepResult(0, { status: 'failed' })

			store.capture(0, stepResult1, 'action_1')
			store.capture(0, stepResult2, 'action_2')

			expect(store.size).toBe(1)
			const snapshot = store.get(0)
			expect(snapshot!.stepResult.status).toBe('failed')
			expect(snapshot!.actionIdsBoundary).toBe('action_2')
		})

		it('should capture multiple snapshots for different steps', () => {
			const store = new SnapshotStore()

			store.capture(0, createMockStepResult(0), 'action_1')
			store.capture(1, createMockStepResult(1), 'action_2')
			store.capture(2, createMockStepResult(2), 'action_3')

			expect(store.size).toBe(3)
			expect(store.has(0)).toBe(true)
			expect(store.has(1)).toBe(true)
			expect(store.has(2)).toBe(true)
		})
	})

	describe('get()', () => {
		it('should return undefined for non-existent step index', () => {
			const store = new SnapshotStore()

			expect(store.get(0)).toBeUndefined()
			expect(store.get(999)).toBeUndefined()
		})

		it('should return snapshot for existing step index', () => {
			const store = new SnapshotStore()
			store.capture(5, createMockStepResult(5), 'action_5')

			const snapshot = store.get(5)

			expect(snapshot).toBeDefined()
			expect(snapshot!.stepIndex).toBe(5)
		})

		it('should update LRU access order when getting', () => {
			const store = new SnapshotStore({ maxSnapshots: 3 })

			// Capture 3 snapshots
			store.capture(0, createMockStepResult(0), 'action_0')
			store.capture(1, createMockStepResult(1), 'action_1')
			store.capture(2, createMockStepResult(2), 'action_2')

			// Access step 0 to move it to most recent
			store.get(0)

			// Add a new snapshot - should evict step 1 (least recently used)
			store.capture(3, createMockStepResult(3), 'action_3')

			expect(store.size).toBe(3)
			expect(store.has(0)).toBe(true) // Still exists (was accessed)
			expect(store.has(1)).toBe(false) // Evicted
			expect(store.has(2)).toBe(true)
			expect(store.has(3)).toBe(true)
		})
	})

	describe('has()', () => {
		it('should return false for non-existent step index', () => {
			const store = new SnapshotStore()

			expect(store.has(0)).toBe(false)
		})

		it('should return true for existing step index', () => {
			const store = new SnapshotStore()
			store.capture(0, createMockStepResult(0), 'action_1')

			expect(store.has(0)).toBe(true)
		})
	})

	describe('clear()', () => {
		it('should remove all snapshots', () => {
			const store = new SnapshotStore()
			store.capture(0, createMockStepResult(0), 'action_0')
			store.capture(1, createMockStepResult(1), 'action_1')
			store.capture(2, createMockStepResult(2), 'action_2')

			store.clear()

			expect(store.size).toBe(0)
			expect(store.has(0)).toBe(false)
			expect(store.has(1)).toBe(false)
			expect(store.has(2)).toBe(false)
		})

		it('should allow new captures after clear', () => {
			const store = new SnapshotStore()
			store.capture(0, createMockStepResult(0), 'action_0')
			store.clear()

			store.capture(5, createMockStepResult(5), 'action_5')

			expect(store.size).toBe(1)
			expect(store.has(5)).toBe(true)
		})
	})

	describe('size', () => {
		it('should return 0 for empty store', () => {
			const store = new SnapshotStore()

			expect(store.size).toBe(0)
		})

		it('should return correct count after captures', () => {
			const store = new SnapshotStore()

			store.capture(0, createMockStepResult(0), 'action_0')
			expect(store.size).toBe(1)

			store.capture(1, createMockStepResult(1), 'action_1')
			expect(store.size).toBe(2)

			store.capture(2, createMockStepResult(2), 'action_2')
			expect(store.size).toBe(3)
		})
	})

	describe('getAll()', () => {
		it('should return empty array for empty store', () => {
			const store = new SnapshotStore()

			expect(store.getAll()).toEqual([])
		})

		it('should return all snapshots sorted by step index', () => {
			const store = new SnapshotStore()

			// Add in non-sequential order
			store.capture(2, createMockStepResult(2), 'action_2')
			store.capture(0, createMockStepResult(0), 'action_0')
			store.capture(1, createMockStepResult(1), 'action_1')

			const all = store.getAll()

			expect(all.length).toBe(3)
			expect(all[0].stepIndex).toBe(0)
			expect(all[1].stepIndex).toBe(1)
			expect(all[2].stepIndex).toBe(2)
		})
	})

	describe('LRU eviction', () => {
		it('should evict oldest snapshot when exceeding max', () => {
			const store = new SnapshotStore({ maxSnapshots: 3 })

			store.capture(0, createMockStepResult(0), 'action_0')
			store.capture(1, createMockStepResult(1), 'action_1')
			store.capture(2, createMockStepResult(2), 'action_2')
			store.capture(3, createMockStepResult(3), 'action_3')

			expect(store.size).toBe(3)
			expect(store.has(0)).toBe(false) // Evicted (oldest)
			expect(store.has(1)).toBe(true)
			expect(store.has(2)).toBe(true)
			expect(store.has(3)).toBe(true)
		})

		it('should evict multiple snapshots if needed', () => {
			const store = new SnapshotStore({ maxSnapshots: 2 })

			store.capture(0, createMockStepResult(0), 'action_0')
			store.capture(1, createMockStepResult(1), 'action_1')
			store.capture(2, createMockStepResult(2), 'action_2')
			store.capture(3, createMockStepResult(3), 'action_3')
			store.capture(4, createMockStepResult(4), 'action_4')

			expect(store.size).toBe(2)
			expect(store.has(3)).toBe(true)
			expect(store.has(4)).toBe(true)
		})

		it('should respect access order for LRU', () => {
			const store = new SnapshotStore({ maxSnapshots: 3 })

			store.capture(0, createMockStepResult(0), 'action_0')
			store.capture(1, createMockStepResult(1), 'action_1')
			store.capture(2, createMockStepResult(2), 'action_2')

			// Access step 0 and 1 to make them more recent
			store.get(0)
			store.get(1)

			// Add new snapshot - should evict step 2 (least recently used)
			store.capture(3, createMockStepResult(3), 'action_3')

			expect(store.size).toBe(3)
			expect(store.has(0)).toBe(true)
			expect(store.has(1)).toBe(true)
			expect(store.has(2)).toBe(false) // Evicted
			expect(store.has(3)).toBe(true)
		})

		it('should update access order on capture of existing step', () => {
			const store = new SnapshotStore({ maxSnapshots: 3 })

			store.capture(0, createMockStepResult(0), 'action_0')
			store.capture(1, createMockStepResult(1), 'action_1')
			store.capture(2, createMockStepResult(2), 'action_2')

			// Re-capture step 0 (updates it and moves to most recent)
			store.capture(0, createMockStepResult(0, { status: 'failed' }), 'action_0_updated')

			// Add new snapshot - should evict step 1 (oldest after 0 was updated)
			store.capture(3, createMockStepResult(3), 'action_3')

			expect(store.size).toBe(3)
			expect(store.has(0)).toBe(true)
			expect(store.has(1)).toBe(false) // Evicted
			expect(store.has(2)).toBe(true)
			expect(store.has(3)).toBe(true)
		})

		it('should use default max of 50 when not configured', () => {
			const store = new SnapshotStore()

			// Add 55 snapshots
			for (let i = 0; i < 55; i++) {
				store.capture(i, createMockStepResult(i), `action_${i}`)
			}

			expect(store.size).toBe(50)
			// First 5 should be evicted
			expect(store.has(0)).toBe(false)
			expect(store.has(4)).toBe(false)
			expect(store.has(5)).toBe(true)
			expect(store.has(54)).toBe(true)
		})
	})
})
