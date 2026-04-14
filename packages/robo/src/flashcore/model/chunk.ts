/**
 * Flashcore v1 (spec rev 4.3) Chunk Manager (Phase 5)
 *
 * Manages chunk storage for model records with:
 * - LRU cache with configurable size
 * - Size-aware chunk selection
 * - Large record segmentation
 * - Corruption detection
 */

import type { FlashcoreAdapter } from '../adapter/types.js'
import { buildModelKey } from '../core/keys.js'
import { DataCorruptionError, TransactionConflictError, AdapterError, StorageExhaustedError } from '../core/errors.js'
import {
	DEFAULT_MAX_RECORDS_PER_CHUNK,
	DEFAULT_MAX_CHUNK_SIZE,
	DEFAULT_CHUNK_CACHE_SIZE,
	STORAGE_EXHAUSTION_PATTERNS
} from '../core/constants.js'
import type { ChunkData } from '../schema/types.js'
import type { Catalog } from './catalog.js'

/**
 * LRU cache entry for a chunk.
 */
interface CacheEntry {
	data: ChunkData
	accessTime: number
}

/**
 * Chunk manager options.
 */
export interface ChunkManagerOptions {
	adapter: FlashcoreAdapter
	modelName: string
	namespace?: string
	recordsPerChunk?: number
	maxChunkSize?: number
	cacheSize?: number
}

/**
 * Result of checking if a record needs segmentation.
 */
export interface SizeCheckResult {
	needsSegmentation: boolean
	estimatedSize: number
}

/**
 * Chunk manager for a single model.
 *
 * Handles loading, saving, and assigning chunks with:
 * - LRU cache eviction
 * - Size-aware chunk selection
 * - Support for large record segmentation
 */
export class ChunkManager {
	private readonly adapter: FlashcoreAdapter
	private readonly modelName: string
	private readonly namespace?: string
	private readonly recordsPerChunk: number
	private readonly maxChunkSize: number
	private readonly cacheSize: number

	/**
	 * LRU cache of loaded chunks.
	 */
	private cache = new Map<number, CacheEntry>()

	/**
	 * Track cache access order for LRU eviction.
	 */
	private cacheOrder: number[] = []

	constructor(options: ChunkManagerOptions) {
		this.adapter = options.adapter
		this.modelName = options.modelName
		this.namespace = options.namespace
		this.recordsPerChunk = options.recordsPerChunk ?? DEFAULT_MAX_RECORDS_PER_CHUNK
		this.maxChunkSize = this.computeMaxChunkSize(options.maxChunkSize)
		this.cacheSize = options.cacheSize ?? DEFAULT_CHUNK_CACHE_SIZE
	}

	/**
	 * Compute max chunk size based on adapter limits and config.
	 */
	private computeMaxChunkSize(configuredSize?: number): number {
		const adapterMax = this.adapter.maxValueSize
		const defaultMax = DEFAULT_MAX_CHUNK_SIZE

		if (configuredSize !== undefined) {
			// Use configured size, but cap at adapter limit
			if (adapterMax !== undefined) {
				return Math.min(configuredSize, Math.floor(adapterMax * 0.9))
			}
			return configuredSize
		}

		// Use adapter limit if available (with 90% margin for safety)
		if (adapterMax !== undefined) {
			return Math.min(defaultMax, Math.floor(adapterMax * 0.9))
		}

		return defaultMax
	}

	/**
	 * Get the max chunk size.
	 */
	getMaxChunkSize(): number {
		return this.maxChunkSize
	}

	/**
	 * Get the max records per chunk.
	 */
	getMaxRecordsPerChunk(): number {
		return this.recordsPerChunk
	}

	/**
	 * Build the storage key for a chunk.
	 */
	private buildChunkKey(chunkId: number): string {
		return buildModelKey(this.modelName, `chunk:${chunkId}`, this.namespace)
	}

	/**
	 * Build the storage key for a record segment.
	 */
	buildSegmentKey(recordId: string, segmentIndex: number): string {
		return buildModelKey(this.modelName, `seg:${recordId}:${segmentIndex}`, this.namespace)
	}

	/**
	 * Update LRU cache access time.
	 */
	private touchCache(chunkId: number): void {
		// Remove from current position in order
		const idx = this.cacheOrder.indexOf(chunkId)
		if (idx !== -1) {
			this.cacheOrder.splice(idx, 1)
		}
		// Add to end (most recently used)
		this.cacheOrder.push(chunkId)
	}

	/**
	 * Evict oldest entries if cache is full.
	 */
	private evictIfNeeded(): void {
		while (this.cache.size >= this.cacheSize && this.cacheOrder.length > 0) {
			const oldest = this.cacheOrder.shift()
			if (oldest !== undefined) {
				this.cache.delete(oldest)
			}
		}
	}

	/**
	 * Load a chunk from storage.
	 *
	 * @param chunkId - Chunk ID to load
	 * @returns Chunk data or empty object if not found
	 */
	async loadChunk(chunkId: number): Promise<ChunkData> {
		// Check cache first
		const cached = this.cache.get(chunkId)
		if (cached) {
			cached.accessTime = Date.now()
			this.touchCache(chunkId)
			return cached.data
		}

		const key = this.buildChunkKey(chunkId)
		let data: unknown

		try {
			data = await this.adapter.get(key)
		} catch (error) {
			this.wrapAdapterError(error, 'get', key)
		}

		if (data === undefined || data === null) {
			// Empty chunk
			const empty: ChunkData = {}
			this.evictIfNeeded()
			this.cache.set(chunkId, { data: empty, accessTime: Date.now() })
			this.touchCache(chunkId)
			return empty
		}

		// Validate chunk data is an object
		if (typeof data !== 'object' || Array.isArray(data)) {
			throw new DataCorruptionError(
				`Chunk ${chunkId} for model "${this.modelName}" is corrupted. ` +
					`Expected object, got ${Array.isArray(data) ? 'array' : typeof data}. ` +
					`Run 'robo db repair --model=${this.modelName}' to rebuild.`,
				{
					model: this.modelName,
					structure: 'chunk',
					repairGuidance: `Run 'robo db repair --model=${this.modelName}'`
				}
			)
		}

		// Cast and cache
		const chunk = data as ChunkData
		this.evictIfNeeded()
		this.cache.set(chunkId, { data: chunk, accessTime: Date.now() })
		this.touchCache(chunkId)
		return chunk
	}

	/**
	 * Save a chunk to storage.
	 *
	 * @param chunkId - Chunk ID
	 * @param data - Chunk data
	 */
	async saveChunk(chunkId: number, data: ChunkData): Promise<void> {
		const key = this.buildChunkKey(chunkId)

		try {
			await this.adapter.set(key, data)
		} catch (error) {
			this.wrapAdapterError(error, 'set', key)
		}

		// Update cache (always update on write)
		this.evictIfNeeded()
		this.cache.set(chunkId, { data, accessTime: Date.now() })
		this.touchCache(chunkId)
	}

	/**
	 * Save a chunk with CAS (compare-and-swap) if available.
	 * Falls back to regular save if CAS is not supported.
	 *
	 * @param chunkId - Chunk ID
	 * @param data - Chunk data
	 * @param expectedData - Expected current data (for CAS)
	 * @throws TransactionConflictError if CAS fails
	 */
	async saveChunkWithCAS(chunkId: number, data: ChunkData, expectedData?: ChunkData): Promise<void> {
		const key = this.buildChunkKey(chunkId)

		if (this.adapter.compareAndSwap && expectedData !== undefined) {
			try {
				const success = await this.adapter.compareAndSwap(key, expectedData, data)
				if (!success) {
					// CAS failed - invalidate cache and signal retry needed
					this.cache.delete(chunkId)
					const idx = this.cacheOrder.indexOf(chunkId)
					if (idx !== -1) {
						this.cacheOrder.splice(idx, 1)
					}
					throw new TransactionConflictError('Chunk CAS failed - concurrent modification detected', {
						model: this.modelName,
						id: `chunk:${chunkId}`
					})
				}
			} catch (error) {
				if (error instanceof TransactionConflictError) {
					throw error
				}
				this.wrapAdapterError(error, 'compareAndSwap', key)
			}
		} else {
			try {
				await this.adapter.set(key, data)
			} catch (error) {
				this.wrapAdapterError(error, 'set', key)
			}
		}

		// Update cache
		this.evictIfNeeded()
		this.cache.set(chunkId, { data, accessTime: Date.now() })
		this.touchCache(chunkId)
	}

	/**
	 * Delete a chunk from storage.
	 *
	 * @param chunkId - Chunk ID to delete
	 */
	async deleteChunk(chunkId: number): Promise<void> {
		const key = this.buildChunkKey(chunkId)

		try {
			await this.adapter.delete(key)
		} catch (error) {
			this.wrapAdapterError(error, 'delete', key)
		}

		// Remove from cache
		this.cache.delete(chunkId)
		const idx = this.cacheOrder.indexOf(chunkId)
		if (idx !== -1) {
			this.cacheOrder.splice(idx, 1)
		}
	}

	/**
	 * Estimate the serialized size of a record.
	 *
	 * @param record - Record to estimate
	 * @returns Estimated size in bytes
	 */
	estimateRecordSize(record: unknown): number {
		// JSON.stringify length * 2 for UTF-16 worst case
		// Add some overhead for the record ID key in the chunk
		const json = JSON.stringify(record)
		return json.length * 2 + 100 // 100 bytes overhead
	}

	/**
	 * Check if a record needs to be stored as segments.
	 *
	 * @param record - Record to check
	 * @returns Size check result
	 */
	checkRecordSize(record: unknown): SizeCheckResult {
		const estimatedSize = this.estimateRecordSize(record)
		// Record needs segmentation if it exceeds ~80% of max chunk size
		// (to leave room for other records and overhead)
		const threshold = Math.floor(this.maxChunkSize * 0.8)
		return {
			needsSegmentation: estimatedSize > threshold,
			estimatedSize
		}
	}

	/**
	 * Select a chunk for inserting a new record.
	 *
	 * @param catalog - Current catalog
	 * @param recordSize - Estimated size of the new record
	 * @returns Chunk ID to use, or -1 if record needs segmentation
	 */
	selectChunkForInsert(catalog: Catalog, recordSize?: number): number {
		const chunkIds = catalog.getChunkIds()
		const size = recordSize ?? 0

		// Check if record is too large for any chunk
		if (size > this.maxChunkSize * 0.8) {
			return -1 // Signal: needs segmentation
		}

		// Find first chunk with room (by count and size)
		for (const chunkId of chunkIds) {
			const count = catalog.getChunkCount(chunkId)
			const chunkSize = catalog.getChunkSize(chunkId)

			// Check both count and size limits
			if (count < this.recordsPerChunk && chunkSize + size <= this.maxChunkSize) {
				return chunkId
			}
		}

		// All chunks full, create new one
		if (chunkIds.length === 0) {
			return 0
		}

		return Math.max(...chunkIds) + 1
	}

	/**
	 * Get a record from a chunk.
	 *
	 * @param chunkId - Chunk ID
	 * @param recordId - Record ID
	 * @returns Record or undefined
	 */
	async getRecord(chunkId: number, recordId: string): Promise<unknown | undefined> {
		const chunk = await this.loadChunk(chunkId)
		return chunk[recordId]
	}

	/**
	 * Set a record in a chunk.
	 *
	 * @param chunkId - Chunk ID
	 * @param recordId - Record ID
	 * @param record - Record data
	 */
	async setRecord(chunkId: number, recordId: string, record: unknown): Promise<void> {
		const chunk = await this.loadChunk(chunkId)
		chunk[recordId] = record
		await this.saveChunk(chunkId, chunk)
	}

	/**
	 * Delete a record from a chunk.
	 *
	 * @param chunkId - Chunk ID
	 * @param recordId - Record ID
	 * @returns True if record existed
	 */
	async deleteRecord(chunkId: number, recordId: string): Promise<boolean> {
		const chunk = await this.loadChunk(chunkId)
		if (!(recordId in chunk)) {
			return false
		}
		delete chunk[recordId]
		await this.saveChunk(chunkId, chunk)
		return true
	}

	// =========================================================================
	// Record Segmentation
	// =========================================================================

	/**
	 * Save a large record as segments.
	 *
	 * @param recordId - Record ID
	 * @param record - Record data
	 * @returns Array of segment IDs (as strings, "0", "1", ...)
	 */
	async saveSegmentedRecord(recordId: string, record: unknown): Promise<string[]> {
		const serialized = JSON.stringify(record)
		const segmentSize = Math.floor(this.maxChunkSize * 0.9) // Leave 10% margin
		const numSegments = Math.ceil(serialized.length / segmentSize)
		const segmentIds: string[] = []

		for (let i = 0; i < numSegments; i++) {
			const segmentData = serialized.slice(i * segmentSize, (i + 1) * segmentSize)
			const segmentKey = this.buildSegmentKey(recordId, i)

			try {
				await this.adapter.set(segmentKey, segmentData)
			} catch (error) {
				// Clean up already-written segments on failure
				for (let j = 0; j < i; j++) {
					const cleanupKey = this.buildSegmentKey(recordId, j)
					try {
						await this.adapter.delete(cleanupKey)
					} catch {
						// Ignore cleanup errors
					}
				}
				this.wrapAdapterError(error, 'set', segmentKey)
			}

			segmentIds.push(`${i}`)
		}

		return segmentIds
	}

	/**
	 * Load a segmented record.
	 *
	 * @param recordId - Record ID
	 * @param segmentIds - Array of segment IDs
	 * @returns Reconstructed record
	 */
	async loadSegmentedRecord(recordId: string, segmentIds: string[]): Promise<unknown> {
		const parts: string[] = []

		for (const segId of segmentIds) {
			const key = this.buildSegmentKey(recordId, parseInt(segId))
			let segment: unknown

			try {
				segment = await this.adapter.get(key)
			} catch (error) {
				this.wrapAdapterError(error, 'get', key)
			}

			if (segment === undefined) {
				throw new DataCorruptionError(
					`Missing segment ${segId} for record "${recordId}" in model "${this.modelName}". ` +
						`Run 'robo db repair --model=${this.modelName}' to rebuild.`,
					{
						model: this.modelName,
						structure: 'chunk',
						repairGuidance: `Run 'robo db repair --model=${this.modelName}'`
					}
				)
			}

			if (typeof segment !== 'string') {
				throw new DataCorruptionError(
					`Corrupted segment ${segId} for record "${recordId}" in model "${this.modelName}". ` +
						`Expected string, got ${typeof segment}. ` +
						`Run 'robo db repair --model=${this.modelName}' to rebuild.`,
					{
						model: this.modelName,
						structure: 'chunk',
						repairGuidance: `Run 'robo db repair --model=${this.modelName}'`
					}
				)
			}

			parts.push(segment)
		}

		const fullJson = parts.join('')
		try {
			return JSON.parse(fullJson)
		} catch (error) {
			throw new DataCorruptionError(
				`Failed to parse segmented record "${recordId}" in model "${this.modelName}". ` +
					`The data may be corrupted. ` +
					`Run 'robo db repair --model=${this.modelName}' to rebuild.`,
				{
					model: this.modelName,
					structure: 'chunk',
					repairGuidance: `Run 'robo db repair --model=${this.modelName}'`,
					cause: error instanceof Error ? error : undefined
				}
			)
		}
	}

	/**
	 * Delete all segments for a record.
	 *
	 * @param recordId - Record ID
	 * @param segmentIds - Array of segment IDs
	 */
	async deleteSegmentedRecord(recordId: string, segmentIds: string[]): Promise<void> {
		for (const segId of segmentIds) {
			const key = this.buildSegmentKey(recordId, parseInt(segId))
			try {
				await this.adapter.delete(key)
			} catch (error) {
				// Log but don't fail on segment deletion errors
				// The catalog update is the authoritative change
			}
		}
	}

	/**
	 * Update a segmented record (delete old segments, write new ones).
	 *
	 * @param recordId - Record ID
	 * @param oldSegmentIds - Old segment IDs to delete
	 * @param record - New record data
	 * @returns New segment IDs
	 */
	async updateSegmentedRecord(recordId: string, oldSegmentIds: string[], record: unknown): Promise<string[]> {
		// Overwrite segments in-place and delete any excess old segments.
		// Segment IDs are positional ("0", "1", ...) and therefore collide across updates.
		// Writing new segments and then deleting "old" ones would delete the newly written
		// segments too. Instead, we:
		// 1) write all new segments to their canonical keys
		// 2) delete any trailing old segments beyond the new length

		const serialized = JSON.stringify(record)
		const segmentSize = Math.floor(this.maxChunkSize * 0.9) // Leave 10% margin
		const numSegments = Math.ceil(serialized.length / segmentSize)
		const newSegmentIds: string[] = []

		for (let i = 0; i < numSegments; i++) {
			const segmentData = serialized.slice(i * segmentSize, (i + 1) * segmentSize)
			const segmentKey = this.buildSegmentKey(recordId, i)

			try {
				await this.adapter.set(segmentKey, segmentData)
			} catch (error) {
				this.wrapAdapterError(error, 'set', segmentKey)
			}

			newSegmentIds.push(`${i}`)
		}

		// Delete any old segments that are no longer needed (when record shrinks)
		for (let i = numSegments; i < oldSegmentIds.length; i++) {
			const key = this.buildSegmentKey(recordId, parseInt(oldSegmentIds[i]))
			try {
				await this.adapter.delete(key)
			} catch {
				// Best-effort cleanup
			}
		}

		return newSegmentIds
	}

	// =========================================================================
	// Error Handling
	// =========================================================================

	/**
	 * Wrap adapter errors with appropriate Flashcore error types.
	 */
	private wrapAdapterError(error: unknown, operation: string, key?: string): never {
		const errorMessage = error instanceof Error ? error.message : String(error)

		// Check for storage exhaustion
		for (const pattern of STORAGE_EXHAUSTION_PATTERNS) {
			if (pattern.test(errorMessage)) {
				throw new StorageExhaustedError(
					`Storage exhausted during ${operation}${key ? ` for key "${key}"` : ''}. ` +
						`Free up disk space or increase storage quota.`,
					{ cause: error instanceof Error ? error : undefined }
				)
			}
		}

		// Generic adapter error
		throw new AdapterError(`Adapter ${operation} failed${key ? ` for key "${key}"` : ''}: ${errorMessage}`, {
			operation,
			key,
			cause: error instanceof Error ? error : undefined
		})
	}

	// =========================================================================
	// Cache Management
	// =========================================================================

	/**
	 * Clear the chunk cache.
	 */
	clearCache(): void {
		this.cache.clear()
		this.cacheOrder = []
	}

	/**
	 * Invalidate a specific chunk from cache.
	 *
	 * @param chunkId - Chunk ID to invalidate
	 */
	invalidateChunk(chunkId: number): void {
		this.cache.delete(chunkId)
		const idx = this.cacheOrder.indexOf(chunkId)
		if (idx !== -1) {
			this.cacheOrder.splice(idx, 1)
		}
	}

	/**
	 * Get cache statistics for debugging/metrics.
	 */
	getCacheStats(): { size: number; maxSize: number; entries: number[] } {
		return {
			size: this.cache.size,
			maxSize: this.cacheSize,
			entries: Array.from(this.cache.keys())
		}
	}
}

/**
 * Create a chunk manager for a model.
 */
export function createChunkManager(options: ChunkManagerOptions): ChunkManager {
	return new ChunkManager(options)
}
