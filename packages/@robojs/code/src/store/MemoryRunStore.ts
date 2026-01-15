/**
 * In-memory run store for @robojs/code SDK
 *
 * Provides same-session run persistence with LRU eviction.
 * For durable persistence across page reloads, use a durable backend.
 */

import type { RunStore, MemoryRunStoreConfig } from './types.js'
import type { RunMeta, RunFilter } from '../types/run.js'
import { codeLogger } from '../core/logger.js'

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<MemoryRunStoreConfig> = {
	maxRuns: 100
}

/**
 * In-memory run store with LRU eviction.
 *
 * Features:
 * - Stores run metadata in memory
 * - LRU eviction when maxRuns is exceeded
 * - Filtering and sorting support
 * - No persistence across page reloads
 */
export class MemoryRunStore implements RunStore {
	private readonly runs: Map<string, RunMeta> = new Map()
	private readonly config: Required<MemoryRunStoreConfig>

	constructor(config: MemoryRunStoreConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config }
	}

	/**
	 * List runs with optional filtering
	 */
	async listRuns(filter?: RunFilter): Promise<RunMeta[]> {
		let runs = Array.from(this.runs.values())

		// Apply filters
		if (filter?.status) {
			runs = runs.filter((r) => r.status === filter.status)
		}
		if (filter?.mode) {
			runs = runs.filter((r) => r.mode === filter.mode)
		}
		if (filter?.since) {
			const since = new Date(filter.since)
			runs = runs.filter((r) => new Date(r.createdAt) >= since)
		}

		// Sort by creation time descending (newest first)
		runs = runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

		// Apply limit
		if (filter?.limit && filter.limit > 0) {
			runs = runs.slice(0, filter.limit)
		}

		return runs
	}

	/**
	 * Get a specific run by ID
	 */
	async getRun(runId: string): Promise<RunMeta | null> {
		return this.runs.get(runId) ?? null
	}

	/**
	 * Save or update run metadata
	 */
	async saveRun(meta: RunMeta): Promise<void> {
		// Update the run
		this.runs.set(meta.runId, meta)

		// Enforce max runs limit with LRU eviction
		if (this.runs.size > this.config.maxRuns) {
			this.evictOldest()
		}

		codeLogger.debug(`Saved run ${meta.runId}`, { status: meta.status })
	}

	/**
	 * Delete a run
	 */
	async deleteRun(runId: string): Promise<void> {
		this.runs.delete(runId)
		codeLogger.debug(`Deleted run ${runId}`)
	}

	/**
	 * Evict the oldest run (LRU)
	 */
	private evictOldest(): void {
		let oldestId: string | null = null
		let oldestTime = Infinity

		for (const [id, meta] of this.runs) {
			const time = new Date(meta.createdAt).getTime()
			if (time < oldestTime) {
				oldestTime = time
				oldestId = id
			}
		}

		if (oldestId) {
			this.runs.delete(oldestId)
			codeLogger.debug(`Evicted oldest run ${oldestId}`)
		}
	}

	/**
	 * Clear all runs
	 */
	clear(): void {
		this.runs.clear()
	}

	/**
	 * Get the current number of runs stored
	 */
	get size(): number {
		return this.runs.size
	}
}

/**
 * Create an in-memory run store
 */
export function createMemoryRunStore(config?: MemoryRunStoreConfig): MemoryRunStore {
	return new MemoryRunStore(config)
}
