/**
 * Flashcore v1 Index Persistence Manager (Phase 6, spec rev 4.3)
 *
 * Manages persistence of derived index structures (filters, sorted indexes).
 * Tracks dirty state and handles flush strategies including graceful shutdown.
 *
 * Key features:
 * - Dirty tracking per model/field
 * - Flush strategies: immediate, batched, periodic
 * - Shutdown handlers (SIGINT/SIGTERM/beforeExit)
 * - Atomic batch persistence when adapter supports it
 * - Epoch markers for stale detection
 */

import type { FlashcoreAdapter, BatchOperation } from '../adapter/types.js'
import type { CuckooFilter, CuckooFilterData } from './filter.js'
import type { SortedIndex, SortedIndexData } from './sorted.js'
import { buildModelKey } from '../core/keys.js'
import {
	FILTER_KEY_SUFFIX,
	INDEX_KEY_PREFIX,
	DEFAULT_INDEX_PERSISTENCE_SETTINGS,
	DEFAULT_INDEX_MEMORY_LIMIT,
	DEFAULT_MAX_IN_MEMORY_RECORDS
} from '../core/constants.js'

/**
 * Options for the IndexPersistenceManager.
 */
export interface IndexPersistenceOptions {
	/** Persistence strategy: immediate, batched, or periodic */
	strategy?: 'immediate' | 'batched' | 'periodic'
	/** Interval for periodic flush in milliseconds */
	intervalMs?: number
	/** Whether to flush on process shutdown */
	flushOnShutdown?: boolean
	/** Maximum time to wait for flush on shutdown (ms) */
	shutdownTimeout?: number
	/** Maximum dirty entries before forcing a flush (for batched strategy) */
	batchSize?: number
	/** Maximum memory for indexes in bytes */
	memoryLimit?: number
	/** Maximum records to hold in memory */
	maxInMemoryRecords?: number
}

/**
 * Entry representing a dirty index that needs persistence.
 */
interface DirtyEntry {
	modelName: string
	namespace?: string
	field: string | null // null for filter, field name for sorted index
	type: 'filter' | 'sorted'
	dirtyAt: number
}

/**
 * Persisted epoch data for stale detection.
 */
export interface EpochData {
	version: 1
	epoch: number
	persistedAt: number
	modelName: string
}

/**
 * Result of a flush operation.
 */
export interface FlushResult {
	flushed: number
	errors: Array<{ modelName: string; field: string | null; error: Error }>
	durationMs: number
}

/**
 * Index Persistence Manager.
 *
 * Coordinates persistence of filters and sorted indexes across models.
 * Supports multiple flush strategies and graceful shutdown.
 */
/**
 * LRU tracking entry for memory management.
 */
interface LRUEntry {
	key: string
	type: 'filter' | 'sorted'
	lastAccess: number
	estimatedSize: number
}

export class IndexPersistenceManager {
	private adapter: FlashcoreAdapter
	private options: Required<IndexPersistenceOptions>
	private dirty: Map<string, DirtyEntry> = new Map()
	private filters: Map<string, CuckooFilter> = new Map() // modelKey -> filter
	private sortedIndexes: Map<string, SortedIndex> = new Map() // modelKey:field -> index
	private epochs: Map<string, number> = new Map() // modelKey -> epoch
	private periodicTimer: ReturnType<typeof setInterval> | null = null
	private isShuttingDown = false
	private shutdownHandlersInstalled = false
	private flushInProgress = false
	private pendingFlushPromise: Promise<FlushResult> | null = null
	private shutdownHandler: (() => Promise<void>) | null = null

	// Memory management (Phase 6)
	private lruEntries: Map<string, LRUEntry> = new Map()
	private currentMemoryUsage = 0
	private static readonly STALE_SUFFIX = 'index-stale'

	constructor(adapter: FlashcoreAdapter, options?: IndexPersistenceOptions) {
		this.adapter = adapter
		this.options = {
			strategy: options?.strategy ?? 'batched',
			intervalMs: options?.intervalMs ?? DEFAULT_INDEX_PERSISTENCE_SETTINGS.intervalMs,
			flushOnShutdown: options?.flushOnShutdown ?? DEFAULT_INDEX_PERSISTENCE_SETTINGS.flushOnShutdown,
			shutdownTimeout: options?.shutdownTimeout ?? DEFAULT_INDEX_PERSISTENCE_SETTINGS.shutdownTimeout,
			batchSize: options?.batchSize ?? 100,
			memoryLimit: options?.memoryLimit ?? DEFAULT_INDEX_MEMORY_LIMIT,
			maxInMemoryRecords: options?.maxInMemoryRecords ?? DEFAULT_MAX_IN_MEMORY_RECORDS
		}
	}

	/**
	 * Initialize the persistence manager.
	 * Sets up periodic flush timer and shutdown handlers.
	 */
	init(): void {
		// Setup periodic flush if configured
		if (this.options.strategy === 'periodic' && this.options.intervalMs > 0) {
			this.scheduleFlush(this.options.intervalMs)
		}

		// Setup shutdown handlers
		if (this.options.flushOnShutdown) {
			this.setupShutdownHandlers()
		}
	}

	/**
	 * Shutdown the persistence manager.
	 * Flushes pending changes and cleans up timers.
	 */
	async shutdown(): Promise<void> {
		this.isShuttingDown = true

		// Remove shutdown handlers (prevents listener leaks in tests/re-inits)
		if (this.shutdownHandlersInstalled && this.shutdownHandler && typeof process !== 'undefined') {
			const off =
				(process as unknown as { off?: typeof process.off; removeListener?: typeof process.removeListener }).off ??
				(process as unknown as { removeListener?: typeof process.removeListener }).removeListener

			off?.call(process, 'SIGINT', this.shutdownHandler)
			off?.call(process, 'SIGTERM', this.shutdownHandler)
			off?.call(process, 'beforeExit', this.shutdownHandler)
			this.shutdownHandler = null
			this.shutdownHandlersInstalled = false
		}

		// Clear periodic timer
		if (this.periodicTimer) {
			clearInterval(this.periodicTimer)
			this.periodicTimer = null
		}

		// Flush all pending changes with timeout
		if (this.dirty.size > 0) {
			let timeout: ReturnType<typeof setTimeout> | null = null
			const timeoutPromise = new Promise<FlushResult>((_, reject) => {
				timeout = setTimeout(() => reject(new Error('Shutdown flush timeout')), this.options.shutdownTimeout)
				timeout?.unref?.()
			})

			try {
				await Promise.race([this.flushAll(), timeoutPromise])
			} catch {
				await this.markDirtyEntriesStale(Array.from(this.dirty.values()))
			} finally {
				if (timeout) {
					clearTimeout(timeout)
				}
			}
		}

		// Clear internal state
		this.dirty.clear()
		this.filters.clear()
		this.sortedIndexes.clear()
		this.epochs.clear()
	}

	/**
	 * Register a filter for persistence tracking.
	 */
	registerFilter(modelName: string, filter: CuckooFilter, namespace?: string): void {
		const key = this.buildFilterKey(modelName, namespace)
		this.filters.set(key, filter)
		this.incrementEpoch(key)
	}

	/**
	 * Register a sorted index for persistence tracking.
	 */
	registerSortedIndex(modelName: string, field: string, index: SortedIndex, namespace?: string): void {
		const key = this.buildIndexKey(modelName, field, namespace)
		this.sortedIndexes.set(key, index)
		this.incrementEpoch(this.buildFilterKey(modelName, namespace)) // Use model-level epoch
	}

	/**
	 * Mark a filter as dirty (needs persistence).
	 */
	markFilterDirty(modelName: string, namespace?: string): void {
		const key = this.buildFilterKey(modelName, namespace)
		this.dirty.set(key, {
			modelName,
			namespace,
			field: null,
			type: 'filter',
			dirtyAt: Date.now()
		})

		this.incrementEpoch(key)
		this.maybeFlush()
	}

	/**
	 * Mark a sorted index as dirty (needs persistence).
	 */
	markIndexDirty(modelName: string, field: string, namespace?: string): void {
		const key = this.buildIndexKey(modelName, field, namespace)
		this.dirty.set(key, {
			modelName,
			namespace,
			field,
			type: 'sorted',
			dirtyAt: Date.now()
		})

		this.incrementEpoch(this.buildFilterKey(modelName, namespace))
		this.maybeFlush()
	}

	/**
	 * Check if there are any dirty indexes pending flush.
	 */
	hasDirty(): boolean {
		return this.dirty.size > 0
	}

	/**
	 * Get the number of dirty entries.
	 */
	getDirtyCount(): number {
		return this.dirty.size
	}

	/**
	 * Get the current epoch for a model.
	 */
	getEpoch(modelName: string, namespace?: string): number {
		const key = this.buildFilterKey(modelName, namespace)
		return this.epochs.get(key) ?? 0
	}

	/**
	 * Flush all dirty indexes to storage.
	 */
	async flushAll(): Promise<FlushResult> {
		// Coalesce concurrent flush requests
		if (this.flushInProgress && this.pendingFlushPromise) {
			return this.pendingFlushPromise
		}

		this.flushInProgress = true
		this.pendingFlushPromise = this.executeFlush()

		try {
			return await this.pendingFlushPromise
		} finally {
			this.flushInProgress = false
			this.pendingFlushPromise = null
		}
	}

	/**
	 * Flush dirty indexes for a specific model.
	 */
	async flushModel(modelName: string, namespace?: string): Promise<FlushResult> {
		const startTime = Date.now()
		const result: FlushResult = { flushed: 0, errors: [], durationMs: 0 }

		const entriesToFlush: Array<[string, DirtyEntry]> = []
		const filterKey = this.buildFilterKey(modelName, namespace)

		for (const [key, entry] of this.dirty) {
			if (key.startsWith(filterKey)) {
				entriesToFlush.push([key, entry])
			}
		}

		await this.flushEntries(entriesToFlush, result)
		result.durationMs = Date.now() - startTime

		return result
	}

	/**
	 * Schedule periodic flush.
	 */
	scheduleFlush(intervalMs: number): void {
		if (this.periodicTimer) {
			clearInterval(this.periodicTimer)
		}

		this.options.intervalMs = intervalMs

		if (intervalMs > 0) {
			this.periodicTimer = setInterval(() => {
				if (this.dirty.size > 0 && !this.isShuttingDown) {
					this.flushAll().catch(() => {
						// Swallow errors in periodic flush - they're tracked in result
					})
				}
			}, intervalMs)
			this.periodicTimer.unref?.()
		}
	}

	/**
	 * Setup process shutdown handlers.
	 */
	setupShutdownHandlers(): void {
		if (this.shutdownHandlersInstalled) {
			return
		}

		this.shutdownHandler = async () => {
			if (!this.isShuttingDown) {
				await this.shutdown()
			}
		}

		// Handle graceful shutdown signals
		if (typeof process !== 'undefined' && process.on) {
			process.on('SIGINT', this.shutdownHandler)
			process.on('SIGTERM', this.shutdownHandler)
			process.on('beforeExit', this.shutdownHandler)
		}

		this.shutdownHandlersInstalled = true
	}

	/**
	 * Persist epoch data for stale detection.
	 */
	async persistEpoch(modelName: string, namespace?: string): Promise<void> {
		const key = this.buildFilterKey(modelName, namespace)
		const epoch = this.epochs.get(key) ?? 0

		const epochData: EpochData = {
			version: 1,
			epoch,
			persistedAt: Date.now(),
			modelName
		}

		const storageKey = buildModelKey(modelName, 'epoch', namespace)
		await this.adapter.set(storageKey, epochData)
	}

	/**
	 * Load epoch data to check for stale indexes.
	 */
	async loadEpoch(modelName: string, namespace?: string): Promise<EpochData | null> {
		const storageKey = buildModelKey(modelName, 'epoch', namespace)
		const data = (await this.adapter.get(storageKey)) as EpochData | undefined

		if (data && data.version === 1) {
			const key = this.buildFilterKey(modelName, namespace)
			this.epochs.set(key, data.epoch)
			return data
		}

		return null
	}

	/**
	 * Check if persisted indexes are stale (epoch mismatch).
	 */
	async isStale(modelName: string, namespace?: string): Promise<boolean> {
		if (await this.hasStaleMarker(modelName, namespace)) {
			return true
		}

		// Get current epoch BEFORE loading persisted epoch (loadEpoch overwrites)
		const currentEpoch = this.getEpoch(modelName, namespace)

		const storageKey = buildModelKey(modelName, 'epoch', namespace)
		const data = (await this.adapter.get(storageKey)) as EpochData | undefined

		if (!data || data.version !== 1) {
			// No persisted epoch = assume stale
			return true
		}

		return currentEpoch !== data.epoch
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	private buildFilterKey(modelName: string, namespace?: string): string {
		return namespace ? `${namespace}::${modelName}` : modelName
	}

	private buildIndexKey(modelName: string, field: string, namespace?: string): string {
		const modelKey = this.buildFilterKey(modelName, namespace)
		return `${modelKey}:${field}`
	}

	private incrementEpoch(key: string): void {
		const current = this.epochs.get(key) ?? 0
		this.epochs.set(key, current + 1)
	}

	private maybeFlush(): void {
		if (this.isShuttingDown) {
			return
		}

		switch (this.options.strategy) {
			case 'immediate':
				this.flushAll().catch(() => {})
				break

			case 'batched':
				if (this.dirty.size >= this.options.batchSize) {
					this.flushAll().catch(() => {})
				}
				break

			// 'periodic' is handled by the timer
		}
	}

	private async executeFlush(): Promise<FlushResult> {
		const startTime = Date.now()
		const result: FlushResult = { flushed: 0, errors: [], durationMs: 0 }

		// Take snapshot of dirty entries
		const entriesToFlush = Array.from(this.dirty.entries())

		await this.flushEntries(entriesToFlush, result)
		result.durationMs = Date.now() - startTime

		return result
	}

	private async flushEntries(entries: Array<[string, DirtyEntry]>, result: FlushResult): Promise<void> {
		if (entries.length === 0) {
			return
		}

		// Try atomic batch if adapter supports it
		if (this.adapter.atomicBatch && entries.length > 1) {
			try {
				await this.flushAtomic(entries)

				// Remove from dirty set
				for (const [key] of entries) {
					this.dirty.delete(key)
				}

				result.flushed = entries.length
				return
			} catch (error) {
				await this.markDirtyEntriesStale(entries.map(([, entry]) => entry))
				void error
				// Fall back to individual writes
			}
		}

		// Individual writes
		for (const [key, entry] of entries) {
			try {
				if (entry.type === 'filter') {
					await this.persistFilter(entry.modelName, key, entry.namespace)
				} else {
					await this.persistSortedIndex(entry.modelName, entry.field!, key, entry.namespace)
				}

				await this.persistEpoch(entry.modelName, entry.namespace)
				await this.clearStaleMarker(entry.modelName, entry.namespace)
				this.dirty.delete(key)
				result.flushed++
			} catch (err) {
				await this.markDirtyStale(entry)
				result.errors.push({
					modelName: entry.modelName,
					field: entry.field,
					error: err instanceof Error ? err : new Error(String(err))
				})
			}
		}
	}

	private async flushAtomic(entries: Array<[string, DirtyEntry]>): Promise<void> {
		const ops: BatchOperation[] = []
		const epochs = new Set<string>()

		for (const [key, entry] of entries) {
			if (entry.type === 'filter') {
				const filter = this.filters.get(key)
				if (filter) {
					const storageKey = buildModelKey(entry.modelName, FILTER_KEY_SUFFIX, entry.namespace)
					ops.push({ type: 'set', key: storageKey, value: filter.serialize() })
				}
			} else if (entry.field) {
				const index = this.sortedIndexes.get(key)
				if (index) {
					const storageKey = buildModelKey(entry.modelName, `${INDEX_KEY_PREFIX}${entry.field}`, entry.namespace)
					ops.push({ type: 'set', key: storageKey, value: index.serialize() })
				}
			}

			const epochStorageKey = buildModelKey(entry.modelName, 'epoch', entry.namespace)
			if (!epochs.has(epochStorageKey)) {
				epochs.add(epochStorageKey)
				ops.push({
					type: 'set',
					key: epochStorageKey,
					value: {
						version: 1,
						epoch: this.getEpoch(entry.modelName, entry.namespace),
						persistedAt: Date.now(),
						modelName: entry.modelName
					} satisfies EpochData
				})
			}

			ops.push({
				type: 'delete',
				key: this.buildStaleMarkerKey(entry.modelName, entry.namespace)
			})
		}

		if (ops.length > 0) {
			await this.adapter.atomicBatch!(ops)
		}
	}

	private async persistFilter(modelName: string, key: string, namespace?: string): Promise<void> {
		const filter = this.filters.get(key)
		if (!filter) {
			return
		}

		const data: CuckooFilterData = filter.serialize()
		const storageKey = buildModelKey(modelName, FILTER_KEY_SUFFIX, namespace)
		await this.adapter.set(storageKey, data)
	}

	private async persistSortedIndex(modelName: string, field: string, key: string, namespace?: string): Promise<void> {
		const index = this.sortedIndexes.get(key)
		if (!index) {
			return
		}

		const data: SortedIndexData = index.serialize()
		const storageKey = buildModelKey(modelName, `${INDEX_KEY_PREFIX}${field}`, namespace)
		await this.adapter.set(storageKey, data)
	}

	// ========================================================================
	// Memory Management (Phase 6)
	// ========================================================================

	/**
	 * Get current memory usage in bytes.
	 */
	getMemoryUsage(): number {
		return this.currentMemoryUsage
	}

	/**
	 * Get the configured memory limit.
	 */
	getMemoryLimit(): number {
		return this.options.memoryLimit
	}

	/**
	 * Track memory usage for a filter.
	 */
	trackFilterMemory(modelName: string, filter: CuckooFilter, namespace?: string): void {
		const key = this.buildFilterKey(modelName, namespace)
		const estimatedSize = this.estimateFilterSize(filter)

		// Update memory usage
		const existing = this.lruEntries.get(key)
		if (existing) {
			this.currentMemoryUsage -= existing.estimatedSize
		}
		this.currentMemoryUsage += estimatedSize

		// Update LRU entry
		this.lruEntries.set(key, {
			key,
			type: 'filter',
			lastAccess: Date.now(),
			estimatedSize
		})

		// Check if we need to evict
		this.maybeEvict()
	}

	/**
	 * Track memory usage for a sorted index.
	 */
	trackIndexMemory(modelName: string, field: string, index: SortedIndex, namespace?: string): void {
		const key = this.buildIndexKey(modelName, field, namespace)
		const estimatedSize = this.estimateSortedIndexSize(index)

		// Update memory usage
		const existing = this.lruEntries.get(key)
		if (existing) {
			this.currentMemoryUsage -= existing.estimatedSize
		}
		this.currentMemoryUsage += estimatedSize

		// Update LRU entry
		this.lruEntries.set(key, {
			key,
			type: 'sorted',
			lastAccess: Date.now(),
			estimatedSize
		})

		// Check if we need to evict
		this.maybeEvict()
	}

	/**
	 * Mark an entry as recently accessed (for LRU ordering).
	 */
	touchEntry(modelName: string, field: string | null, namespace?: string): void {
		const key = field
			? this.buildIndexKey(modelName, field, namespace)
			: this.buildFilterKey(modelName, namespace)

		const entry = this.lruEntries.get(key)
		if (entry) {
			entry.lastAccess = Date.now()
		}
	}

	/**
	 * Remove an entry from memory tracking.
	 */
	removeFromMemory(modelName: string, field: string | null, namespace?: string): void {
		const key = field
			? this.buildIndexKey(modelName, field, namespace)
			: this.buildFilterKey(modelName, namespace)

		const entry = this.lruEntries.get(key)
		if (entry) {
			this.currentMemoryUsage -= entry.estimatedSize
			this.lruEntries.delete(key)
		}
	}

	/**
	 * Estimate the memory size of a CuckooFilter.
	 */
	private estimateFilterSize(filter: CuckooFilter): number {
		// Serialize and estimate size (2 bytes per character for UTF-16)
		const serialized = filter.serialize()
		return JSON.stringify(serialized).length * 2
	}

	/**
	 * Estimate the memory size of a SortedIndex.
	 */
	private estimateSortedIndexSize(index: SortedIndex): number {
		// Serialize and estimate size (2 bytes per character for UTF-16)
		const serialized = index.serialize()
		return JSON.stringify(serialized).length * 2
	}

	/**
	 * Check if we need to evict entries and do so if necessary.
	 */
	private maybeEvict(): void {
		if (this.isShuttingDown) {
			return
		}

		while (this.currentMemoryUsage > this.options.memoryLimit && this.lruEntries.size > 0) {
			// Find the least recently used entry
			const lru = this.findLRUEntry(true)
			if (!lru) {
				break
			}

			this.evictEntry(lru)
		}
	}

	/**
	 * Find the least recently used entry.
	 */
	private findLRUEntry(skipDirty = false): LRUEntry | null {
		let oldest: LRUEntry | null = null

		for (const entry of this.lruEntries.values()) {
			if (skipDirty && this.dirty.has(entry.key)) {
				continue
			}

			if (!oldest || entry.lastAccess < oldest.lastAccess) {
				oldest = entry
			}
		}

		return oldest
	}

	/**
	 * Evict an entry from memory (persist if dirty first).
	 */
	private evictEntry(entry: LRUEntry): void {
		if (this.dirty.has(entry.key)) {
			return
		}

		// Remove from tracking
		this.currentMemoryUsage -= entry.estimatedSize
		this.lruEntries.delete(entry.key)

		// Remove from in-memory storage
		if (entry.type === 'filter') {
			this.filters.delete(entry.key)
		} else {
			this.sortedIndexes.delete(entry.key)
		}
	}

	async hasStaleMarker(modelName: string, namespace?: string): Promise<boolean> {
		return this.adapter.has(this.buildStaleMarkerKey(modelName, namespace))
	}

	private buildStaleMarkerKey(modelName: string, namespace?: string): string {
		return buildModelKey(modelName, IndexPersistenceManager.STALE_SUFFIX, namespace)
	}

	private async clearStaleMarker(modelName: string, namespace?: string): Promise<void> {
		await this.adapter.delete(this.buildStaleMarkerKey(modelName, namespace))
	}

	private async markDirtyEntriesStale(entries: DirtyEntry[]): Promise<void> {
		const unique = new Map<string, DirtyEntry>()
		for (const entry of entries) {
			const key = this.buildStaleMarkerKey(entry.modelName, entry.namespace)
			unique.set(key, entry)
		}

		await Promise.all(Array.from(unique.values(), (entry) => this.markDirtyStale(entry)))
	}

	private async markDirtyStale(entry: DirtyEntry): Promise<void> {
		try {
			await this.adapter.set(this.buildStaleMarkerKey(entry.modelName, entry.namespace), {
				version: 1,
				modelName: entry.modelName,
				namespace: entry.namespace,
				staleAt: Date.now()
			})
		} catch {
			// Best-effort only. The original flush failure remains the authoritative error.
		}
	}
}

// ========================================================================
// Global Instance (like WAL manager pattern)
// ========================================================================

/**
 * Global IndexPersistenceManager instance.
 * Set during FlashcoreSystem.init(), null when not initialized.
 */
let _indexPersistenceManager: IndexPersistenceManager | null = null

/**
 * Set the global IndexPersistenceManager instance.
 * Called by FlashcoreSystem.init().
 */
export function setIndexPersistenceManager(manager: IndexPersistenceManager | null): void {
	_indexPersistenceManager = manager
}

/**
 * Get the global IndexPersistenceManager instance.
 * Returns null if Flashcore is not initialized.
 */
export function getIndexPersistenceManager(): IndexPersistenceManager | null {
	return _indexPersistenceManager
}
