/**
 * Flashcore v1 (spec rev 4.3) Delete Operation
 *
 * Implements the delete() CRUD operation with WAL protection.
 */

import type { NormalizedSchema, DeleteArgs, ModelHooks } from '../../schema/types.js'
import type { Catalog } from '../catalog.js'
import type { ChunkManager } from '../chunk.js'
import type { CatalogLockManager, ChunkLockManager } from '../locks.js'
import type { UniqueIndexManager } from '../../index/unique.js'
import type { WalContext, UniqueChange } from '../../wal/types.js'
import { TypeSerializer } from '../../schema/serialize.js'
import { executeBeforeDelete, executeAfterDelete } from '../hooks.js'
import { ValidationError } from '../../core/errors.js'
import { buildUniqueKey } from '../../core/keys.js'
import { encodeUniqueValue } from '../../core/encoding.js'
import { splitRecordToSegments } from '../segments.js'
import {
	extractIdFromWhere,
	loadRecordByEntry,
	getChunkIdFromEntry,
	resolveChunkKey,
	validateWhereClause,
	type IndexCallbacks,
	type CascadeCallbacks
} from './shared.js'

/**
 * Context for delete operation.
 */
export interface DeleteContext<T> {
	modelName: string
	modelKey: string
	schema: NormalizedSchema
	catalog: Catalog
	chunkManager: ChunkManager
	catalogLock: CatalogLockManager
	chunkLock: ChunkLockManager
	serializer: TypeSerializer
	hooks?: ModelHooks<T>
	uniqueIndexManager?: UniqueIndexManager
	namespace?: string

	// Callback to persist catalog after modification
	persistCatalog: () => Promise<void>

	// Optional WAL context for crash safety
	wal?: WalContext

	// Optional override for building full chunk keys (for WAL deltas)
	getChunkKey?: (chunkId: number) => string

	// Optional index update callbacks (Phase 6)
	indexCallbacks?: IndexCallbacks

	// Optional cascade callbacks (Phase 9)
	cascadeCallbacks?: CascadeCallbacks
}

/**
 * Execute delete operation.
 *
 * 1. Extract ID from where clause
 * 2. Find record (must exist)
 * 3. Execute beforeDelete hook
 * 4. Begin WAL entry (if enabled)
 * 5. Acquire catalog lock
 * 6. Acquire chunk lock
 * 7. Remove from chunk, remove from catalog (mark WAL authoritative)
 * 8. Release locks
 * 9. Complete WAL
 * 10. Execute afterDelete hook
 * 11. Return deleted record (or null if not found)
 *
 * @param ctx - Delete context
 * @param args - Delete arguments
 * @returns Deleted record or null
 */
export async function executeDelete<T extends { id: string }>(
	ctx: DeleteContext<T>,
	args: DeleteArgs<T>
): Promise<T | null> {
	// Validate where clause
	validateWhereClause(args.where, 'delete')

	// Extract ID from where clause (supports unique field lookup)
	const { id, hadUniqueField } = await extractIdFromWhere(args.where, ctx)

	// If no id/unique field was provided, throw
	if (!hadUniqueField) {
		throw new ValidationError('delete where clause must include id or a unique field')
	}

	// If unique field was used but not found, return null
	if (!id) {
		return null
	}

	// Check if record exists and get storage info
	const entry = ctx.catalog.getEntry(id)

	if (!entry) {
		// Record doesn't exist - return null
		return null
	}

	// Track storage type
	const isSegmented = entry.kind === 'segments'
	const chunkId = getChunkIdFromEntry(entry)

	// Track WAL entry ID for cleanup
	let walId: string | null = null
	const walEnabled = ctx.wal?.manager.isEnabled() ?? false

	// Helper to perform delete operation
	const performDelete = async () => {
		// Re-check after acquiring lock
		const currentEntry = ctx.catalog.getEntry(id)
		if (!currentEntry) {
			// Record was deleted between check and lock
			return null
		}

		// Load existing record based on storage type
		const existingRaw = await loadRecordByEntry(ctx.chunkManager, id, currentEntry)
		if (!existingRaw) {
			return null
		}

		// Deserialize existing record
		const existing = ctx.serializer.deserializeRecord(
			existingRaw as Record<string, unknown>
		) as T

		// Check restrict constraints before proceeding (Phase 9)
		if (ctx.cascadeCallbacks?.checkRestrict) {
			await ctx.cascadeCallbacks.checkRestrict(existing)
		}

		// Execute beforeDelete hook
		await executeBeforeDelete(ctx.hooks, existing)

		// Build unique constraint keys for WAL deltas
		const uniqueKeys: UniqueChange[] = []
		if (ctx.schema.uniqueFields.length > 0) {
			for (const field of ctx.schema.uniqueFields) {
				const value = (existing as Record<string, unknown>)[field]
				if (value !== null && value !== undefined) {
					const encodedValue = encodeUniqueValue(value)
					const key = buildUniqueKey(ctx.modelName, field, encodedValue, ctx.namespace)
					uniqueKeys.push({ key, id })
				}
			}
		}

		// Get full chunk key for WAL (only if not segmented)
		const currentChunkId = getChunkIdFromEntry(currentEntry)
		const fullChunkKey = currentEntry.kind === 'chunk'
			? resolveChunkKey(ctx.modelName, currentChunkId, ctx.namespace, ctx.getChunkKey)
			: ''

		// Begin WAL entry (if enabled) - include full record for rollback
		if (walEnabled && ctx.wal) {
			const deltas = currentEntry.kind === 'segments' && currentEntry.segmentIds
				? (() => {
					const { segmentIds, segments } = splitRecordToSegments(
						ctx.chunkManager,
						id,
						existingRaw,
						currentEntry.segmentIds.length
					)
					return ctx.wal.deltas.buildDeleteSegmentedDeltas(id, segmentIds, segments, uniqueKeys)
				})()
				: ctx.wal.deltas.buildDeleteDeltas(fullChunkKey, currentChunkId, id, existingRaw, uniqueKeys)

			walId = await ctx.wal.manager.begin({
				model: ctx.modelName,
				namespace: ctx.namespace,
				op: 'delete',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: deltas.derived
			})
		}

		// Remove from storage based on type
		if (currentEntry.kind === 'segments' && currentEntry.segmentIds) {
			// Delete all segments
			await ctx.chunkManager.deleteSegmentedRecord(id, currentEntry.segmentIds)
		} else if (currentEntry.kind === 'chunk' && currentEntry.chunkId !== undefined) {
			// Remove from chunk
			await ctx.chunkManager.deleteRecord(currentEntry.chunkId, id)
		}

		// Remove from catalog
		ctx.catalog.removeEntry(id)

		// Persist catalog
		await ctx.persistCatalog()

		// Release unique constraints
		if (ctx.uniqueIndexManager && ctx.schema.uniqueFields.length > 0) {
			for (const field of ctx.schema.uniqueFields) {
				const value = (existing as Record<string, unknown>)[field]

				// Skip null/undefined values
				if (value === null || value === undefined) {
					continue
				}

				try {
					await ctx.uniqueIndexManager.release(
						{ modelName: ctx.modelName, namespace: ctx.namespace, field },
						value
					)
				} catch {
					// Ignore release errors - record is already deleted
				}
			}
		}

		// Release compound unique constraints
		if (ctx.uniqueIndexManager && ctx.schema.compoundUniques.length > 0) {
			for (const constraint of ctx.schema.compoundUniques) {
				const values = constraint.fields.map(f => (existing as Record<string, unknown>)[f])

				// Skip if any value is null/undefined
				if (values.some(v => v === null || v === undefined)) {
					continue
				}

				try {
					await ctx.uniqueIndexManager.releaseCompound(
						{ modelName: ctx.modelName, namespace: ctx.namespace, fields: constraint.fields },
						values
					)
				} catch {
					// Ignore release errors - record is already deleted
				}
			}
		}

		// Mark WAL as authoritative (all writes complete)
		if (walId && ctx.wal) {
			await ctx.wal.manager.markPhase(walId, 'authoritative')
		}

		// Derived writes: update filter and sorted indexes (Phase 6)
		if (ctx.indexCallbacks) {
			// Remove from filter
			if (ctx.indexCallbacks.removeFromFilter) {
				ctx.indexCallbacks.removeFromFilter(id)
			}

			// Remove from sorted indexes for indexed fields
			if (ctx.indexCallbacks.removeFromSortedIndex) {
				for (const field of ctx.schema.indexedFields) {
					const value = (existing as Record<string, unknown>)[field]
					if (value !== null && value !== undefined) {
						ctx.indexCallbacks.removeFromSortedIndex(field, value, id)
					}
				}
			}

			// Mark indexes as dirty for persistence
			if (ctx.indexCallbacks.markDirty) {
				ctx.indexCallbacks.markDirty()
			}
		}

		// Mark derived writes complete
		if (walId && ctx.wal) {
			await ctx.wal.manager.markPhase(walId, 'derived')
		}

		// Execute cascade operations (Phase 9)
		// This handles cascade deletes, setNull, and junction cleanup
		if (ctx.cascadeCallbacks?.executeCascades) {
			await ctx.cascadeCallbacks.executeCascades(existing)
		}

		return existing
	}

	// Execute delete with appropriate locking
	let result: T | null

	// Use catalog lock for the operation
	result = await ctx.catalogLock.withCatalogLock(ctx.modelKey, async () => {
		if (isSegmented) {
			// Segmented records don't use chunk lock
			return performDelete()
		} else {
			// Use chunk lock for regular records
			return ctx.chunkLock.withChunkLock(ctx.modelKey, chunkId, performDelete)
		}
	})

	if (!result) {
		return null
	}

	// Complete WAL entry (operation successful)
	if (walId && ctx.wal) {
		await ctx.wal.manager.complete(walId)
	}

	// Execute afterDelete hook
	await executeAfterDelete(ctx.hooks, result)

	return result
}

