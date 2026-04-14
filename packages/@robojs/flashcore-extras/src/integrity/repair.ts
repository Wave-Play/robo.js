/**
 * Flashcore v1 Repair Engine (Phase 6, spec rev 4.3)
 *
 * Repairs derived index structures from authoritative data.
 *
 * Key features:
 * - Rebuild filter from catalog
 * - Rebuild sorted indexes from chunks
 * - Clean orphaned unique keys
 * - Report duplicate unique values (manual resolution required)
 */

import type { FlashcoreAdapter } from 'robo.js/flashcore'
import type { Catalog } from 'robo.js/flashcore'
import type { ChunkManager } from 'robo.js/flashcore'
import { CuckooFilter } from 'robo.js/flashcore'
import { SortedIndex } from 'robo.js/flashcore'
import type { IntegrityReport, UniqueIntegrityResult } from './check.js'

/**
 * Result of a repair operation.
 */
export interface RepairResult {
	success: boolean
	/** Number of items repaired */
	repaired: number
	/** Items that could not be auto-repaired */
	unrepaired: string[]
	/** Warnings generated during repair */
	warnings: string[]
	/** Time taken in milliseconds */
	durationMs: number
}

/**
 * Combined repair result for all index types.
 */
export interface FullRepairResult {
	filter?: RepairResult
	sortedIndexes: Map<string, RepairResult>
	uniqueIndex?: RepairResult
	durationMs: number
}

/**
 * Options for repair operations.
 */
export interface RepairOptions {
	/** Repair filter */
	repairFilter?: boolean
	/** Repair sorted indexes */
	repairSortedIndexes?: boolean
	/** Repair unique indexes */
	repairUniqueIndexes?: boolean
	/** Dry run - report what would be repaired without making changes */
	dryRun?: boolean
	/** Progress callback */
	onProgress?: (progress: RepairProgress) => void
}

/**
 * Progress update during repair.
 */
export interface RepairProgress {
	phase: 'filter' | 'sorted' | 'unique' | 'complete'
	field?: string
	repaired: number
	total: number
}

/**
 * Repair Engine.
 *
 * Repairs derived index structures from authoritative data sources.
 */
export class RepairEngine {
	private adapter: FlashcoreAdapter

	constructor(adapter: FlashcoreAdapter) {
		this.adapter = adapter
	}

	/**
	 * Repair based on integrity report.
	 */
	async repairFromReport(
		modelName: string,
		catalog: Catalog,
		chunkManager: ChunkManager,
		report: IntegrityReport,
		options?: RepairOptions
	): Promise<FullRepairResult> {
		const startTime = Date.now()
		const result: FullRepairResult = {
			sortedIndexes: new Map(),
			durationMs: 0
		}

		// Repair filter if needed
		if (options?.repairFilter !== false && report.filter && !report.filter.isValid) {
			result.filter = await this.repairFilter(catalog, options?.dryRun)
		}

		// Repair sorted indexes if needed
		if (options?.repairSortedIndexes !== false) {
			for (const indexResult of report.sortedIndexes) {
				if (!indexResult.isValid) {
					const repairResult = await this.repairSortedIndex(
						modelName,
						catalog,
						chunkManager,
						indexResult.field,
						report.namespace,
						options?.dryRun
					)
					result.sortedIndexes.set(indexResult.field, repairResult)
				}
			}
		}

		// Repair unique indexes if needed
		if (options?.repairUniqueIndexes !== false && report.uniqueIndex && !report.uniqueIndex.isValid) {
			result.uniqueIndex = await this.repairUniqueIndex(
				modelName,
				report.uniqueIndex,
				report.namespace,
				options?.dryRun
			)
		}

		result.durationMs = Date.now() - startTime
		return result
	}

	/**
	 * Rebuild filter from catalog.
	 */
	async repairFilter(catalog: Catalog, dryRun?: boolean): Promise<RepairResult> {
		const startTime = Date.now()
		const result: RepairResult = {
			success: true,
			repaired: 0,
			unrepaired: [],
			warnings: [],
			durationMs: 0
		}

		if (dryRun) {
			result.repaired = catalog.getCount()
			result.durationMs = Date.now() - startTime
			return result
		}

		// Create new filter and add all catalog IDs
		const ids = catalog.getAllIds()
		const newFilter = CuckooFilter.fromIds(ids)

		result.repaired = ids.length
		result.durationMs = Date.now() - startTime

		// The caller is responsible for using the new filter
		// Store in result for retrieval
		;(result as RepairResult & { filter?: CuckooFilter }).filter = newFilter

		return result
	}

	/**
	 * Rebuild sorted index from records.
	 */
	async repairSortedIndex(
		modelName: string,
		catalog: Catalog,
		chunkManager: ChunkManager,
		field: string,
		namespace?: string,
		dryRun?: boolean
	): Promise<RepairResult> {
		const startTime = Date.now()
		const result: RepairResult = {
			success: true,
			repaired: 0,
			unrepaired: [],
			warnings: [],
			durationMs: 0
		}

		if (dryRun) {
			result.repaired = catalog.getCount()
			result.durationMs = Date.now() - startTime
			return result
		}

		const newIndex = new SortedIndex(field)
		const entries: Array<{ value: unknown; id: string }> = []

		// Load all records and extract field values
		const chunkIds = catalog.getChunkIds()

		for (const chunkId of chunkIds) {
			try {
				const chunk = await chunkManager.loadChunk(chunkId)

				for (const [id, record] of Object.entries(chunk)) {
					const value = (record as Record<string, unknown>)[field]

					if (value !== null && value !== undefined) {
						entries.push({ value, id })
						result.repaired++
					}
				}
			} catch (error) {
				result.warnings.push(`Failed to load chunk ${chunkId}: ${error instanceof Error ? error.message : String(error)}`)
			}
		}

		// Build index from entries
		for (const { value, id } of entries) {
			newIndex.insert(value, id)
		}

		// Store in result for retrieval
		;(result as RepairResult & { index?: SortedIndex }).index = newIndex

		result.durationMs = Date.now() - startTime
		return result
	}

	/**
	 * Clean orphaned unique keys.
	 */
	async repairUniqueIndex(
		modelName: string,
		integrityResult: UniqueIntegrityResult,
		namespace?: string,
		dryRun?: boolean
	): Promise<RepairResult> {
		const startTime = Date.now()
		const result: RepairResult = {
			success: true,
			repaired: 0,
			unrepaired: [],
			warnings: [],
			durationMs: 0
		}

		// Clean orphaned keys
		for (const key of integrityResult.orphanedKeys) {
			if (dryRun) {
				result.repaired++
			} else {
				try {
					await this.adapter.delete(key)
					result.repaired++
				} catch (error) {
					result.unrepaired.push(key)
					result.warnings.push(`Failed to delete orphaned key ${key}: ${error instanceof Error ? error.message : String(error)}`)
				}
			}
		}

		// Report duplicates (cannot auto-repair - requires manual resolution)
		for (const dup of integrityResult.duplicates) {
			result.unrepaired.push(`Duplicate ${dup.field}="${dup.value}": records [${dup.ids.join(', ')}]`)
			result.warnings.push(
				`Cannot auto-repair duplicate unique value: ${dup.field}="${dup.value}" ` +
					`has ${dup.ids.length} records. Manual resolution required.`
			)
		}

		if (integrityResult.duplicates.length > 0) {
			result.success = false
		}

		result.durationMs = Date.now() - startTime
		return result
	}

	/**
	 * Full rebuild of all indexes from authoritative data.
	 */
	async rebuildAll(
		modelName: string,
		catalog: Catalog,
		chunkManager: ChunkManager,
		sortedFields: string[],
		namespace?: string,
		onProgress?: (progress: RepairProgress) => void
	): Promise<{
		filter: CuckooFilter
		sortedIndexes: Map<string, SortedIndex>
		durationMs: number
	}> {
		const startTime = Date.now()

		// Rebuild filter
		if (onProgress) {
			onProgress({ phase: 'filter', repaired: 0, total: catalog.getCount() })
		}

		const ids = catalog.getAllIds()
		const filter = CuckooFilter.fromIds(ids)

		if (onProgress) {
			onProgress({ phase: 'filter', repaired: ids.length, total: ids.length })
		}

		// Rebuild sorted indexes
		const sortedIndexes = new Map<string, SortedIndex>()
		const chunkIds = catalog.getChunkIds()

		// Pre-create indexes
		for (const field of sortedFields) {
			sortedIndexes.set(field, new SortedIndex(field))
		}

		// Load all chunks and populate indexes
		let recordsProcessed = 0
		const totalRecords = catalog.getCount()

		for (const chunkId of chunkIds) {
			const chunk = await chunkManager.loadChunk(chunkId)

			for (const [id, record] of Object.entries(chunk)) {
				const rec = record as Record<string, unknown>

				for (const field of sortedFields) {
					const value = rec[field]
					if (value !== null && value !== undefined) {
						sortedIndexes.get(field)!.insert(value, id)
					}
				}

				recordsProcessed++

				if (onProgress && recordsProcessed % 1000 === 0) {
					onProgress({
						phase: 'sorted',
						repaired: recordsProcessed,
						total: totalRecords
					})
				}
			}
		}

		if (onProgress) {
			onProgress({ phase: 'complete', repaired: recordsProcessed, total: totalRecords })
		}

		return {
			filter,
			sortedIndexes,
			durationMs: Date.now() - startTime
		}
	}

	/**
	 * Rebuild filter only.
	 */
	async rebuildFilter(catalog: Catalog): Promise<CuckooFilter> {
		const ids = catalog.getAllIds()
		return CuckooFilter.fromIds(ids)
	}

	/**
	 * Rebuild a single sorted index.
	 */
	async rebuildSortedIndex(
		modelName: string,
		catalog: Catalog,
		chunkManager: ChunkManager,
		field: string,
		namespace?: string
	): Promise<SortedIndex> {
		const index = new SortedIndex(field)
		const chunkIds = catalog.getChunkIds()

		for (const chunkId of chunkIds) {
			const chunk = await chunkManager.loadChunk(chunkId)

			for (const [id, record] of Object.entries(chunk)) {
				const value = (record as Record<string, unknown>)[field]
				if (value !== null && value !== undefined) {
					index.insert(value, id)
				}
			}
		}

		return index
	}
}
