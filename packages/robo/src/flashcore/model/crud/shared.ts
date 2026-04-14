/**
 * Shared CRUD utilities for Flashcore v1 operations.
 *
 * Deduplicates common functions used across create, read, update, delete,
 * find-many, bulk, and upsert operations.
 */

import type { NormalizedSchema } from '../../schema/types.js'
import type { UniqueIndexManager, UniqueConstraintOptions, CompoundUniqueConstraintOptions } from '../../index/unique.js'
import type { CatalogEntry } from '../catalog.js'
import type { ChunkManager } from '../chunk.js'
import type { WalContext } from '../../wal/types.js'
import { ValidationError } from '../../core/errors.js'
import { buildModelKey } from '../../core/keys.js'
import { logger } from '../../core/logger.js'
import { MAX_VERSION_VALUE, VERSION_OVERFLOW_WARN_THRESHOLD } from '../../core/constants.js'

/**
 * Context for extracting IDs from where clauses.
 */
export interface IdExtractionContext {
	schema: NormalizedSchema
	uniqueIndexManager?: UniqueIndexManager
	modelName: string
	namespace?: string
}

/**
 * Result from extracting ID from where clause.
 */
export interface ExtractIdResult {
	id: string | null
	hadUniqueField: boolean
}

/**
 * Extract ID from a where clause.
 *
 * Supports:
 * - Direct ID lookup
 * - Primary key lookup (if not 'id')
 * - Unique field lookups via UniqueIndexManager
 *
 * @param where - Where clause
 * @param ctx - Extraction context
 * @returns ID string and whether a unique field was used
 */
export async function extractIdFromWhere(
	where: Record<string, unknown>,
	ctx: IdExtractionContext
): Promise<ExtractIdResult> {
	const schema = ctx.schema

	// Direct ID lookup
	if ('id' in where && typeof where.id === 'string') {
		return { id: where.id, hadUniqueField: true }
	}

	// Primary key lookup (if not 'id')
	if (schema.primaryKey !== 'id' && schema.primaryKey in where) {
		const pkValue = where[schema.primaryKey]
		if (typeof pkValue === 'string') {
			return { id: pkValue, hadUniqueField: true }
		}
	}

	// Unique field lookups via UniqueIndexManager
	if (ctx.uniqueIndexManager && schema.uniqueFields.length > 0) {
		for (const field of schema.uniqueFields) {
			if (field in where) {
				const value = where[field]

				// Skip null/undefined values
				if (value === null || value === undefined) {
					continue
				}

				// Look up via unique index
				const id = await ctx.uniqueIndexManager.lookup(
					{ modelName: ctx.modelName, namespace: ctx.namespace, field },
					value
				)

				// Whether found or not, we had a unique field
				return { id, hadUniqueField: true }
			}
		}
	}

	return { id: null, hadUniqueField: false }
}

/**
 * Find the version field in the schema.
 */
export function findVersionField(schema: NormalizedSchema): string | null {
	for (const [name, field] of schema.fields) {
		if (field.version) {
			return name
		}
	}
	return null
}

/**
 * Check if two values are equal for constraint purposes.
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (a === null || a === undefined) return b === null || b === undefined
	if (b === null || b === undefined) return false

	// Handle Date comparison
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() === b.getTime()
	}

	return false
}

/**
 * Apply select clause to filter returned fields.
 *
 * @param record - Full record
 * @param select - Select clause
 * @returns Filtered record
 */
export function applySelect<T>(
	record: T,
	select: Partial<Record<keyof T, boolean>>
): T {
	const recordObj = record as Record<string, unknown>
	const selectEntries = Object.entries(select)

	// If select is empty, return all fields
	if (selectEntries.length === 0) {
		return record
	}

	const result: Partial<T> = {}

	for (const [key, include] of selectEntries) {
		if (include && key in recordObj) {
			(result as Record<string, unknown>)[key] = recordObj[key]
		}
	}

	// Always include id
	if ('id' in recordObj) {
		(result as Record<string, unknown>).id = recordObj.id
	}

	return result as T
}

// ========================================================================
// Shared interfaces for CRUD contexts
// ========================================================================

/**
 * Index update callbacks superset. Each CRUD operation uses a subset.
 */
export interface IndexCallbacks {
	addToFilter?: (id: string) => void
	removeFromFilter?: (id: string) => void
	addToSortedIndex?: (field: string, value: unknown, id: string) => void
	removeFromSortedIndex?: (field: string, value: unknown, id: string) => void
	markDirty?: (field?: string) => void
}

/**
 * Relation callbacks for create/update (Phase 9).
 */
export interface RelationCallbacks {
	validateForeignKeys?: (data: Record<string, unknown>) => Promise<void>
}

/**
 * Cascade callbacks for delete (Phase 9).
 */
export interface CascadeCallbacks {
	checkRestrict?: (record: { id: string }) => Promise<void>
	executeCascades?: (record: { id: string }) => Promise<void>
}

// ========================================================================
// Shared helpers
// ========================================================================

/**
 * Load a record by its catalog entry (chunk or segments).
 * Returns null if the entry is invalid or the record is missing.
 */
export async function loadRecordByEntry(
	chunkManager: ChunkManager,
	id: string,
	entry: CatalogEntry
): Promise<unknown | null> {
	if (entry.kind === 'segments' && entry.segmentIds) {
		return chunkManager.loadSegmentedRecord(id, entry.segmentIds)
	} else if (entry.kind === 'chunk' && entry.chunkId !== undefined) {
		return chunkManager.getRecord(entry.chunkId, id)
	}
	return null
}

/**
 * Get the chunk ID from a catalog entry, defaulting to 0.
 */
export function getChunkIdFromEntry(entry: CatalogEntry): number {
	return entry.kind === 'chunk' ? entry.chunkId ?? 0 : 0
}

/**
 * Increment a version field with overflow protection.
 *
 * @param merged - Record being updated (mutated in place)
 * @param schema - Model schema
 * @param modelName - Model name (for logging)
 * @param id - Record ID (for logging)
 * @param skipFields - If provided, skip auto-increment when the version field is present in this set
 */
export function incrementVersion(
	merged: Record<string, unknown>,
	schema: NormalizedSchema,
	modelName: string,
	id: string,
	skipFields?: Record<string, unknown>
): void {
	const versionField = findVersionField(schema)
	if (!versionField || !(versionField in merged)) return
	if (skipFields && versionField in skipFields) return

	const currentVersion = (merged[versionField] as number) || 0
	let newVersion = currentVersion + 1

	if (newVersion >= MAX_VERSION_VALUE) {
		logger.warn(
			`Version overflow detected for ${modelName}:${id}. ` +
			`Resetting from ${currentVersion} to 1.`
		)
		newVersion = 1
	} else if (newVersion >= VERSION_OVERFLOW_WARN_THRESHOLD) {
		logger.warn(
			`Version approaching overflow for ${modelName}:${id}. ` +
			`Current: ${newVersion}, Max: ${MAX_VERSION_VALUE}`
		)
	}

	merged[versionField] = newVersion
}

/**
 * Resolve a chunk key, using getChunkKey override if available.
 */
export function resolveChunkKey(
	modelName: string,
	chunkId: number,
	namespace: string | undefined,
	getChunkKey?: (chunkId: number) => string
): string {
	return getChunkKey
		? getChunkKey(chunkId)
		: buildModelKey(modelName, `chunk:${chunkId}`, namespace)
}

/**
 * Validate that a where clause exists and is an object.
 */
export function validateWhereClause(where: unknown, operation: string): void {
	if (!where || typeof where !== 'object') {
		throw new ValidationError(`${operation} requires a where clause`)
	}
}

/**
 * Release acquired unique constraints and clean up WAL on error.
 * Returns the new walId (always null after cleanup).
 */
export async function releaseConstraintsOnError(
	uniqueIndexManager: UniqueIndexManager | undefined,
	acquiredConstraints: Array<{ options: UniqueConstraintOptions; value: unknown }>,
	walId: string | null,
	wal?: WalContext,
	acquiredCompoundConstraints?: Array<{ options: CompoundUniqueConstraintOptions; values: unknown[] }>
): Promise<null> {
	if (uniqueIndexManager) {
		for (const { options, value } of acquiredConstraints) {
			try {
				await uniqueIndexManager.release(options, value)
			} catch {
				// Ignore release errors during rollback
			}
		}

		if (acquiredCompoundConstraints) {
			for (const { options, values } of acquiredCompoundConstraints) {
				try {
					await uniqueIndexManager.releaseCompound(options, values)
				} catch {
					// Ignore release errors during rollback
				}
			}
		}
	}

	if (walId && wal) {
		try {
			await wal.manager.deleteEntry(walId)
		} catch {
			// Ignore WAL cleanup errors; recovery will handle it if needed.
		}
	}

	return null
}
