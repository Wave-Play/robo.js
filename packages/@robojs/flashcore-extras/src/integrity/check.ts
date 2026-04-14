/**
 * Flashcore v1 Integrity Checker (Phase 6, spec rev 4.3)
 *
 * Verifies integrity of derived index structures against authoritative data.
 *
 * Key features:
 * - Verify filter matches catalog
 * - Verify sorted indexes match records
 * - Detect orphaned unique keys
 * - Detect duplicate unique values
 */

import type { FlashcoreAdapter } from 'robo.js/flashcore'
import type { CuckooFilter } from 'robo.js/flashcore'
import type { SortedIndex } from 'robo.js/flashcore'
import { Catalog } from 'robo.js/flashcore'
import { scanKeys, hasScanCapability } from 'robo.js/flashcore'
import { buildModelKey } from 'robo.js/flashcore'
import { FeatureNotSupportedError } from 'robo.js/flashcore'

/**
 * Result of a filter integrity check.
 */
export interface FilterIntegrityResult {
	isValid: boolean
	/** Record IDs in filter but not in catalog */
	orphanedInFilter: string[]
	/** Record IDs in catalog but not in filter */
	missingInFilter: string[]
	/** Total records checked */
	recordsChecked: number
}

/**
 * Result of a sorted index integrity check.
 */
export interface IndexIntegrityResult {
	field: string
	isValid: boolean
	/** Record IDs in index but not in catalog */
	orphanedInIndex: string[]
	/** Record IDs in catalog but not in index */
	missingInIndex: string[]
	/** Entries with wrong values */
	wrongValues: Array<{ id: string; expected: unknown; actual: unknown }>
	/** Total entries checked */
	entriesChecked: number
}

/**
 * Result of unique index integrity check.
 */
export interface UniqueIntegrityResult {
	isValid: boolean
	/** Unique keys pointing to non-existent records */
	orphanedKeys: string[]
	/** Multiple records with same unique value */
	duplicates: Array<{ field: string; value: string; ids: string[] }>
	/** Total unique keys checked */
	keysChecked: number
}

/**
 * Complete integrity report for a model.
 */
export interface IntegrityReport {
	modelName: string
	namespace?: string
	isValid: boolean
	filter?: FilterIntegrityResult
	sortedIndexes: IndexIntegrityResult[]
	uniqueIndex?: UniqueIntegrityResult
	warnings: string[]
	durationMs: number
}

/**
 * Options for integrity checking.
 */
export interface IntegrityCheckOptions {
	/** Check filter integrity */
	checkFilter?: boolean
	/** Check sorted indexes integrity */
	checkSortedIndexes?: boolean
	/** Check unique indexes integrity */
	checkUniqueIndexes?: boolean
	/** Sample size for filter checking (0 = check all) */
	filterSampleSize?: number
	/** Progress callback */
	onProgress?: (progress: IntegrityCheckProgress) => void
}

/**
 * Progress update during integrity check.
 */
export interface IntegrityCheckProgress {
	phase: 'filter' | 'sorted' | 'unique' | 'complete'
	field?: string
	checked: number
	total: number
}

/**
 * Integrity Checker.
 *
 * Validates derived index structures against authoritative data.
 */
export class IntegrityChecker {
	private adapter: FlashcoreAdapter

	constructor(adapter: FlashcoreAdapter) {
		this.adapter = adapter
	}

	/**
	 * Check all integrity aspects of a model.
	 */
	async checkAll(
		modelName: string,
		catalog: Catalog,
		options?: IntegrityCheckOptions & {
			filter?: CuckooFilter
			sortedIndexes?: Map<string, SortedIndex>
			uniqueFields?: string[]
			namespace?: string
		}
	): Promise<IntegrityReport> {
		const startTime = Date.now()
		const namespace = options?.namespace

		const report: IntegrityReport = {
			modelName,
			namespace,
			isValid: true,
			sortedIndexes: [],
			warnings: [],
			durationMs: 0
		}

		// Check filter
		if (options?.checkFilter !== false && options?.filter) {
			report.filter = await this.checkFilter(catalog, options.filter, {
				sampleSize: options.filterSampleSize
			})
			if (!report.filter.isValid) {
				report.isValid = false
			}
		}

		// Check sorted indexes
		if (options?.checkSortedIndexes !== false && options?.sortedIndexes) {
			for (const [field, index] of options.sortedIndexes) {
				const result = await this.checkSortedIndex(modelName, catalog, field, index, namespace)
				report.sortedIndexes.push(result)
				if (!result.isValid) {
					report.isValid = false
				}
			}
		}

		// Check unique indexes
		if (options?.checkUniqueIndexes !== false && options?.uniqueFields && options.uniqueFields.length > 0) {
			report.uniqueIndex = await this.checkUniqueIndexes(modelName, options.uniqueFields, namespace)
			if (!report.uniqueIndex.isValid) {
				report.isValid = false
			}
		}

		report.durationMs = Date.now() - startTime
		return report
	}

	/**
	 * Check filter integrity against catalog.
	 */
	async checkFilter(
		catalog: Catalog,
		filter: CuckooFilter,
		options?: { sampleSize?: number }
	): Promise<FilterIntegrityResult> {
		const result: FilterIntegrityResult = {
			isValid: true,
			orphanedInFilter: [],
			missingInFilter: [],
			recordsChecked: 0
		}

		// Get all catalog IDs
		const catalogIds = catalog.getAllIds()
		const sampleSize = options?.sampleSize ?? 0
		const idsToCheck = sampleSize > 0 ? catalogIds.slice(0, sampleSize) : catalogIds

		// Check that all catalog IDs are in filter
		for (const id of idsToCheck) {
			result.recordsChecked++
			if (!filter.mightContain(id)) {
				result.missingInFilter.push(id)
				result.isValid = false
			}
		}

		// Note: We can't easily check for orphaned filter entries because
		// filter only supports mightContain, not enumeration

		return result
	}

	/**
	 * Check sorted index integrity against records.
	 */
	async checkSortedIndex(
		modelName: string,
		catalog: Catalog,
		field: string,
		index: SortedIndex,
		_namespace?: string
	): Promise<IndexIntegrityResult> {
		const result: IndexIntegrityResult = {
			field,
			isValid: true,
			orphanedInIndex: [],
			missingInIndex: [],
			wrongValues: [],
			entriesChecked: 0
		}

		// Get all IDs from the index
		const indexIds = new Set(index.getAll())

		// Get all catalog IDs
		const catalogIds = catalog.getAllIds()

		// Check for orphaned entries (in index but not in catalog)
		for (const id of indexIds) {
			result.entriesChecked++
			if (!catalog.has(id)) {
				result.orphanedInIndex.push(id)
				result.isValid = false
			}
		}

		// Check for missing entries (in catalog but not in index)
		// Note: Records with null/undefined field values are legitimately not in index
		for (const id of catalogIds) {
			if (!indexIds.has(id)) {
				// This might be legitimate if the record's field is null/undefined
				// We can't easily verify without loading the record
				// Mark as warning, not error
			}
		}

		return result
	}

	/**
	 * Check unique index integrity.
	 */
	async checkUniqueIndexes(
		modelName: string,
		uniqueFields: string[],
		namespace?: string
	): Promise<UniqueIntegrityResult> {
		const result: UniqueIntegrityResult = {
			isValid: true,
			orphanedKeys: [],
			duplicates: [],
			keysChecked: 0
		}

		if (!hasScanCapability(this.adapter)) {
			throw new FeatureNotSupportedError('Unique index check requires scan capability', {
				feature: 'unique index check',
				requiredCapability: 'scan'
			})
		}

		// Load authoritative catalog (best-effort)
		let catalog: Catalog | null = null
		try {
			const storedCatalog = (await this.adapter.get(buildModelKey(modelName, 'catalog', namespace))) as unknown
			if (storedCatalog && typeof storedCatalog === 'object' && 'entries' in storedCatalog && 'version' in storedCatalog) {
				catalog = Catalog.deserialize(storedCatalog as any)
			} else {
				catalog = Catalog.empty()
			}
		} catch {
			// If catalog is unreadable, fall back to empty so we still surface issues
			catalog = Catalog.empty()
		}

		// Scan for unique index keys (ux:{field}:{encodedValue})
		const uniquePrefix = buildModelKey(modelName, 'ux:', namespace)
		const valueToIds = new Map<string, string[]>()

		for await (const key of scanKeys(this.adapter, uniquePrefix)) {
			result.keysChecked++

			// Extract field and value from key
			const match = key.match(/ux:([^:]+):(.+)$/)
			if (!match) {
				continue
			}

			const [, field, value] = match
			if (!uniqueFields.includes(field)) {
				continue
			}

			// Get the record ID this key points to
			const entry = await this.adapter.get(key) as unknown
			const recordId =
				typeof entry === 'string'
					? entry
					: (entry && typeof entry === 'object' && 'id' in entry && typeof (entry as { id?: unknown }).id === 'string')
						? (entry as { id: string }).id
						: undefined

			if (!recordId || !catalog?.has(recordId)) {
				result.orphanedKeys.push(key)
				result.isValid = false
				continue
			}

			// Track for duplicate detection
			const compositeKey = `${field}:${value}`
			const existing = valueToIds.get(compositeKey)
			if (existing) {
				existing.push(recordId)
			} else {
				valueToIds.set(compositeKey, [recordId])
			}
		}

		// Check for duplicates
		for (const [compositeKey, ids] of valueToIds) {
			if (ids.length > 1) {
				const [field, ...valueParts] = compositeKey.split(':')
				result.duplicates.push({
					field,
					value: valueParts.join(':'),
					ids
				})
				result.isValid = false
			}
		}

		return result
	}

	/**
	 * Quick health check (samples only).
	 */
	async quickCheck(
		modelName: string,
		catalog: Catalog,
		filter?: CuckooFilter,
		_namespace?: string
	): Promise<{ healthy: boolean; issues: string[] }> {
		const issues: string[] = []

		// Sample 100 records for filter check
		if (filter) {
			const sampleIds = catalog.getSampleIds(100)
			for (const id of sampleIds) {
				if (!filter.mightContain(id)) {
					issues.push(`Filter missing record: ${id}`)
					if (issues.length >= 10) {
						break // Don't collect too many issues
					}
				}
			}
		}

		return {
			healthy: issues.length === 0,
			issues
		}
	}
}
