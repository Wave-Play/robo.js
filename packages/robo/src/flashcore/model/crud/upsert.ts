/**
 * Flashcore v1 Upsert Operation (spec rev 4.3)
 *
 * Implements the upsert (create-or-update) operation.
 */

import type { FlashcoreAdapter } from '../../adapter/types.js'
import type {
	NormalizedSchema,
	UniqueWhere,
	UpsertArgs
} from '../../schema/types.js'
import type { Catalog, CatalogEntry } from '../catalog.js'
import type { ChunkManager } from '../chunk.js'
import type { CatalogLockManager, ChunkLockManager } from '../locks.js'
import type { UniqueIndexManager } from '../../index/unique.js'
import { ValidationError } from '../../core/errors.js'
import { RecordValidator, throwIfInvalid } from '../../schema/validate.js'
import { TypeSerializer } from '../../schema/serialize.js'
import { applyDefaults, normalizeRecordShape } from '../../schema/normalize.js'
import { generateId, isValidId } from '../id.js'
import {
	extractIdFromWhere,
	findVersionField,
	valuesEqual,
	loadRecordByEntry,
	getChunkIdFromEntry,
	incrementVersion,
	validateWhereClause,
	type IndexCallbacks
} from './shared.js'

/**
 * Context for upsert operation.
 */
export interface UpsertContext<T> {
	modelName: string
	modelKey: string
	schema: NormalizedSchema
	catalog: Catalog
	chunkManager: ChunkManager
	adapter: FlashcoreAdapter
	catalogLock: CatalogLockManager
	chunkLock: ChunkLockManager
	validator: RecordValidator
	serializer: TypeSerializer
	uniqueIndexManager?: UniqueIndexManager
	namespace?: string
	persistCatalog: () => Promise<void>
	indexCallbacks?: IndexCallbacks
}

/**
 * Result from upsert operation.
 */
export interface UpsertResult<T> {
	record: T
	created: boolean
}

/**
 * Execute upsert operation.
 *
 * Creates a new record if no match found, otherwise updates the existing one.
 *
 * @param ctx - Upsert context
 * @param args - Upsert arguments (where, create, update)
 * @returns Upserted record and whether it was created
 */
export async function executeUpsert<T extends { id: string }>(
	ctx: UpsertContext<T>,
	args: UpsertArgs<T>
): Promise<UpsertResult<T>> {
	const { where, create, update } = args

	// Validate where clause
	validateWhereClause(where, 'upsert')

	// Try to find existing record
	const existingRecord = await findRecordByWhere(ctx, where)

	if (existingRecord) {
		// Update existing record
		const updateData = update as Record<string, unknown>

		// Reject ID mutation
		if ('id' in updateData) {
			throw new ValidationError('Cannot update id field. ID is immutable.', { field: 'id' })
		}

		// Validate update data
		const validationResult = ctx.validator.validateUpdate(updateData)
		throwIfInvalid(validationResult)

		// Merge existing record with update data
		const merged = { ...(existingRecord.record as Record<string, unknown>), ...updateData }
		merged.id = existingRecord.id

		// Increment version field if present (with overflow protection)
		incrementVersion(merged, ctx.schema, ctx.modelName, existingRecord.id)

		// Handle unique constraint updates
		await handleUniqueUpdates(ctx, existingRecord.id, existingRecord.record, updateData)

		// Normalize and serialize
		const normalized = normalizeRecordShape(merged, ctx.schema)
		const serialized = ctx.serializer.serializeRecord(normalized)

		// Check if updated record needs segmentation
		const sizeCheck = ctx.chunkManager.checkRecordSize(serialized)
		const isSegmented = existingRecord.entry.kind === 'segments'

		if (sizeCheck.needsSegmentation) {
			// Store as segmented record
			let newSegmentIds: string[]

			if (isSegmented && existingRecord.entry.segmentIds) {
				// segments -> segments: update in place
				newSegmentIds = await ctx.chunkManager.updateSegmentedRecord(
					existingRecord.id, existingRecord.entry.segmentIds, serialized
				)
			} else {
				// chunk -> segments: save as segments, remove from old chunk
				newSegmentIds = await ctx.chunkManager.saveSegmentedRecord(existingRecord.id, serialized)
				const oldChunkId = getChunkIdFromEntry(existingRecord.entry)
				await ctx.chunkManager.deleteRecord(oldChunkId, existingRecord.id)
			}

			// Update catalog to segments
			ctx.catalog.addSegmentedEntry(existingRecord.id, newSegmentIds)
			await ctx.persistCatalog()
		} else if (isSegmented && existingRecord.entry.segmentIds) {
			// segments -> chunk: transition to regular chunk storage
			const targetChunkId = ctx.chunkManager.selectChunkForInsert(ctx.catalog, sizeCheck.estimatedSize)
			await ctx.chunkLock.withChunkLock(ctx.modelKey, targetChunkId, async () => {
				await ctx.chunkManager.setRecord(targetChunkId, existingRecord.id, serialized)
			})

			// Update catalog to chunk
			ctx.catalog.addEntry(existingRecord.id, targetChunkId, sizeCheck.estimatedSize)
			await ctx.persistCatalog()

			// Delete old segments
			await ctx.chunkManager.deleteSegmentedRecord(existingRecord.id, existingRecord.entry.segmentIds)
		} else {
			// chunk -> chunk: regular update (existing behavior)
			const chunkId = getChunkIdFromEntry(existingRecord.entry)
			await ctx.chunkManager.setRecord(chunkId, existingRecord.id, serialized)
		}

		// Update sorted indexes
		if (ctx.indexCallbacks) {
			for (const field of ctx.schema.indexedFields) {
				if (!(field in updateData)) continue

				const oldValue = (existingRecord.record as Record<string, unknown>)[field]
				const newValue = normalized[field]

				if (oldValue !== newValue) {
					if (ctx.indexCallbacks.removeFromSortedIndex && oldValue !== null && oldValue !== undefined) {
						ctx.indexCallbacks.removeFromSortedIndex(field, oldValue, existingRecord.id)
					}
					if (ctx.indexCallbacks.addToSortedIndex && newValue !== null && newValue !== undefined) {
						ctx.indexCallbacks.addToSortedIndex(field, newValue, existingRecord.id)
					}
				}
			}

			if (ctx.indexCallbacks.markDirty) {
				ctx.indexCallbacks.markDirty()
			}
		}

		return {
			record: ctx.serializer.deserializeRecord(serialized) as T,
			created: false
		}
	} else {
		// Create new record
		const createData = { ...create as Record<string, unknown> }

		// Copy the where clause identifier to create data if not present
		if ('id' in where && !('id' in createData)) {
			createData.id = (where as { id: string }).id
		}

		// For unique field where clauses, copy the value to create data
		for (const field of ctx.schema.uniqueFields) {
			if (field in where && !(field in createData)) {
				createData[field] = (where as Record<string, unknown>)[field]
			}
		}

		// Generate ID if not provided
		if (!('id' in createData) || createData.id === undefined) {
			createData.id = generateId()
		}

		const id = createData.id as string

		// Validate ID format
		if (!isValidId(id)) {
			throwIfInvalid({
				valid: false,
				errors: [{
					field: 'id',
					message: 'Invalid ID format',
					code: 'INVALID_ID'
				}]
			})
		}

		// Apply defaults
		const withDefaults = applyDefaults(createData, ctx.schema)

		// Initialize version field to 0 if schema has one
		const versionField = findVersionField(ctx.schema)
		if (versionField && !(versionField in withDefaults)) {
			withDefaults[versionField] = 0
		}

		// Validate create data
		const validationResult = ctx.validator.validateCreate(withDefaults)
		throwIfInvalid(validationResult)

		// Normalize and serialize
		const normalized = normalizeRecordShape(withDefaults, ctx.schema)
		normalized[ctx.schema.primaryKey] = id
		const serialized = ctx.serializer.serializeRecord(normalized)

		// Acquire catalog lock
		const result = await ctx.catalogLock.withCatalogLock(ctx.modelKey, async () => {
			// Double-check that record wasn't created by another process
			if (ctx.catalog.has(id)) {
				// Record was created by another process - treat as update
				// This is a simplified handling; in production we might retry
				const entry = ctx.catalog.getEntry(id)
				if (!entry) throw new Error('Race condition: record appears then disappears')

				const raw = await loadRecordByEntry(ctx.chunkManager, id, entry)
				if (!raw) throw new Error('Race condition: catalog entry without data')

				return {
					record: ctx.serializer.deserializeRecord(raw as Record<string, unknown>) as T,
					created: false
				}
			}

			// Acquire unique constraints
			const acquiredConstraints: Array<{ field: string; value: unknown }> = []
			const acquiredCompoundConstraints: Array<{ fields: string[]; values: unknown[] }> = []

			if (ctx.uniqueIndexManager) {
				try {
					for (const field of ctx.schema.uniqueFields) {
						const value = normalized[field]
						if (value !== null && value !== undefined) {
							await ctx.uniqueIndexManager.acquire(
								{ modelName: ctx.modelName, namespace: ctx.namespace, field },
								value,
								id
							)
							acquiredConstraints.push({ field, value })
						}
					}

					// Acquire compound unique constraints
					for (const constraint of ctx.schema.compoundUniques) {
						const values = constraint.fields.map(f => normalized[f])
						if (!values.some(v => v === null || v === undefined)) {
							await ctx.uniqueIndexManager.acquireCompound(
								{ modelName: ctx.modelName, namespace: ctx.namespace, fields: constraint.fields },
								values,
								id
							)
							acquiredCompoundConstraints.push({ fields: constraint.fields, values })
						}
					}
				} catch (error) {
					// Release acquired constraints on failure
					for (const { field, value } of acquiredConstraints) {
						try {
							await ctx.uniqueIndexManager.release(
								{ modelName: ctx.modelName, namespace: ctx.namespace, field },
								value
							)
						} catch {
							// Ignore release errors
						}
					}
					for (const { fields, values } of acquiredCompoundConstraints) {
						try {
							await ctx.uniqueIndexManager.releaseCompound(
								{ modelName: ctx.modelName, namespace: ctx.namespace, fields },
								values
							)
						} catch {
							// Ignore release errors
						}
					}
					throw error
				}
			}

			try {
				const sizeCheck = ctx.chunkManager.checkRecordSize(serialized)

				if (sizeCheck.needsSegmentation) {
					// Store as segmented record
					const segmentIds = await ctx.chunkManager.saveSegmentedRecord(id, serialized)
					ctx.catalog.addSegmentedEntry(id, segmentIds)
				} else {
					// Select chunk for this record
					const chunkId = ctx.chunkManager.selectChunkForInsert(ctx.catalog, sizeCheck.estimatedSize)
					// Add to chunk
					await ctx.chunkManager.setRecord(chunkId, id, serialized)
					// Update catalog
					ctx.catalog.addEntry(id, chunkId, sizeCheck.estimatedSize)
				}

				// Persist catalog
				await ctx.persistCatalog()

				// Update indexes
				if (ctx.indexCallbacks) {
					if (ctx.indexCallbacks.addToFilter) {
						ctx.indexCallbacks.addToFilter(id)
					}

					if (ctx.indexCallbacks.addToSortedIndex) {
						for (const field of ctx.schema.indexedFields) {
							const value = normalized[field]
							if (value !== null && value !== undefined) {
								ctx.indexCallbacks.addToSortedIndex(field, value, id)
							}
						}
					}

					if (ctx.indexCallbacks.markDirty) {
						ctx.indexCallbacks.markDirty()
					}
				}

				return {
					record: ctx.serializer.deserializeRecord(serialized) as T,
					created: true
				}
			} catch (error) {
				// Release constraints on failure
				if (ctx.uniqueIndexManager) {
					for (const { field, value } of acquiredConstraints) {
						try {
							await ctx.uniqueIndexManager.release(
								{ modelName: ctx.modelName, namespace: ctx.namespace, field },
								value
							)
						} catch {
							// Ignore release errors
						}
					}
					for (const { fields, values } of acquiredCompoundConstraints) {
						try {
							await ctx.uniqueIndexManager.releaseCompound(
								{ modelName: ctx.modelName, namespace: ctx.namespace, fields },
								values
							)
						} catch {
							// Ignore release errors
						}
					}
				}
				throw error
			}
		})

		return result
	}
}

/**
 * Find a record by where clause.
 */
async function findRecordByWhere<T extends { id: string }>(
	ctx: UpsertContext<T>,
	where: UniqueWhere<T>
): Promise<{ id: string; record: T; entry: CatalogEntry } | null> {
	const { id } = await extractIdFromWhere(where as Record<string, unknown>, ctx)
	if (!id) return null

	const entry = ctx.catalog.getEntry(id)
	if (!entry) return null

	const raw = await loadRecordByEntry(ctx.chunkManager, id, entry)
	if (!raw) return null

	const record = ctx.serializer.deserializeRecord(raw as Record<string, unknown>) as T
	return { id, record, entry }
}

/**
 * Handle unique constraint updates during upsert.
 *
 * Uses acquire-first ordering: acquire new constraints before releasing old ones
 * to prevent race conditions where another writer claims the value in between.
 * Tracks all acquisitions for rollback if a later constraint fails.
 */
async function handleUniqueUpdates<T>(
	ctx: UpsertContext<T>,
	id: string,
	existing: T,
	updateData: Record<string, unknown>
): Promise<void> {
	if (!ctx.uniqueIndexManager) return

	// Collect all constraint changes first
	const singleUpdates: Array<{ field: string; oldValue: unknown; newValue: unknown }> = []
	const compoundUpdates: Array<{ fields: string[]; oldValues: unknown[]; newValues: unknown[] }> = []

	for (const field of ctx.schema.uniqueFields) {
		if (!(field in updateData)) continue
		const oldValue = (existing as Record<string, unknown>)[field]
		const newValue = updateData[field]
		if (valuesEqual(oldValue, newValue)) continue
		singleUpdates.push({ field, oldValue, newValue })
	}

	for (const constraint of ctx.schema.compoundUniques) {
		const hasUpdatedField = constraint.fields.some(fld => fld in updateData)
		if (!hasUpdatedField) continue

		const oldValues = constraint.fields.map(fld => (existing as Record<string, unknown>)[fld])
		const newValues = constraint.fields.map(fld =>
			fld in updateData ? updateData[fld] : (existing as Record<string, unknown>)[fld]
		)

		if (oldValues.length === newValues.length && oldValues.every((v, i) => valuesEqual(v, newValues[i]))) {
			continue
		}
		compoundUpdates.push({ fields: constraint.fields, oldValues, newValues })
	}

	// Phase 1: Acquire all new constraints (may throw on duplicate)
	const acquiredSingle: Array<{ field: string; value: unknown }> = []
	const acquiredCompound: Array<{ fields: string[]; values: unknown[] }> = []

	try {
		for (const { field, newValue } of singleUpdates) {
			if (newValue !== null && newValue !== undefined) {
				await ctx.uniqueIndexManager.acquire(
					{ modelName: ctx.modelName, namespace: ctx.namespace, field },
					newValue,
					id
				)
				acquiredSingle.push({ field, value: newValue })
			}
		}

		for (const { fields, newValues } of compoundUpdates) {
			if (!newValues.some(v => v === null || v === undefined)) {
				await ctx.uniqueIndexManager.acquireCompound(
					{ modelName: ctx.modelName, namespace: ctx.namespace, fields },
					newValues,
					id
				)
				acquiredCompound.push({ fields, values: newValues })
			}
		}
	} catch (error) {
		// Rollback all acquired constraints
		for (const { field, value } of acquiredSingle) {
			try {
				await ctx.uniqueIndexManager.release(
					{ modelName: ctx.modelName, namespace: ctx.namespace, field },
					value
				)
			} catch {
				// Ignore release errors during rollback
			}
		}
		for (const { fields, values } of acquiredCompound) {
			try {
				await ctx.uniqueIndexManager.releaseCompound(
					{ modelName: ctx.modelName, namespace: ctx.namespace, fields },
					values
				)
			} catch {
				// Ignore release errors during rollback
			}
		}
		throw error
	}

	// Phase 2: Release old constraints (all acquires succeeded)
	for (const { field, oldValue } of singleUpdates) {
		if (oldValue !== null && oldValue !== undefined) {
			try {
				await ctx.uniqueIndexManager.release(
					{ modelName: ctx.modelName, namespace: ctx.namespace, field },
					oldValue
				)
			} catch {
				// Ignore release errors
			}
		}
	}

	for (const { fields, oldValues } of compoundUpdates) {
		if (!oldValues.some(v => v === null || v === undefined)) {
			try {
				await ctx.uniqueIndexManager.releaseCompound(
					{ modelName: ctx.modelName, namespace: ctx.namespace, fields },
					oldValues
				)
			} catch {
				// Ignore release errors
			}
		}
	}
}

