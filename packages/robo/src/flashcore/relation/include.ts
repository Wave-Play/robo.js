/**
 * Flashcore v1 (spec rev 4.3) Include Resolution
 *
 * Resolves relation includes for queries with batching to prevent N+1.
 */

import type { NormalizedSchema } from '../schema/types.js'
import type { IncludeClause, IncludeOptions, ParsedIncludeEntry, IncludeContext } from './types.js'
import { MAX_INCLUDE_DEPTH } from '../core/constants.js'
import { FlashcoreError } from '../core/errors.js'
import { getJunctionTableDef, resolveJunctionFKs } from './junction.js'

/**
 * Parse and validate an include clause against the model's schema.
 *
 * @param includeClause - Include clause from query args
 * @param schema - Model's normalized schema
 * @returns Array of parsed include entries
 */
export function parseIncludeClause(
	includeClause: IncludeClause,
	schema: NormalizedSchema
): ParsedIncludeEntry[] {
	const entries: ParsedIncludeEntry[] = []

	for (const [field, value] of Object.entries(includeClause)) {
		const relation = schema.relations.get(field)

		if (!relation) {
			throw new FlashcoreError(
				`Unknown relation field '${field}' in include clause. ` +
				`Available relations: ${[...schema.relations.keys()].join(', ') || 'none'}`
			)
		}

		const options: IncludeOptions = typeof value === 'object' && value !== null
			? value as IncludeOptions
			: {}

		entries.push({
			field,
			type: relation.type,
			targetModel: relation.model,
			foreignKey: relation.foreignKey,
			options
		})
	}

	return entries
}

/**
 * Resolve includes for a single record.
 *
 * @param record - Record to resolve includes for
 * @param includeClause - Include clause
 * @param schema - Model's normalized schema
 * @param modelName - Model name (for junction table resolution)
 * @param ctx - Include context
 * @returns Record with resolved includes
 */
export async function resolveInclude<T extends { id: string }>(
	record: T,
	includeClause: IncludeClause,
	schema: NormalizedSchema,
	modelName: string,
	ctx: IncludeContext
): Promise<T & Record<string, unknown>> {
	if (ctx.depth >= MAX_INCLUDE_DEPTH) {
		throw new FlashcoreError(
			`Include depth limit (${MAX_INCLUDE_DEPTH}) exceeded. ` +
			`Reduce nesting or restructure your query.`
		)
	}

	const entries = parseIncludeClause(includeClause, schema)
	const result = { ...record } as T & Record<string, unknown>

	for (const entry of entries) {
		const targetModel = ctx.getModel(entry.targetModel) as {
			findUnique: (args: unknown) => Promise<unknown | null>
			findMany: (args: unknown) => Promise<unknown[]>
		} | undefined

		if (!targetModel) {
			;(result as Record<string, unknown>)[entry.field] = entry.type === 'hasMany' || entry.type === 'manyToMany'
				? []
				: null
			continue
		}

		switch (entry.type) {
			case 'belongsTo': {
				// Look up the related record by FK
				const fkValue = (record as Record<string, unknown>)[entry.foreignKey!]
				if (!fkValue) {
					;(result as Record<string, unknown>)[entry.field] = null
					break
				}

				const related = await targetModel.findUnique({ where: { id: fkValue } })
				;(result as Record<string, unknown>)[entry.field] = related

				// Handle nested includes
				if (related && entry.options.include) {
					const targetSchema = getSchemaForModel(entry.targetModel, ctx)
					if (targetSchema) {
						;(result as Record<string, unknown>)[entry.field] = await resolveInclude(
							related as { id: string },
							entry.options.include,
							targetSchema,
							entry.targetModel,
							{ ...ctx, depth: ctx.depth + 1 }
						)
					}
				}
				break
			}

			case 'hasOne': {
				// Find the single related record
				const findArgs: Record<string, unknown> = {
					where: { [entry.foreignKey!]: record.id }
				}

				if (entry.options.select) {
					findArgs.select = entry.options.select
				}

				const results = await targetModel.findMany({ ...findArgs, take: 1 })
				const related = results[0] ?? null
				;(result as Record<string, unknown>)[entry.field] = related

				// Handle nested includes
				if (related && entry.options.include) {
					const targetSchema = getSchemaForModel(entry.targetModel, ctx)
					if (targetSchema) {
						;(result as Record<string, unknown>)[entry.field] = await resolveInclude(
							related as { id: string },
							entry.options.include,
							targetSchema,
							entry.targetModel,
							{ ...ctx, depth: ctx.depth + 1 }
						)
					}
				}
				break
			}

			case 'hasMany': {
				// Find all related records
				const findArgs: Record<string, unknown> = {
					where: { [entry.foreignKey!]: record.id, ...entry.options.where }
				}

				if (entry.options.orderBy) {
					findArgs.orderBy = entry.options.orderBy
				}
				if (entry.options.take !== undefined) {
					findArgs.take = entry.options.take
				}
				if (entry.options.skip !== undefined) {
					findArgs.skip = entry.options.skip
				}
				if (entry.options.select) {
					findArgs.select = entry.options.select
				}

				let related = await targetModel.findMany(findArgs)

				// Handle nested includes
				if (related.length > 0 && entry.options.include) {
					const targetSchema = getSchemaForModel(entry.targetModel, ctx)
					if (targetSchema) {
						related = await resolveIncludesBatched(
							related as { id: string }[],
							entry.options.include,
							targetSchema,
							entry.targetModel,
							{ ...ctx, depth: ctx.depth + 1 }
						)
					}
				}

				;(result as Record<string, unknown>)[entry.field] = related
				break
			}

			case 'manyToMany': {
				// Get IDs through junction table
				const junctionDef = getJunctionTableDef(modelName, entry.targetModel)
				const junctionModel = ctx.getModel(junctionDef.name) as {
					findMany: (args: unknown) => Promise<Record<string, unknown>[]>
				} | undefined

				if (!junctionModel) {
					;(result as Record<string, unknown>)[entry.field] = []
					break
				}

				const { fkSource: fkSourceField, fkTarget: fkTargetField } = resolveJunctionFKs(junctionDef, modelName)

				const junctionEntries = await junctionModel.findMany({
					where: { [fkSourceField]: record.id }
				})

				const targetIds = junctionEntries.map(e => String(e[fkTargetField]))

				if (targetIds.length === 0) {
					;(result as Record<string, unknown>)[entry.field] = []
					break
				}

				// Fetch the actual related records
				const findArgs: Record<string, unknown> = {
					where: { id: { in: targetIds }, ...entry.options.where }
				}

				if (entry.options.orderBy) {
					findArgs.orderBy = entry.options.orderBy
				}
				if (entry.options.take !== undefined) {
					findArgs.take = entry.options.take
				}
				if (entry.options.skip !== undefined) {
					findArgs.skip = entry.options.skip
				}
				if (entry.options.select) {
					findArgs.select = entry.options.select
				}

				let related = await targetModel.findMany(findArgs)

				// Handle nested includes
				if (related.length > 0 && entry.options.include) {
					const targetSchema = getSchemaForModel(entry.targetModel, ctx)
					if (targetSchema) {
						related = await resolveIncludesBatched(
							related as { id: string }[],
							entry.options.include,
							targetSchema,
							entry.targetModel,
							{ ...ctx, depth: ctx.depth + 1 }
						)
					}
				}

				;(result as Record<string, unknown>)[entry.field] = related
				break
			}
		}
	}

	return result
}

/**
 * Resolve includes for multiple records with batching (N+1 prevention).
 *
 * @param records - Records to resolve includes for
 * @param includeClause - Include clause
 * @param schema - Model's normalized schema
 * @param modelName - Model name
 * @param ctx - Include context
 * @returns Records with resolved includes
 */
export async function resolveIncludesBatched<T extends { id: string }>(
	records: T[],
	includeClause: IncludeClause,
	schema: NormalizedSchema,
	modelName: string,
	ctx: IncludeContext
): Promise<(T & Record<string, unknown>)[]> {
	if (records.length === 0) {
		return []
	}

	if (ctx.depth >= MAX_INCLUDE_DEPTH) {
		throw new FlashcoreError(
			`Include depth limit (${MAX_INCLUDE_DEPTH}) exceeded. ` +
			`Reduce nesting or restructure your query.`
		)
	}

	const entries = parseIncludeClause(includeClause, schema)

	// Initialize result with copies of records
	const results = records.map(r => ({ ...r }) as T & Record<string, unknown>)

	for (const entry of entries) {
		const targetModel = ctx.getModel(entry.targetModel) as {
			findUnique: (args: unknown) => Promise<unknown | null>
			findMany: (args: unknown) => Promise<unknown[]>
		} | undefined

		if (!targetModel) {
			// Set default empty values
			for (const result of results) {
				;(result as Record<string, unknown>)[entry.field] = entry.type === 'hasMany' || entry.type === 'manyToMany'
					? []
					: null
			}
			continue
		}

		switch (entry.type) {
			case 'belongsTo': {
				// Collect all unique FK values
				const fkValues = new Set<string>()
				for (const record of records) {
					const fkValue = (record as Record<string, unknown>)[entry.foreignKey!]
					if (fkValue) {
						fkValues.add(String(fkValue))
					}
				}

				if (fkValues.size === 0) {
					for (const result of results) {
						;(result as Record<string, unknown>)[entry.field] = null
					}
					break
				}

				// Batch fetch all related records
				let relatedRecords = await targetModel.findMany({
					where: { id: { in: [...fkValues] } }
				}) as { id: string }[]

				// Handle nested includes
				if (relatedRecords.length > 0 && entry.options.include) {
					const targetSchema = getSchemaForModel(entry.targetModel, ctx)
					if (targetSchema) {
						relatedRecords = await resolveIncludesBatched(
							relatedRecords,
							entry.options.include,
							targetSchema,
							entry.targetModel,
							{ ...ctx, depth: ctx.depth + 1 }
						)
					}
				}

				// Build lookup map
				const relatedMap = new Map<string, unknown>()
				for (const related of relatedRecords) {
					relatedMap.set(related.id, related)
				}

				// Assign to results
				for (let i = 0; i < records.length; i++) {
					const fkValue = (records[i] as Record<string, unknown>)[entry.foreignKey!]
					;(results[i] as Record<string, unknown>)[entry.field] = fkValue ? relatedMap.get(String(fkValue)) ?? null : null
				}
				break
			}

			case 'hasOne':
			case 'hasMany': {
				// Collect all parent IDs
				const parentIds = records.map(r => r.id)

				// Batch fetch all related records
				const findArgs: Record<string, unknown> = {
					where: { [entry.foreignKey!]: { in: parentIds }, ...entry.options.where }
				}

				if (entry.options.orderBy) {
					findArgs.orderBy = entry.options.orderBy
				}
				if (entry.options.select) {
					findArgs.select = entry.options.select
				}

				let relatedRecords = await targetModel.findMany(findArgs) as { id: string; [key: string]: unknown }[]

				// Handle nested includes
				if (relatedRecords.length > 0 && entry.options.include) {
					const targetSchema = getSchemaForModel(entry.targetModel, ctx)
					if (targetSchema) {
						relatedRecords = await resolveIncludesBatched(
							relatedRecords as { id: string }[],
							entry.options.include,
							targetSchema,
							entry.targetModel,
							{ ...ctx, depth: ctx.depth + 1 }
						) as { id: string; [key: string]: unknown }[]
					}
				}

				// Group by parent ID
				const groupedByParent = new Map<string, unknown[]>()
				for (const related of relatedRecords) {
					const parentId = String(related[entry.foreignKey!])
					if (!groupedByParent.has(parentId)) {
						groupedByParent.set(parentId, [])
					}
					groupedByParent.get(parentId)!.push(related)
				}

				// Assign to results
				for (let i = 0; i < records.length; i++) {
					const parentId = records[i].id
					const related = groupedByParent.get(parentId) ?? []

					if (entry.type === 'hasOne') {
						;(results[i] as Record<string, unknown>)[entry.field] = related[0] ?? null
					} else {
						// Apply take/skip per parent
						let finalRelated = related
						if (entry.options.skip !== undefined) {
							finalRelated = finalRelated.slice(entry.options.skip)
						}
						if (entry.options.take !== undefined) {
							finalRelated = finalRelated.slice(0, entry.options.take)
						}
						;(results[i] as Record<string, unknown>)[entry.field] = finalRelated
					}
				}
				break
			}

			case 'manyToMany': {
				// Get junction table
				const junctionDef = getJunctionTableDef(modelName, entry.targetModel)
				const junctionModel = ctx.getModel(junctionDef.name) as {
					findMany: (args: unknown) => Promise<Record<string, unknown>[]>
				} | undefined

				if (!junctionModel) {
					for (const result of results) {
						;(result as Record<string, unknown>)[entry.field] = []
					}
					break
				}

				const { fkSource: fkSourceField, fkTarget: fkTargetField } = resolveJunctionFKs(junctionDef, modelName)

				// Batch fetch all junction entries
				const parentIds = records.map(r => r.id)
				const junctionEntries = await junctionModel.findMany({
					where: { [fkSourceField]: { in: parentIds } }
				})

				// Collect all target IDs and group by parent
				const allTargetIds = new Set<string>()
				const targetIdsByParent = new Map<string, string[]>()

				for (const entry of junctionEntries) {
					const parentId = String(entry[fkSourceField])
					const targetId = String(entry[fkTargetField])

					allTargetIds.add(targetId)

					if (!targetIdsByParent.has(parentId)) {
						targetIdsByParent.set(parentId, [])
					}
					targetIdsByParent.get(parentId)!.push(targetId)
				}

				if (allTargetIds.size === 0) {
					for (const result of results) {
						;(result as Record<string, unknown>)[entry.field] = []
					}
					break
				}

				// Batch fetch all target records
				const findArgs: Record<string, unknown> = {
					where: { id: { in: [...allTargetIds] }, ...entry.options.where }
				}

				if (entry.options.orderBy) {
					findArgs.orderBy = entry.options.orderBy
				}
				if (entry.options.select) {
					findArgs.select = entry.options.select
				}

				let targetRecords = await targetModel.findMany(findArgs) as { id: string }[]

				// Handle nested includes
				if (targetRecords.length > 0 && entry.options.include) {
					const targetSchema = getSchemaForModel(entry.targetModel, ctx)
					if (targetSchema) {
						targetRecords = await resolveIncludesBatched(
							targetRecords,
							entry.options.include,
							targetSchema,
							entry.targetModel,
							{ ...ctx, depth: ctx.depth + 1 }
						)
					}
				}

				// Build target lookup
				const targetMap = new Map<string, unknown>()
				for (const target of targetRecords) {
					targetMap.set(target.id, target)
				}

				// Assign to results
				for (let i = 0; i < records.length; i++) {
					const parentId = records[i].id
					const targetIds = targetIdsByParent.get(parentId) ?? []

					let related = targetIds
						.map(id => targetMap.get(id))
						.filter((r): r is unknown => r !== undefined)

					// Apply take/skip
					if (entry.options.skip !== undefined) {
						related = related.slice(entry.options.skip)
					}
					if (entry.options.take !== undefined) {
						related = related.slice(0, entry.options.take)
					}

					;(results[i] as Record<string, unknown>)[entry.field] = related
				}
				break
			}
		}
	}

	return results
}

/**
 * Helper to get schema for a model from context.
 * This is a placeholder - actual implementation will use the model registry.
 */
function getSchemaForModel(modelName: string, ctx: IncludeContext): NormalizedSchema | undefined {
	const model = ctx.getModel(modelName) as { schema?: NormalizedSchema } | undefined
	return model?.schema
}

/**
 * Check if an include clause has any entries.
 */
export function hasIncludes(includeClause?: IncludeClause): boolean {
	if (!includeClause) return false
	return Object.keys(includeClause).length > 0
}

/**
 * Count the depth of nested includes.
 */
export function countIncludeDepth(includeClause: IncludeClause, current = 0): number {
	let maxDepth = current

	for (const value of Object.values(includeClause)) {
		if (typeof value === 'object' && value !== null && 'include' in value) {
			const nestedDepth = countIncludeDepth(value.include as IncludeClause, current + 1)
			maxDepth = Math.max(maxDepth, nestedDepth)
		}
	}

	return maxDepth
}
