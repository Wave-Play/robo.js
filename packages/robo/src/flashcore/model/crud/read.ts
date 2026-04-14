/**
 * Flashcore v1 (spec rev 4.3) Read Operation
 *
 * Implements the findUnique() CRUD operation.
 */

import type { NormalizedSchema, FindUniqueArgs, IncludeClause } from '../../schema/types.js'
import type { Catalog } from '../catalog.js'
import type { ChunkManager } from '../chunk.js'
import type { UniqueIndexManager } from '../../index/unique.js'
import type { IncludeContext } from '../../relation/types.js'
import { TypeSerializer } from '../../schema/serialize.js'
import { ValidationError } from '../../core/errors.js'
import { resolveInclude, hasIncludes } from '../../relation/include.js'
import { extractIdFromWhere, applySelect, loadRecordByEntry, validateWhereClause } from './shared.js'

/**
 * Context for read operation.
 */
export interface ReadContext<T> {
	modelName: string
	schema: NormalizedSchema
	catalog: Catalog
	chunkManager: ChunkManager
	serializer: TypeSerializer
	uniqueIndexManager?: UniqueIndexManager
	namespace?: string

	// Optional include context (Phase 9)
	includeContext?: IncludeContext
}

/**
 * Execute findUnique operation.
 *
 * 1. Extract ID from where clause
 * 2. Look up catalog entry
 * 3. If not found, return null
 * 4. Load record (from chunk or segments depending on entry kind)
 * 5. Deserialize and return
 *
 * @param ctx - Read context
 * @param args - Find arguments
 * @returns Found record or null
 */
export async function executeFindUnique<T extends { id: string }>(
	ctx: ReadContext<T>,
	args: FindUniqueArgs<T>
): Promise<T | null> {
	// Validate where clause
	validateWhereClause(args.where, 'findUnique')

	// Extract ID from where clause (may use unique index lookup)
	const { id, hadUniqueField } = await extractIdFromWhere(args.where, ctx)

	// If no id/unique field was provided, throw
	if (!hadUniqueField) {
		throw new ValidationError('findUnique where clause must include id or a unique field')
	}

	// If unique field was used but not found, return null
	if (!id) {
		return null
	}

	// Get catalog entry to check storage type
	const entry = ctx.catalog.getEntry(id)

	if (!entry) {
		// Record doesn't exist
		return null
	}

	const record = await loadRecordByEntry(ctx.chunkManager, id, entry)
	if (!record) {
		return null
	}

	// Deserialize for return
	let deserialized = ctx.serializer.deserializeRecord(
		record as Record<string, unknown>
	) as T

	// Resolve includes (Phase 9)
	if (args.include && hasIncludes(args.include as IncludeClause) && ctx.includeContext) {
		deserialized = await resolveInclude(
			deserialized,
			args.include as IncludeClause,
			ctx.schema,
			ctx.modelName,
			ctx.includeContext
		) as T
	}

	// Apply select if specified
	if (args.select) {
		return applySelect(deserialized, args.select)
	}

	return deserialized
}

/**
 * Check if a record exists.
 *
 * @param ctx - Read context
 * @param id - Record ID
 * @returns True if exists
 */
export async function existsById<T>(
	ctx: ReadContext<T>,
	id: string
): Promise<boolean> {
	return ctx.catalog.has(id)
}
