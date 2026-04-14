/**
 * Flashcore v1 Bulk Operations (spec rev 4.3)
 *
 * Implements createMany, updateMany, and deleteMany operations.
 * These operations require ACID capability (caps.acid === true).
 */

import type { FlashcoreAdapter } from '../../adapter/types.js'
import type {
	NormalizedSchema,
	CreateInput,
	WhereClause,
	UpdateInput,
	BatchResult
} from '../../schema/types.js'
import type { Catalog, CatalogEntry } from '../catalog.js'
import type { ChunkManager } from '../chunk.js'
import type { CatalogLockManager, ChunkLockManager } from '../locks.js'
import type { UniqueIndexManager } from '../../index/unique.js'
import { RecordValidator, throwIfInvalid } from '../../schema/validate.js'
import { TypeSerializer } from '../../schema/serialize.js'
import { applyDefaults, normalizeRecordShape } from '../../schema/normalize.js'
import { generateId, isValidId } from '../id.js'
import { UniqueConstraintError, SafetyError } from '../../core/errors.js'
import { requiresAcid } from '../../adapter/capabilities.js'
import { DEFAULT_SAFETY_LIMITS } from '../../core/constants.js'
import { evaluateWhere } from '../../query/evaluate.js'
import { encodeUniqueValue } from '../../core/encoding.js'
import { buildCompoundUniqueKey } from '../../core/keys.js'
import {
	findVersionField,
	loadRecordByEntry,
	getChunkIdFromEntry,
	incrementVersion,
	valuesEqual,
	type IndexCallbacks
} from './shared.js'

/**
 * Context for bulk operations.
 */
export interface BulkContext<_T> {
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
	safetyLimits?: typeof DEFAULT_SAFETY_LIMITS
}

/**
 * Result from createMany operation.
 */
export interface CreateManyResult<T> {
	count: number
	records: T[]
}

/**
 * Execute createMany operation.
 *
 * Creates multiple records atomically using transaction when available.
 * Requires caps.acid === true.
 *
 * Note: True atomicBatch support for bulk creates would require chunk-level
 * KV operation collection, which is not currently implemented. Only the
 * transaction path provides atomic guarantees; the fallback path is sequential.
 *
 * @param ctx - Bulk context
 * @param data - Array of records to create
 * @param skipDuplicates - If true, skip records with duplicate IDs/unique fields instead of throwing
 * @returns Created records
 */
export async function executeCreateMany<T extends { id: string }>(
	ctx: BulkContext<T>,
	data: CreateInput<T>[],
	skipDuplicates = false
): Promise<CreateManyResult<T>> {
	// Require ACID support
	requiresAcid(ctx.adapter)

	if (data.length === 0) {
		return { count: 0, records: [] }
	}

	// Prepare all records
	let preparedRecords: Array<{
		id: string
		normalized: Record<string, unknown>
		serialized: Record<string, unknown>
	}> = []

	const seenIds = new Set<string>()
	const seenUniqueValues = new Map<string, Set<string>>() // field -> set of values
	const seenCompoundValues = new Map<string, Set<string>>() // fields joined -> set of encoded value tuples

	for (const inputData of data) {
		const record = { ...inputData as Record<string, unknown> }

		// Generate ID if not provided
		if (!('id' in record) || record.id === undefined) {
			record.id = generateId()
		}

		const id = record.id as string

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

		// Check for duplicate IDs within the batch
		if (seenIds.has(id)) {
			if (skipDuplicates) continue
			throw new UniqueConstraintError(
				`Duplicate ID "${id}" in createMany batch`,
				{ model: ctx.modelName, field: 'id', value: id }
			)
		}
		seenIds.add(id)

		// Check if ID already exists in catalog
		if (ctx.catalog.has(id)) {
			if (skipDuplicates) continue
			throw new UniqueConstraintError(
				`Record with id "${id}" already exists in model "${ctx.modelName}"`,
				{ model: ctx.modelName, field: 'id', value: id }
			)
		}

		// Apply defaults
		const withDefaults = applyDefaults(record, ctx.schema)

		// Initialize version field to 0 if schema has one
		const versionField = findVersionField(ctx.schema)
		if (versionField && !(versionField in withDefaults)) {
			withDefaults[versionField] = 0
		}

		// Validate input
		const validationResult = ctx.validator.validateCreate(withDefaults)
		throwIfInvalid(validationResult)

		// Check unique constraints within batch
		let skipRecord = false

		for (const field of ctx.schema.uniqueFields) {
			const value = withDefaults[field]
			if (value !== null && value !== undefined) {
				const encodedValue = encodeUniqueValue(value)
				let fieldSet = seenUniqueValues.get(field)
				if (!fieldSet) {
					fieldSet = new Set()
					seenUniqueValues.set(field, fieldSet)
				}

				if (fieldSet.has(encodedValue)) {
					if (skipDuplicates) {
						skipRecord = true
						break
					}
					throw new UniqueConstraintError(
						`Duplicate value for unique field "${field}" in createMany batch`,
						{ model: ctx.modelName, field, value }
					)
				}
				fieldSet.add(encodedValue)
			}
		}

		if (skipRecord) continue

		// Check compound unique constraints within batch
		for (const constraint of ctx.schema.compoundUniques) {
			const values = constraint.fields.map(f => withDefaults[f])
			if (!values.some(v => v === null || v === undefined)) {
				const compoundKey = constraint.fields.join('..')
				const encodedValues = values.map(v => encodeUniqueValue(v)).join('..')
				let fieldSet = seenCompoundValues.get(compoundKey)
				if (!fieldSet) {
					fieldSet = new Set()
					seenCompoundValues.set(compoundKey, fieldSet)
				}

				if (fieldSet.has(encodedValues)) {
					if (skipDuplicates) {
						skipRecord = true
						break
					}
					throw new UniqueConstraintError(
						`Duplicate compound unique value for fields [${constraint.fields.join(', ')}] in createMany batch`,
						{ model: ctx.modelName, field: constraint.fields.join('+'), value: values }
					)
				}
				fieldSet.add(encodedValues)
			}
		}

		if (skipRecord) continue

		// Normalize and serialize
		const normalized = normalizeRecordShape(withDefaults, ctx.schema)
		normalized[ctx.schema.primaryKey] = id
		const serialized = ctx.serializer.serializeRecord(normalized)

		preparedRecords.push({ id, normalized, serialized })
	}

	if (preparedRecords.length === 0) {
		return { count: 0, records: [] }
	}

	// Execute atomically
	const createdRecords: T[] = []

	await ctx.catalogLock.withCatalogLock(ctx.modelKey, async () => {
		// Acquire all unique constraints first
		const acquiredConstraints: Array<{
			field: string
			value: unknown
			id: string
		}> = []
		const acquiredCompoundConstraints: Array<{
			fields: string[]
			values: unknown[]
			id: string
		}> = []
		const skippedIds = new Set<string>()

		const releaseAllConstraints = async () => {
			if (!ctx.uniqueIndexManager) return
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

		const releaseRecordConstraints = async (recordId: string) => {
			if (!ctx.uniqueIndexManager) return
			for (const constraint of acquiredConstraints.filter(c => c.id === recordId)) {
				try {
					await ctx.uniqueIndexManager.release(
						{ modelName: ctx.modelName, namespace: ctx.namespace, field: constraint.field },
						constraint.value
					)
				} catch {
					// Ignore release errors
				}
			}
			for (const constraint of acquiredCompoundConstraints.filter(c => c.id === recordId)) {
				try {
					await ctx.uniqueIndexManager.releaseCompound(
						{ modelName: ctx.modelName, namespace: ctx.namespace, fields: constraint.fields },
						constraint.values
					)
				} catch {
					// Ignore release errors
				}
			}
		}

		const removeRecordFromAcquiredLists = (recordId: string) => {
			for (let i = acquiredConstraints.length - 1; i >= 0; i--) {
				if (acquiredConstraints[i].id === recordId) acquiredConstraints.splice(i, 1)
			}
			for (let i = acquiredCompoundConstraints.length - 1; i >= 0; i--) {
				if (acquiredCompoundConstraints[i].id === recordId) acquiredCompoundConstraints.splice(i, 1)
			}
		}

		if (ctx.uniqueIndexManager) {
			for (const { id, normalized } of preparedRecords) {
				let recordSkipped = false

				// Single-field unique constraints
				for (const field of ctx.schema.uniqueFields) {
					const value = normalized[field]
					if (value !== null && value !== undefined) {
						try {
							await ctx.uniqueIndexManager.acquire(
								{ modelName: ctx.modelName, namespace: ctx.namespace, field },
								value,
								id
							)
							acquiredConstraints.push({ field, value, id })
						} catch (error) {
							if (skipDuplicates && error instanceof UniqueConstraintError) {
								await releaseRecordConstraints(id)
								removeRecordFromAcquiredLists(id)
								skippedIds.add(id)
								recordSkipped = true
								break
							}

							await releaseAllConstraints()
							throw error
						}
					}
				}

				if (recordSkipped) continue

				// Compound unique constraints
				for (const constraint of ctx.schema.compoundUniques) {
					const values = constraint.fields.map(f => normalized[f])
					if (!values.some(v => v === null || v === undefined)) {
						try {
							await ctx.uniqueIndexManager.acquireCompound(
								{ modelName: ctx.modelName, namespace: ctx.namespace, fields: constraint.fields },
								values,
								id
							)
							acquiredCompoundConstraints.push({ fields: constraint.fields, values, id })
						} catch (error) {
							if (skipDuplicates && error instanceof UniqueConstraintError) {
								await releaseRecordConstraints(id)
								removeRecordFromAcquiredLists(id)
								skippedIds.add(id)
								recordSkipped = true
								break
							}

							await releaseAllConstraints()
							throw error
						}
					}
				}
			}
		}

		// Filter out skipped records
		preparedRecords = preparedRecords.filter(r => !skippedIds.has(r.id))

		if (preparedRecords.length === 0) {
			return
		}

		try {
			// Use transaction for atomic writes, fall back to sequential
			const writeRecords = async () => {
				for (const { id, serialized } of preparedRecords) {
					const sizeCheck = ctx.chunkManager.checkRecordSize(serialized)
					if (sizeCheck.needsSegmentation) {
						const segmentIds = await ctx.chunkManager.saveSegmentedRecord(id, serialized)
						ctx.catalog.addSegmentedEntry(id, segmentIds)
					} else {
						const chunkId = ctx.chunkManager.selectChunkForInsert(ctx.catalog, sizeCheck.estimatedSize)
						await ctx.chunkManager.setRecord(chunkId, id, serialized)
						ctx.catalog.addEntry(id, chunkId, sizeCheck.estimatedSize)
					}
				}

				await ctx.persistCatalog()
			}

			if (ctx.adapter.transaction) {
				await ctx.adapter.transaction(writeRecords)
			} else {
				// Sequential fallback (atomicBatch-only adapters)
				await writeRecords()
			}

			// Deserialize records for return
			for (const { serialized } of preparedRecords) {
				createdRecords.push(ctx.serializer.deserializeRecord(serialized) as T)
			}

			// Update indexes
			if (ctx.indexCallbacks) {
				for (const { id, normalized } of preparedRecords) {
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
				}

				if (ctx.indexCallbacks.markDirty) {
					ctx.indexCallbacks.markDirty()
				}
			}
		} catch (error) {
			await releaseAllConstraints()
			throw error
		}
	})

	return { count: createdRecords.length, records: createdRecords }
}

/**
 * Execute updateMany operation.
 *
 * Updates multiple records matching the where clause.
 * Requires caps.acid === true.
 *
 * @param ctx - Bulk context
 * @param where - Filter clause
 * @param data - Update data
 * @returns Number of records updated
 */
export async function executeUpdateMany<T extends { id: string }>(
	ctx: BulkContext<T>,
	where: WhereClause<T>,
	data: UpdateInput<T>
): Promise<BatchResult> {
	// Require ACID support
	requiresAcid(ctx.adapter)

	// Safety check: require where clause
	if (!where || Object.keys(where).length === 0) {
		throw new SafetyError(
			'updateMany requires a where clause. Use explicit criteria to prevent accidental bulk updates.',
			{ reason: 'missing_where_clause' }
		)
	}

	// Validate update data
	const updateData = data as Record<string, unknown>

	// Reject ID mutation
	if ('id' in updateData) {
		throw new Error('Cannot update id field. ID is immutable.')
	}

	const validationResult = ctx.validator.validateUpdate(updateData)
	throwIfInvalid(validationResult)

	// Find matching records
	const allIds = ctx.catalog.getAllIds()
	const matchingRecords: Array<{ id: string; record: T; entry: CatalogEntry }> = []

	for (const id of allIds) {
		const entry = ctx.catalog.getEntry(id)
		if (!entry) continue

		const raw = await loadRecordByEntry(ctx.chunkManager, id, entry)
		if (!raw) continue

		const record = ctx.serializer.deserializeRecord(raw as Record<string, unknown>) as T

		// Evaluate where clause
		if (evaluateWhere(record, where)) {
			matchingRecords.push({ id, record, entry })
		}
	}

	if (matchingRecords.length === 0) {
		return { count: 0 }
	}

	// Validate unique constraints BEFORE applying any updates
	// This ensures atomicity - either all updates succeed or none
	if (ctx.uniqueIndexManager) {
		const matchingIds = new Set(matchingRecords.map(r => r.id))

		for (const field of ctx.schema.uniqueFields) {
			if (field in updateData) {
				const newValue = updateData[field]
				if (newValue !== null && newValue !== undefined) {
					// If updating multiple records to the same unique value, that's a violation
					if (matchingRecords.length > 1) {
						throw new UniqueConstraintError(
							`Cannot update multiple records to same ${field} value '${newValue}': uniqueness would be violated`,
							{ model: ctx.modelName, field, value: newValue }
						)
					}

					// Check if this value exists on a record NOT being updated
					const existingId = await ctx.uniqueIndexManager.lookup(
						{ modelName: ctx.modelName, namespace: ctx.namespace, field },
						newValue
					)

					if (existingId && !matchingIds.has(existingId)) {
						throw new UniqueConstraintError(
							`Cannot update ${field} to '${newValue}': value already exists on another record`,
							{ model: ctx.modelName, field, value: newValue }
						)
					}
				}
			}
		}

		// Validate compound unique constraints
		for (const constraint of ctx.schema.compoundUniques) {
			const hasUpdatedField = constraint.fields.some(fld => fld in updateData)
			if (!hasUpdatedField) continue

			// For each matching record, compute what the new compound values would be
			for (const { id, record } of matchingRecords) {
				const newValues = constraint.fields.map(fld =>
					fld in updateData ? updateData[fld] : (record as Record<string, unknown>)[fld]
				)

				// Skip if any value is null/undefined
				if (newValues.some(v => v === null || v === undefined)) continue

				// Check if any OTHER record (not being updated) already has this compound value
				// by attempting a temporary acquire/release check
				const encodedValues = newValues.map(v => encodeUniqueValue(v))
				const key = buildCompoundUniqueKey(ctx.modelName, constraint.fields, encodedValues, ctx.namespace)
				const existing = await ctx.adapter.get(key) as { id: string } | undefined

				if (existing && existing.id !== id && !matchingIds.has(existing.id)) {
					throw new UniqueConstraintError(
						`Cannot update fields [${constraint.fields.join(', ')}]: compound value combination already exists on another record`,
						{ model: ctx.modelName, field: constraint.fields.join('+'), value: newValues }
					)
				}
			}

			// If updating multiple records, check that they don't all converge to the same compound value
			if (matchingRecords.length > 1) {
				const seenValues = new Set<string>()
				for (const { record } of matchingRecords) {
					const newValues = constraint.fields.map(fld =>
						fld in updateData ? updateData[fld] : (record as Record<string, unknown>)[fld]
					)
					if (newValues.some(v => v === null || v === undefined)) continue

					const encoded = newValues.map(v => encodeUniqueValue(v)).join('..')
					if (seenValues.has(encoded)) {
						throw new UniqueConstraintError(
							`Cannot update multiple records to same compound value for fields [${constraint.fields.join(', ')}]`,
							{ model: ctx.modelName, field: constraint.fields.join('+'), value: newValues }
						)
					}
					seenValues.add(encoded)
				}
			}
		}
	}

	let updatedCount = 0

	// Update matching records
	for (const { id, record, entry } of matchingRecords) {
		// Merge existing record with update data
		const merged = { ...(record as Record<string, unknown>), ...updateData }
		merged.id = id

		// Increment version field if present (with overflow protection)
		incrementVersion(merged, ctx.schema, ctx.modelName, id)

		// Normalize and serialize
		const normalized = normalizeRecordShape(merged, ctx.schema)
		const serialized = ctx.serializer.serializeRecord(normalized)

		// Update storage based on record size and current storage type
		const sizeCheck = ctx.chunkManager.checkRecordSize(serialized)
		const needsSegmentation = sizeCheck.needsSegmentation
		const isSegmented = entry.kind === 'segments'

		if (needsSegmentation) {
			if (isSegmented && entry.segmentIds) {
				// segments -> segments: update in place
				const newSegmentIds = await ctx.chunkManager.updateSegmentedRecord(id, entry.segmentIds, serialized)
				ctx.catalog.addSegmentedEntry(id, newSegmentIds)
			} else {
				// chunk -> segments: save as segments, remove from old chunk
				const segmentIds = await ctx.chunkManager.saveSegmentedRecord(id, serialized)
				ctx.catalog.addSegmentedEntry(id, segmentIds)
				if (entry.kind === 'chunk' && entry.chunkId !== undefined) {
					await ctx.chunkManager.deleteRecord(entry.chunkId, id)
				}
			}
		} else if (isSegmented && entry.segmentIds) {
			// segments -> chunk: write to chunk, delete old segments
			const targetChunkId = ctx.chunkManager.selectChunkForInsert(ctx.catalog, sizeCheck.estimatedSize)
			await ctx.chunkManager.setRecord(targetChunkId, id, serialized)
			ctx.catalog.addEntry(id, targetChunkId, sizeCheck.estimatedSize)
			await ctx.chunkManager.deleteSegmentedRecord(id, entry.segmentIds)
		} else {
			// chunk -> chunk: regular update
			const chunkId = getChunkIdFromEntry(entry)
			await ctx.chunkManager.setRecord(chunkId, id, serialized)
		}

		// Update unique index entries (acquire new, release old)
		if (ctx.uniqueIndexManager) {
			for (const field of ctx.schema.uniqueFields) {
				if (!(field in updateData)) continue

				const oldValue = (record as Record<string, unknown>)[field]
				const newValue = updateData[field]

				if (valuesEqual(oldValue, newValue)) continue

				// Acquire new constraint
				if (newValue !== null && newValue !== undefined) {
					await ctx.uniqueIndexManager.acquire(
						{ modelName: ctx.modelName, namespace: ctx.namespace, field },
						newValue,
						id
					)
				}

				// Release old constraint
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

			// Update compound unique index entries
			for (const constraint of ctx.schema.compoundUniques) {
				const hasUpdatedField = constraint.fields.some(fld => fld in updateData)
				if (!hasUpdatedField) continue

				const oldValues = constraint.fields.map(fld => (record as Record<string, unknown>)[fld])
				const newValues = constraint.fields.map(fld =>
					fld in updateData ? updateData[fld] : (record as Record<string, unknown>)[fld]
				)

				if (oldValues.length === newValues.length && oldValues.every((v, i) => valuesEqual(v, newValues[i]))) {
					continue
				}

				// Acquire new compound constraint
				if (!newValues.some(v => v === null || v === undefined)) {
					await ctx.uniqueIndexManager.acquireCompound(
						{ modelName: ctx.modelName, namespace: ctx.namespace, fields: constraint.fields },
						newValues,
						id
					)
				}

				// Release old compound constraint
				if (!oldValues.some(v => v === null || v === undefined)) {
					try {
						await ctx.uniqueIndexManager.releaseCompound(
							{ modelName: ctx.modelName, namespace: ctx.namespace, fields: constraint.fields },
							oldValues
						)
					} catch {
						// Ignore release errors
					}
				}
			}
		}

		// Update sorted indexes
		if (ctx.indexCallbacks) {
			for (const field of ctx.schema.indexedFields) {
				if (!(field in updateData)) continue

				const oldValue = (record as Record<string, unknown>)[field]
				const newValue = normalized[field]

				if (!valuesEqual(oldValue, newValue)) {
					if (ctx.indexCallbacks.removeFromSortedIndex && oldValue !== null && oldValue !== undefined) {
						ctx.indexCallbacks.removeFromSortedIndex(field, oldValue, id)
					}
					if (ctx.indexCallbacks.addToSortedIndex && newValue !== null && newValue !== undefined) {
						ctx.indexCallbacks.addToSortedIndex(field, newValue, id)
					}
				}
			}

			if (ctx.indexCallbacks.markDirty) {
				ctx.indexCallbacks.markDirty()
			}
		}

		updatedCount++
	}

	if (updatedCount > 0) {
		await ctx.persistCatalog()
	}

	return { count: updatedCount }
}

/**
 * Execute deleteMany operation.
 *
 * Deletes multiple records matching the where clause.
 * Requires caps.acid === true.
 *
 * @param ctx - Bulk context
 * @param where - Filter clause
 * @returns Number of records deleted
 */
export async function executeDeleteMany<T extends { id: string }>(
	ctx: BulkContext<T>,
	where: WhereClause<T>
): Promise<BatchResult> {
	// Require ACID support
	requiresAcid(ctx.adapter)

	// Safety check: require where clause
	if (!where || Object.keys(where).length === 0) {
		throw new SafetyError(
			'deleteMany requires a where clause. Use explicit criteria to prevent accidental bulk deletes.',
			{ reason: 'missing_where_clause' }
		)
	}

	// Find matching records
	const allIds = ctx.catalog.getAllIds()
	const matchingRecords: Array<{ id: string; record: T; entry: CatalogEntry }> = []

	for (const id of allIds) {
		const entry = ctx.catalog.getEntry(id)
		if (!entry) continue

		const raw = await loadRecordByEntry(ctx.chunkManager, id, entry)
		if (!raw) continue

		const record = ctx.serializer.deserializeRecord(raw as Record<string, unknown>) as T

		// Evaluate where clause
		if (evaluateWhere(record, where)) {
			matchingRecords.push({ id, record, entry })
		}
	}

	if (matchingRecords.length === 0) {
		return { count: 0 }
	}

	let deletedCount = 0

	await ctx.catalogLock.withCatalogLock(ctx.modelKey, async () => {
		// Delete matching records
		for (const { id, record, entry } of matchingRecords) {
			// Release unique constraints
			if (ctx.uniqueIndexManager) {
				for (const field of ctx.schema.uniqueFields) {
					const value = (record as Record<string, unknown>)[field]
					if (value !== null && value !== undefined) {
						try {
							await ctx.uniqueIndexManager.release(
								{ modelName: ctx.modelName, namespace: ctx.namespace, field },
								value
							)
						} catch {
							// Ignore release errors
						}
					}
				}

				// Release compound unique constraints
				for (const constraint of ctx.schema.compoundUniques) {
					const values = constraint.fields.map(f => (record as Record<string, unknown>)[f])
					if (!values.some(v => v === null || v === undefined)) {
						try {
							await ctx.uniqueIndexManager.releaseCompound(
								{ modelName: ctx.modelName, namespace: ctx.namespace, fields: constraint.fields },
								values
							)
						} catch {
							// Ignore release errors
						}
					}
				}
			}

			// Delete from storage based on entry type
			if (entry.kind === 'segments' && entry.segmentIds) {
				await ctx.chunkManager.deleteSegmentedRecord(id, entry.segmentIds)
			} else if (entry.kind === 'chunk' && entry.chunkId !== undefined) {
				await ctx.chunkManager.deleteRecord(entry.chunkId, id)
			}

			// Update catalog
			ctx.catalog.removeEntry(id)

			// Update indexes
			if (ctx.indexCallbacks) {
				if (ctx.indexCallbacks.removeFromFilter) {
					ctx.indexCallbacks.removeFromFilter(id)
				}

				if (ctx.indexCallbacks.removeFromSortedIndex) {
					for (const field of ctx.schema.indexedFields) {
						const value = (record as Record<string, unknown>)[field]
						if (value !== null && value !== undefined) {
							ctx.indexCallbacks.removeFromSortedIndex(field, value, id)
						}
					}
				}
			}

			deletedCount++
		}

		// Persist catalog
		await ctx.persistCatalog()

		// Mark indexes as dirty
		if (ctx.indexCallbacks?.markDirty) {
			ctx.indexCallbacks.markDirty()
		}
	})

	return { count: deletedCount }
}
