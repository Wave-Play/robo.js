/**
 * Flashcore v1 (spec rev 4.3) Create Operation
 *
 * Implements the create() CRUD operation with WAL protection.
 */

import type { NormalizedSchema, ModelHooks } from '../../schema/types.js'
import type { Catalog } from '../catalog.js'
import type { ChunkManager } from '../chunk.js'
import type { CatalogLockManager, ChunkLockManager } from '../locks.js'
import type { UniqueIndexManager, UniqueConstraintOptions, CompoundUniqueConstraintOptions } from '../../index/unique.js'
import type { WalContext, UniqueChange } from '../../wal/types.js'
import { RecordValidator, throwIfInvalid } from '../../schema/validate.js'
import { TypeSerializer } from '../../schema/serialize.js'
import { applyDefaults, normalizeRecordShape } from '../../schema/normalize.js'
import { generateId, isValidId } from '../id.js'
import { executeBeforeCreate, executeAfterCreate } from '../hooks.js'
import { UniqueConstraintError } from '../../core/errors.js'
import { buildUniqueKey } from '../../core/keys.js'
import { encodeUniqueValue } from '../../core/encoding.js'
import { splitRecordToSegments } from '../segments.js'
import {
	findVersionField,
	resolveChunkKey,
	releaseConstraintsOnError,
	type IndexCallbacks,
	type RelationCallbacks
} from './shared.js'

/**
 * Context for create operation.
 */
export interface CreateContext<T> {
	modelName: string
	modelKey: string
	schema: NormalizedSchema
	catalog: Catalog
	chunkManager: ChunkManager
	catalogLock: CatalogLockManager
	chunkLock: ChunkLockManager
	validator: RecordValidator
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

	// Optional relation callbacks (Phase 9)
	relationCallbacks?: RelationCallbacks
}

/**
 * Execute create operation.
 *
 * 1. Validate input (required fields, types, unknown rejection)
 * 2. Generate ID if not provided
 * 3. Apply defaults
 * 4. Execute beforeCreate hook
 * 5. Begin WAL entry (if enabled)
 * 6. Check ID uniqueness (via catalog lookup)
 * 7. Acquire catalog lock
 * 8. Acquire unique constraints
 * 9. Select chunk, acquire chunk lock
 * 10. Add to chunk, update catalog (mark WAL authoritative)
 * 11. Release locks
 * 12. Complete WAL
 * 13. Execute afterCreate hook
 * 14. Return created record
 *
 * @param ctx - Create context
 * @param data - Input data
 * @returns Created record
 */
export async function executeCreate<T extends { id: string }>(
	ctx: CreateContext<T>,
	data: unknown
): Promise<T> {
	// Ensure data is an object
	const inputData = (typeof data === 'object' && data !== null)
		? { ...data as Record<string, unknown> }
		: {}

	// Generate ID if not provided
	if (!('id' in inputData) || inputData.id === undefined) {
		inputData.id = generateId()
	}

	// Validate ID format
	const id = inputData.id as string
	if (!isValidId(id)) {
		throwIfInvalid({
			valid: false,
			errors: [{
				field: 'id',
				message: 'Invalid ID format. IDs must be non-empty strings containing only letters, numbers, underscores, and hyphens, with max length 200.',
				code: 'INVALID_ID'
			}]
		})
	}

	// Apply defaults before validation
	const withDefaults = applyDefaults(inputData, ctx.schema)

	// Initialize version field to 0 if schema has one
	const versionField = findVersionField(ctx.schema)
	if (versionField && !(versionField in withDefaults)) {
		withDefaults[versionField] = 0
	}

	// Validate input
	const validationResult = ctx.validator.validateCreate(withDefaults)
	throwIfInvalid(validationResult)

	// Validate foreign keys (Phase 9)
	if (ctx.relationCallbacks?.validateForeignKeys) {
		await ctx.relationCallbacks.validateForeignKeys(withDefaults)
	}

	// Execute beforeCreate hook (may modify data)
	const hookedData = await executeBeforeCreate(ctx.hooks, withDefaults) as Record<string, unknown>

	// Normalize record shape
	const normalized = normalizeRecordShape(hookedData, ctx.schema)

	// Ensure ID is preserved after hooks
	normalized[ctx.schema.primaryKey] = id

	// Serialize for storage
	const serialized = ctx.serializer.serializeRecord(normalized)

	// Track WAL entry ID for cleanup
	let walId: string | null = null
	const walEnabled = ctx.wal?.manager.isEnabled() ?? false

	// Acquire catalog lock for the entire create operation
	const result = await ctx.catalogLock.withCatalogLock(ctx.modelKey, async () => {
		// Check if ID already exists
		if (ctx.catalog.has(id)) {
			throw new UniqueConstraintError(
				`Record with id "${id}" already exists in model "${ctx.modelName}"`,
				{ model: ctx.modelName, field: 'id', value: id }
			)
		}

		// Build unique constraint keys for WAL deltas
		const uniqueKeys: UniqueChange[] = []
		if (ctx.schema.uniqueFields.length > 0) {
			for (const field of ctx.schema.uniqueFields) {
				const value = normalized[field]
				if (value !== null && value !== undefined) {
					const encodedValue = encodeUniqueValue(value)
					const key = buildUniqueKey(ctx.modelName, field, encodedValue, ctx.namespace)
					uniqueKeys.push({ key, id })
				}
			}
		}

		// Check if record needs segmentation (large record)
		const sizeCheck = ctx.chunkManager.checkRecordSize(serialized)
		const needsSegmentation = sizeCheck.needsSegmentation

		// Select chunk for insertion (returns -1 if needs segmentation)
		const chunkId = needsSegmentation ? -1 : ctx.chunkManager.selectChunkForInsert(ctx.catalog, sizeCheck.estimatedSize)

		// Get full chunk key for WAL (only if not segmented)
		const fullChunkKey = chunkId >= 0
			? resolveChunkKey(ctx.modelName, chunkId, ctx.namespace, ctx.getChunkKey)
			: ''

		// Begin WAL entry (if enabled)
		if (walEnabled && ctx.wal) {
			const deltas = needsSegmentation
				? (() => {
					const { segmentIds, segments } = splitRecordToSegments(ctx.chunkManager, id, serialized)
					return ctx.wal.deltas.buildCreateSegmentedDeltas(id, segmentIds, segments, uniqueKeys)
				})()
				: ctx.wal.deltas.buildCreateDeltas(fullChunkKey, chunkId, id, serialized, uniqueKeys)

			walId = await ctx.wal.manager.begin({
				model: ctx.modelName,
				namespace: ctx.namespace,
				op: 'create',
				auth: deltas.auth,
				undo: deltas.undo,
				derived: deltas.derived
			})
		}

		// Acquire unique constraints for all unique fields (after WAL begin)
		const acquiredConstraints: Array<{ options: UniqueConstraintOptions; value: unknown }> = []
		const acquiredCompoundConstraints: Array<{ options: CompoundUniqueConstraintOptions; values: unknown[] }> = []

		if (ctx.uniqueIndexManager && ctx.schema.uniqueFields.length > 0) {
			try {
				for (const field of ctx.schema.uniqueFields) {
					const value = normalized[field]

					// Skip null/undefined values (no constraint)
					if (value === null || value === undefined) {
						continue
					}

					const options: UniqueConstraintOptions = {
						modelName: ctx.modelName,
						namespace: ctx.namespace,
						field
					}

					await ctx.uniqueIndexManager.acquire(options, value, id)
					acquiredConstraints.push({ options, value })
				}
			} catch (error) {
				walId = await releaseConstraintsOnError(ctx.uniqueIndexManager, acquiredConstraints, walId, ctx.wal)
				throw error
			}
		}

		// Acquire compound unique constraints
		if (ctx.uniqueIndexManager && ctx.schema.compoundUniques.length > 0) {
			try {
				for (const constraint of ctx.schema.compoundUniques) {
					const values = constraint.fields.map(f => normalized[f])

					// Skip if any value is null/undefined
					if (values.some(v => v === null || v === undefined)) {
						continue
					}

					const options: CompoundUniqueConstraintOptions = {
						modelName: ctx.modelName,
						namespace: ctx.namespace,
						fields: constraint.fields
					}

					await ctx.uniqueIndexManager.acquireCompound(options, values, id)
					acquiredCompoundConstraints.push({ options, values })
				}
			} catch (error) {
				walId = await releaseConstraintsOnError(ctx.uniqueIndexManager, acquiredConstraints, walId, ctx.wal, acquiredCompoundConstraints)
				throw error
			}
		}

		try {
			let created: T

			if (needsSegmentation) {
				// Store as segmented record
				const segmentIds = await ctx.chunkManager.saveSegmentedRecord(id, serialized)

				// Update catalog with segment entry
				ctx.catalog.addSegmentedEntry(id, segmentIds)

				// Persist catalog
				await ctx.persistCatalog()

				// Deserialize for return
				created = ctx.serializer.deserializeRecord(serialized) as T
			} else {
				// Acquire chunk lock and perform insert
				created = await ctx.chunkLock.withChunkLock(ctx.modelKey, chunkId, async () => {
					// Add record to chunk
					await ctx.chunkManager.setRecord(chunkId, id, serialized)

					// Update catalog with size info
					ctx.catalog.addEntry(id, chunkId, sizeCheck.estimatedSize)

					// Persist catalog
					await ctx.persistCatalog()

					// Deserialize for return
					return ctx.serializer.deserializeRecord(serialized) as T
				})
			}

		// Mark WAL as authoritative (all writes complete)
		if (walId && ctx.wal) {
			await ctx.wal.manager.markPhase(walId, 'authoritative')
		}

		// Derived writes: update filter and sorted indexes (Phase 6)
		if (ctx.indexCallbacks) {
			// Add to filter
			if (ctx.indexCallbacks.addToFilter) {
				ctx.indexCallbacks.addToFilter(id)
			}

			// Add to sorted indexes for indexed fields
			if (ctx.indexCallbacks.addToSortedIndex) {
				for (const field of ctx.schema.indexedFields) {
					const value = normalized[field]
					if (value !== null && value !== undefined) {
						ctx.indexCallbacks.addToSortedIndex(field, value, id)
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

		return created
	} catch (error) {
		// Release unique constraints on chunk/catalog failure
		await releaseConstraintsOnError(ctx.uniqueIndexManager, acquiredConstraints, walId, ctx.wal, acquiredCompoundConstraints)
		// WAL will be recovered on next startup (if crash occurs here)
		throw error
	}
	})

	// Complete WAL entry (operation successful)
	if (walId && ctx.wal) {
		await ctx.wal.manager.complete(walId)
	}

	// Execute afterCreate hook
	await executeAfterCreate(ctx.hooks, result)

	return result
}

