/**
 * Flashcore v1 (spec rev 4.3) Catalog (v2 format)
 *
 * Authoritative mapping from record ID to chunk location.
 * The catalog is the source of truth for record existence.
 *
 * v2 changes:
 * - Support for segmented large records (kind: 'segments')
 * - Size tracking per chunk for better chunk selection
 */

import type { CatalogData, CatalogEntryData } from '../schema/types.js'

/**
 * Version number for catalog format.
 * v1: Basic chunk mapping
 * v2: Segment support + size tracking
 */
export const CATALOG_VERSION = 2

/**
 * Catalog entry for a single record.
 */
export interface CatalogEntry {
	id: string
	kind: 'chunk' | 'segments'
	chunkId?: number      // For kind='chunk'
	segmentIds?: string[] // For kind='segments'
	estimatedSize?: number // Estimated size in bytes for accurate size tracking
}

/**
 * Chunk statistics.
 */
export interface ChunkStats {
	count: number
	size: number  // Estimated size in bytes
}

/**
 * Catalog class for managing ID -> chunk mappings.
 *
 * The catalog is authoritative:
 * - If a record is in the catalog, it exists
 * - If a record is not in the catalog, it doesn't exist
 * - Derived structures (filter, indexes) are rebuilt from catalog + chunks
 */
export class Catalog {
	/**
	 * Mapping from record ID to chunk ID.
	 * For Phase 1, all records use 'chunk' kind.
	 */
	private entries = new Map<string, CatalogEntry>()

	/**
	 * Stats for each chunk (record count).
	 */
	private chunkStats = new Map<number, ChunkStats>()

	/**
	 * Get the chunk ID for a record.
	 *
	 * @param id - Record ID
	 * @returns Chunk ID or null if not found
	 */
	getChunkFor(id: string): number | null {
		const entry = this.entries.get(id)
		if (!entry || entry.kind !== 'chunk') {
			return null
		}
		return entry.chunkId ?? null
	}

	/**
	 * Get the full entry for a record.
	 *
	 * @param id - Record ID
	 * @returns Catalog entry or undefined
	 */
	getEntry(id: string): CatalogEntry | undefined {
		return this.entries.get(id)
	}

	/**
	 * Check if a record exists in the catalog.
	 *
	 * @param id - Record ID
	 * @returns True if exists
	 */
	has(id: string): boolean {
		return this.entries.has(id)
	}

	/**
	 * Add a regular chunked record to the catalog.
	 *
	 * @param id - Record ID
	 * @param chunkId - Chunk where record is stored
	 * @param recordSize - Optional estimated size of record in bytes
	 */
	addEntry(id: string, chunkId: number, recordSize?: number): void {
		// Remove from old location if exists
		const existing = this.entries.get(id)
		if (existing) {
			this.removeEntryStats(existing)
		}

		// Add to new location
		this.entries.set(id, {
			id,
			kind: 'chunk',
			chunkId,
			estimatedSize: recordSize
		})

		// Update chunk stats
		let stats = this.chunkStats.get(chunkId)
		if (!stats) {
			stats = { count: 0, size: 0 }
			this.chunkStats.set(chunkId, stats)
		}
		stats.count++
		if (recordSize !== undefined) {
			stats.size += recordSize
		}
	}

	/**
	 * Add a segmented (large) record to the catalog.
	 *
	 * @param id - Record ID
	 * @param segmentIds - Array of segment IDs
	 */
	addSegmentedEntry(id: string, segmentIds: string[]): void {
		// Remove from old location if exists
		const existing = this.entries.get(id)
		if (existing) {
			this.removeEntryStats(existing)
		}

		// Add as segmented record
		this.entries.set(id, {
			id,
			kind: 'segments',
			segmentIds
		})
	}

	/**
	 * Helper to remove stats for an entry.
	 */
	private removeEntryStats(entry: CatalogEntry): void {
		if (entry.kind === 'chunk' && entry.chunkId !== undefined) {
			const stats = this.chunkStats.get(entry.chunkId)
			if (stats && stats.count > 0) {
				stats.count--
				if (entry.estimatedSize !== undefined && stats.size >= entry.estimatedSize) {
					stats.size -= entry.estimatedSize
				}
			}
		}
		// Segmented entries don't affect chunk stats
	}

	/**
	 * Remove a record from the catalog.
	 *
	 * @param id - Record ID
	 * @returns True if removed
	 */
	removeEntry(id: string): boolean {
		const entry = this.entries.get(id)
		if (!entry) {
			return false
		}

		// Update stats
		this.removeEntryStats(entry)

		return this.entries.delete(id)
	}

	/**
	 * Get all chunk IDs that contain records.
	 *
	 * @returns Array of chunk IDs
	 */
	getChunkIds(): number[] {
		const ids = new Set<number>()
		for (const entry of this.entries.values()) {
			if (entry.kind === 'chunk' && entry.chunkId !== undefined) {
				ids.add(entry.chunkId)
			}
		}
		return Array.from(ids).sort((a, b) => a - b)
	}

	/**
	 * Get the total count of records.
	 *
	 * @returns Record count
	 */
	getCount(): number {
		return this.entries.size
	}

	/**
	 * Get all record IDs in the catalog.
	 *
	 * @returns Array of all record IDs
	 */
	getAllIds(): string[] {
		return Array.from(this.entries.keys())
	}

	/**
	 * Get the count of records in a specific chunk.
	 *
	 * @param chunkId - Chunk ID
	 * @returns Record count in chunk
	 */
	getChunkCount(chunkId: number): number {
		return this.chunkStats.get(chunkId)?.count ?? 0
	}

	/**
	 * Get the estimated size of a specific chunk in bytes.
	 *
	 * @param chunkId - Chunk ID
	 * @returns Estimated size in bytes
	 */
	getChunkSize(chunkId: number): number {
		return this.chunkStats.get(chunkId)?.size ?? 0
	}

	/**
	 * Update the size of a chunk (useful when loading/saving chunks).
	 *
	 * @param chunkId - Chunk ID
	 * @param size - New size in bytes
	 */
	setChunkSize(chunkId: number, size: number): void {
		let stats = this.chunkStats.get(chunkId)
		if (!stats) {
			stats = { count: 0, size: 0 }
			this.chunkStats.set(chunkId, stats)
		}
		stats.size = size
	}

	/**
	 * Get the count of segmented records.
	 *
	 * @returns Count of segmented records
	 */
	getSegmentedCount(): number {
		let count = 0
		for (const entry of this.entries.values()) {
			if (entry.kind === 'segments') {
				count++
			}
		}
		return count
	}

	/**
	 * Check if a record is stored as segments.
	 *
	 * @param id - Record ID
	 * @returns True if record is segmented
	 */
	isSegmented(id: string): boolean {
		const entry = this.entries.get(id)
		return entry?.kind === 'segments'
	}

	/**
	 * Get sample IDs for verification purposes.
	 *
	 * @param n - Number of samples
	 * @returns Array of sample IDs
	 */
	getSampleIds(n: number): string[] {
		const ids = Array.from(this.entries.keys())
		if (ids.length <= n) {
			return ids
		}

		// Random sample
		const sample: string[] = []
		const used = new Set<number>()
		while (sample.length < n && sample.length < ids.length) {
			const idx = Math.floor(Math.random() * ids.length)
			if (!used.has(idx)) {
				used.add(idx)
				sample.push(ids[idx])
			}
		}
		return sample
	}

	/**
	 * Get all record IDs.
	 *
	 * @returns Iterator of record IDs
	 */
	*ids(): IterableIterator<string> {
		for (const id of this.entries.keys()) {
			yield id
		}
	}

	/**
	 * Iterate over all entries.
	 */
	*[Symbol.iterator](): IterableIterator<CatalogEntry> {
		for (const entry of this.entries.values()) {
			yield entry
		}
	}

	/**
	 * Clear all entries.
	 */
	clear(): void {
		this.entries.clear()
		this.chunkStats.clear()
	}

	/**
	 * Serialize catalog for storage (v2 format).
	 *
	 * @returns Serialized catalog data
	 */
	serialize(): CatalogData {
		const entries: CatalogEntryData[] = []
		let segmentedCount = 0

		for (const entry of this.entries.values()) {
			if (entry.kind === 'chunk' && entry.chunkId !== undefined) {
				entries.push({
					id: entry.id,
					kind: 'chunk',
					chunkId: entry.chunkId,
					estimatedSize: entry.estimatedSize
				})
			} else if (entry.kind === 'segments' && entry.segmentIds) {
				entries.push({
					id: entry.id,
					kind: 'segments',
					segmentIds: entry.segmentIds
				})
				segmentedCount++
			}
		}

		const chunkStats: Array<{ chunkId: number; count: number; size?: number }> = []
		for (const [chunkId, stats] of this.chunkStats) {
			chunkStats.push({
				chunkId,
				count: stats.count,
				size: stats.size > 0 ? stats.size : undefined
			})
		}

		return {
			version: CATALOG_VERSION,
			entries,
			chunkStats,
			count: this.entries.size,
			segmentedCount: segmentedCount > 0 ? segmentedCount : undefined
		}
	}

	/**
	 * Deserialize catalog from storage.
	 * Supports both v1 and v2 formats (automatic migration).
	 *
	 * @param data - Stored catalog data
	 * @returns Catalog instance
	 */
	static deserialize(data: CatalogData): Catalog {
		const catalog = new Catalog()

		// Handle v1 to v2 migration
		const isV1 = data.version === 1

		// Restore entries
		for (const entry of data.entries) {
			// v1 format: { id, chunkId } - treat as chunk entries
			// v2 format: { id, kind, chunkId?, segmentIds? }
			const kind = (entry as CatalogEntryData).kind ?? 'chunk'

			if (kind === 'chunk') {
				const chunkId = entry.chunkId
				if (chunkId !== undefined) {
					catalog.entries.set(entry.id, {
						id: entry.id,
						kind: 'chunk',
						chunkId,
						estimatedSize: (entry as CatalogEntryData).estimatedSize
					})
				}
			} else if (kind === 'segments') {
				const segmentIds = (entry as CatalogEntryData).segmentIds
				if (segmentIds) {
					catalog.entries.set(entry.id, {
						id: entry.id,
						kind: 'segments',
						segmentIds
					})
				}
			}
		}

		// Restore chunk stats
		for (const stat of data.chunkStats) {
			catalog.chunkStats.set(stat.chunkId, {
				count: stat.count,
				size: stat.size ?? 0
			})
		}

		// Log migration if needed
		if (isV1) {
			// Silently migrate - catalog will be saved in v2 format on next write
		}

		return catalog
	}

	/**
	 * Create an empty catalog.
	 *
	 * @returns New empty catalog
	 */
	static empty(): Catalog {
		return new Catalog()
	}
}
