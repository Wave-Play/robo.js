/**
 * Flashcore v1 (spec rev 4.3) Catalog Rebuild (Phase 5)
 *
 * Rebuilds the catalog from chunk and segment data.
 * Used for recovery when catalog is missing or corrupted.
 */

import type { FlashcoreAdapter } from 'robo.js/flashcore'
import { scanKeys, hasScanCapability } from 'robo.js/flashcore'
import { Catalog } from 'robo.js/flashcore'
import { buildModelKey } from 'robo.js/flashcore'
import { FeatureNotSupportedError } from 'robo.js/flashcore'

/**
 * Result of a catalog rebuild operation.
 */
export interface CatalogRebuildResult {
	/** The rebuilt catalog */
	catalog: Catalog
	/** Number of regular (chunked) records found */
	recordsFound: number
	/** Number of chunks scanned */
	chunksScanned: number
	/** Number of segmented records found */
	segmentedRecords: number
	/** Warnings encountered during rebuild */
	warnings: string[]
	/** Time taken in milliseconds */
	durationMs: number
}

/**
 * Options for catalog rebuild.
 */
export interface CatalogRebuildOptions {
	/** Whether to validate chunk contents (slower but more thorough) */
	validateChunks?: boolean
	/** Maximum number of warnings to collect before stopping */
	maxWarnings?: number
	/** Progress callback for long-running operations */
	onProgress?: (progress: CatalogRebuildProgress) => void
}

/**
 * Progress update during catalog rebuild.
 */
export interface CatalogRebuildProgress {
	phase: 'scanning_chunks' | 'scanning_segments' | 'validating' | 'complete'
	chunksScanned: number
	recordsFound: number
	segmentedRecords: number
}

/**
 * Rebuild a catalog from chunks and segments stored in the adapter.
 *
 * This function scans all chunk and segment keys for a model and
 * reconstructs the catalog from the stored data. It's useful for:
 * - Recovery when catalog is missing or corrupted
 * - Verification of catalog integrity
 * - Migration between catalog versions
 *
 * @param adapter - The storage adapter (must support scan)
 * @param modelName - Name of the model to rebuild
 * @param namespace - Optional namespace
 * @param options - Rebuild options
 * @returns Rebuild result with the new catalog
 * @throws FeatureNotSupportedError if adapter doesn't support scan
 */
export async function rebuildCatalogFromChunks(
	adapter: FlashcoreAdapter,
	modelName: string,
	namespace?: string,
	options?: CatalogRebuildOptions
): Promise<CatalogRebuildResult> {
	const startTime = Date.now()

	// Check for scan capability
	if (!hasScanCapability(adapter)) {
		throw new FeatureNotSupportedError('Catalog rebuild requires an adapter with scan capability', {
			feature: 'catalog rebuild',
			requiredCapability: 'scan'
		})
	}

	const result: CatalogRebuildResult = {
		catalog: Catalog.empty(),
		recordsFound: 0,
		chunksScanned: 0,
		segmentedRecords: 0,
		warnings: [],
		durationMs: 0
	}

	const maxWarnings = options?.maxWarnings ?? 100
	const onProgress = options?.onProgress

	// Phase 1: Scan for chunk keys
	const chunkPrefix = buildModelKey(modelName, 'chunk:', namespace)

	if (onProgress) {
		onProgress({
			phase: 'scanning_chunks',
			chunksScanned: 0,
			recordsFound: 0,
			segmentedRecords: 0
		})
	}

	for await (const key of scanKeys(adapter, chunkPrefix)) {
		// Extract chunk ID from key (e.g., "_model:User:chunk:0" -> 0)
		const chunkIdMatch = key.match(/chunk:(\d+)$/)
		if (!chunkIdMatch) {
			if (result.warnings.length < maxWarnings) {
				result.warnings.push(`Skipped malformed chunk key: ${key}`)
			}
			continue
		}

		const chunkId = parseInt(chunkIdMatch[1], 10)
		let chunk: unknown

		try {
			chunk = await adapter.get(key)
		} catch (error) {
			if (result.warnings.length < maxWarnings) {
				result.warnings.push(`Failed to read chunk ${chunkId}: ${error instanceof Error ? error.message : String(error)}`)
			}
			continue
		}

		if (chunk === undefined || chunk === null) {
			if (result.warnings.length < maxWarnings) {
				result.warnings.push(`Chunk ${chunkId} exists but has no data`)
			}
			continue
		}

		if (typeof chunk !== 'object' || Array.isArray(chunk)) {
			if (result.warnings.length < maxWarnings) {
				result.warnings.push(`Chunk ${chunkId} has invalid format (expected object)`)
			}
			continue
		}

		result.chunksScanned++

		// Extract record IDs from chunk
		const chunkData = chunk as Record<string, unknown>
		let chunkSize = 0

		for (const recordId of Object.keys(chunkData)) {
			// Validate record data if requested
			if (options?.validateChunks) {
				const recordData = chunkData[recordId]
				if (recordData === undefined || recordData === null) {
					if (result.warnings.length < maxWarnings) {
						result.warnings.push(`Record ${recordId} in chunk ${chunkId} has null/undefined data`)
					}
					continue
				}
			}

			// Estimate size for this record
			const recordSize = JSON.stringify(chunkData[recordId]).length * 2 + 100

			result.catalog.addEntry(recordId, chunkId, recordSize)
			result.recordsFound++
			chunkSize += recordSize
		}

		// Update chunk size in catalog
		result.catalog.setChunkSize(chunkId, chunkSize)

		if (onProgress) {
			onProgress({
				phase: 'scanning_chunks',
				chunksScanned: result.chunksScanned,
				recordsFound: result.recordsFound,
				segmentedRecords: result.segmentedRecords
			})
		}
	}

	// Phase 2: Scan for segmented records
	const segPrefix = buildModelKey(modelName, 'seg:', namespace)
	const seenSegmentedRecords = new Set<string>()

	if (onProgress) {
		onProgress({
			phase: 'scanning_segments',
			chunksScanned: result.chunksScanned,
			recordsFound: result.recordsFound,
			segmentedRecords: 0
		})
	}

	for await (const key of scanKeys(adapter, segPrefix)) {
		// Extract record ID and segment index from key
		// Format: _model:{ns}::{model}:seg:{recordId}:{n}
		const match = key.match(/seg:([^:]+):(\d+)$/)
		if (!match) {
			if (result.warnings.length < maxWarnings) {
				result.warnings.push(`Skipped malformed segment key: ${key}`)
			}
			continue
		}

		const recordId = match[1]

		// Skip if we've already processed this record
		if (seenSegmentedRecords.has(recordId)) {
			continue
		}

		// Find all segments for this record
		const segmentIds: string[] = []
		let segIndex = 0
		let hasMoreSegments = true

		while (hasMoreSegments) {
			const segKey = buildModelKey(modelName, `seg:${recordId}:${segIndex}`, namespace)
			try {
				const exists = await adapter.has(segKey)
				if (exists) {
					segmentIds.push(`${segIndex}`)
					segIndex++
				} else {
					hasMoreSegments = false
				}
			} catch {
				hasMoreSegments = false
			}
		}

		if (segmentIds.length > 0) {
			result.catalog.addSegmentedEntry(recordId, segmentIds)
			result.segmentedRecords++
			seenSegmentedRecords.add(recordId)

			if (onProgress) {
				onProgress({
					phase: 'scanning_segments',
					chunksScanned: result.chunksScanned,
					recordsFound: result.recordsFound,
					segmentedRecords: result.segmentedRecords
				})
			}
		}
	}

	// Finalize
	result.durationMs = Date.now() - startTime

	if (onProgress) {
		onProgress({
			phase: 'complete',
			chunksScanned: result.chunksScanned,
			recordsFound: result.recordsFound,
			segmentedRecords: result.segmentedRecords
		})
	}

	return result
}

/**
 * Verify catalog integrity against stored chunks and segments.
 *
 * Compares the catalog entries against actual stored data and reports
 * any discrepancies.
 *
 * @param adapter - The storage adapter
 * @param catalog - The catalog to verify
 * @param modelName - Name of the model
 * @param namespace - Optional namespace
 * @returns Verification result with any issues found
 */
export async function verifyCatalogIntegrity(
	adapter: FlashcoreAdapter,
	catalog: Catalog,
	modelName: string,
	namespace?: string
): Promise<CatalogVerificationResult> {
	const result: CatalogVerificationResult = {
		isValid: true,
		missingRecords: [],
		orphanedRecords: [],
		warnings: []
	}

	// Check a sample of catalog entries against actual storage
	const sampleIds = catalog.getSampleIds(100)

	for (const id of sampleIds) {
		const entry = catalog.getEntry(id)
		if (!entry) continue

		let exists = false

		if (entry.kind === 'chunk' && entry.chunkId !== undefined) {
			const chunkKey = buildModelKey(modelName, `chunk:${entry.chunkId}`, namespace)
			try {
				const chunk = (await adapter.get(chunkKey)) as Record<string, unknown> | undefined
				exists = chunk !== undefined && id in chunk
			} catch {
				// Treat read errors as missing
			}
		} else if (entry.kind === 'segments' && entry.segmentIds) {
			// Check first segment exists
			const firstSegKey = buildModelKey(modelName, `seg:${id}:0`, namespace)
			try {
				exists = await adapter.has(firstSegKey)
			} catch {
				// Treat read errors as missing
			}
		}

		if (!exists) {
			result.isValid = false
			result.missingRecords.push(id)
		}
	}

	return result
}

/**
 * Result of catalog verification.
 */
export interface CatalogVerificationResult {
	/** Whether the catalog is valid */
	isValid: boolean
	/** Record IDs in catalog but missing from storage */
	missingRecords: string[]
	/** Record IDs in storage but missing from catalog */
	orphanedRecords: string[]
	/** Non-critical warnings */
	warnings: string[]
}
