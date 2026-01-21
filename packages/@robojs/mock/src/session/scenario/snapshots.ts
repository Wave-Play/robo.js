import type {
	ScenarioSnapshot,
	ScenarioStepResult,
	ScenarioStepResultSummary,
	SnapshotStoreConfig
} from '../../types/index.js'

/** Default maximum number of snapshots to retain */
const DEFAULT_MAX_SNAPSHOTS = 50

/**
 * Stores lightweight snapshots at step boundaries for backward navigation.
 *
 * Implements LRU eviction when the snapshot count exceeds maxSnapshots.
 * Snapshots are keyed by step index and contain minimal navigation state.
 */
export class SnapshotStore {
	/** Snapshots keyed by step index */
	private snapshots: Map<number, ScenarioSnapshot> = new Map()

	/** Access order for LRU eviction (most recently accessed at the end) */
	private accessOrder: number[] = []

	/** Maximum number of snapshots to retain */
	private readonly maxSnapshots: number

	constructor(config?: SnapshotStoreConfig) {
		this.maxSnapshots = config?.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS
	}

	/**
	 * Capture a snapshot at a step boundary.
	 *
	 * @param stepIndex - The step index this snapshot is for
	 * @param stepResult - The full step result to summarize
	 * @param lastActionId - The last action ID at this boundary
	 * @param playback - Optional Stage playback position at this boundary
	 */
	capture(
		stepIndex: number,
		stepResult: ScenarioStepResult,
		lastActionId: string,
		playback?: { time: number; eventCount: number }
	): void {
		// Create lightweight summary from full result
		const summary: ScenarioStepResultSummary = {
			stepIndex: stepResult.stepIndex,
			stepId: stepResult.stepId,
			stepType: stepResult.stepType as ScenarioStepResultSummary['stepType'],
			status: stepResult.status,
			duration: stepResult.duration,
			executedNodeId: stepResult.executedNodeId
		}

		const snapshot: ScenarioSnapshot = {
			stepIndex,
			timestamp: Date.now(),
			stepResult: summary,
			actionIdsBoundary: lastActionId,
			playbackTime: playback?.time,
			playbackEventCount: playback?.eventCount
		}

		// If this step already has a snapshot, update access order
		if (this.snapshots.has(stepIndex)) {
			this.updateAccessOrder(stepIndex)
		} else {
			// New snapshot - add to access order
			this.accessOrder.push(stepIndex)
		}

		this.snapshots.set(stepIndex, snapshot)

		// Evict if over limit
		this.evictIfNeeded()
	}

	/**
	 * Get the snapshot for a step index.
	 *
	 * @param stepIndex - The step index to retrieve
	 * @returns The snapshot or undefined if not found
	 */
	get(stepIndex: number): ScenarioSnapshot | undefined {
		const snapshot = this.snapshots.get(stepIndex)
		if (snapshot) {
			// Update access order for LRU
			this.updateAccessOrder(stepIndex)
		}
		return snapshot
	}

	/**
	 * Check if a snapshot exists for a step index.
	 *
	 * @param stepIndex - The step index to check
	 * @returns True if a snapshot exists
	 */
	has(stepIndex: number): boolean {
		return this.snapshots.has(stepIndex)
	}

	/**
	 * Clear all snapshots.
	 * Called when the scenario is cleared or a new scenario is loaded.
	 */
	clear(): void {
		this.snapshots.clear()
		this.accessOrder = []
	}

	/**
	 * Get the number of stored snapshots.
	 */
	get size(): number {
		return this.snapshots.size
	}

	/**
	 * Get all snapshots in order of step index.
	 * Useful for debugging/inspection.
	 */
	getAll(): ScenarioSnapshot[] {
		return Array.from(this.snapshots.values()).sort((a, b) => a.stepIndex - b.stepIndex)
	}

	/**
	 * Update access order for LRU tracking.
	 */
	private updateAccessOrder(stepIndex: number): void {
		const idx = this.accessOrder.indexOf(stepIndex)
		if (idx !== -1) {
			this.accessOrder.splice(idx, 1)
		}
		this.accessOrder.push(stepIndex)
	}

	/**
	 * Evict oldest snapshots if over the limit.
	 */
	private evictIfNeeded(): void {
		while (this.snapshots.size > this.maxSnapshots && this.accessOrder.length > 0) {
			const oldest = this.accessOrder.shift()
			if (oldest !== undefined) {
				this.snapshots.delete(oldest)
			}
		}
	}
}
