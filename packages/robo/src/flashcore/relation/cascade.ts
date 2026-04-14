/**
 * Flashcore v1 (spec rev 4.3) Cascade Operations
 *
 * Handles cascade delete, setNull, and restrict operations for relations.
 */

import type { NormalizedSchema, RelationDef } from '../schema/types.js'
import type { CascadeOp } from './types.js'
import { MAX_CASCADE_DEPTH, JUNCTION_PREFIX } from '../core/constants.js'
import { FlashcoreError } from '../core/errors.js'
import { getJunctionTableDef, parseJunctionModelName, resolveJunctionFKs, bulkDeleteByFK } from './junction.js'

/**
 * Context for cascade operations.
 */
export interface CascadeContext {
	/**
	 * Function to get a model instance by name.
	 */
	getModel: (name: string) => unknown | undefined

	/**
	 * Function to get a model's schema by name.
	 */
	getSchema: (name: string) => NormalizedSchema | undefined

	/**
	 * Function to find registered junction models.
	 */
	getJunctionModels?: () => string[]
}

/**
 * Collect all cascade operations for a delete.
 * Operations are collected depth-first to ensure proper ordering.
 *
 * @param modelName - Model being deleted from
 * @param schema - Model's normalized schema
 * @param record - Record being deleted
 * @param ctx - Cascade context
 * @param depth - Current depth in the cascade tree
 * @returns Array of cascade operations to execute
 */
export async function collectCascadeOperations(
	modelName: string,
	schema: NormalizedSchema,
	record: { id: string; [key: string]: unknown },
	ctx: CascadeContext,
	depth = 0
): Promise<CascadeOp[]> {
	if (depth >= MAX_CASCADE_DEPTH) {
		throw new FlashcoreError(
			`Cascade depth limit (${MAX_CASCADE_DEPTH}) exceeded when deleting ` +
			`'${modelName}:${record.id}'. Check for circular relations or reduce cascade chain.`
		)
	}

	const ops: CascadeOp[] = []

	// Handle manyToMany junction tables
	for (const [, relation] of schema.relations) {
		if (relation.type === 'manyToMany') {
			const junctionDef = getJunctionTableDef(modelName, relation.model)
			const { fkSource: fkField } = resolveJunctionFKs(junctionDef, modelName)

			ops.push({
				type: 'junction',
				junctionModel: junctionDef.name,
				foreignKey: fkField,
				depth
			})
		}
	}

	// Handle hasMany/hasOne relations
	for (const [, relation] of schema.relations) {
		if (relation.type !== 'hasMany' && relation.type !== 'hasOne') {
			continue
		}

		if (!relation.foreignKey) {
			continue
		}

		// 'restrict' is handled separately (before any cascade starts)
		if (relation.onDelete === 'restrict') {
			continue
		}

		const targetModel = ctx.getModel(relation.model) as {
			findMany: (args: unknown) => Promise<{ id: string; [key: string]: unknown }[]>
		} | undefined

		if (!targetModel) {
			continue
		}

		// Find all child records
		const children = await targetModel.findMany({
			where: { [relation.foreignKey]: record.id }
		})

		for (const child of children) {
			ops.push({
				type: 'relation',
				model: relation.model,
				id: child.id,
				foreignKey: relation.foreignKey,
				action: relation.onDelete === 'cascade' ? 'cascade' : 'setNull',
				depth
			})

			// Recursively collect cascades for cascade deletes
			if (relation.onDelete === 'cascade') {
				const childSchema = ctx.getSchema(relation.model)
				if (childSchema) {
					const childCascades = await collectCascadeOperations(
						relation.model,
						childSchema,
						child,
						ctx,
						depth + 1
					)
					ops.push(...childCascades)
				}
			}
		}
	}

	return ops
}

/**
 * Get all relations with restrict policy for a model.
 *
 * @param schema - Model's normalized schema
 * @returns Array of relation definitions with restrict policy
 */
export function getRestrictRelations(schema: NormalizedSchema): RelationDef[] {
	const relations: RelationDef[] = []

	for (const relation of schema.relations.values()) {
		if (
			(relation.type === 'hasMany' || relation.type === 'hasOne') &&
			relation.onDelete === 'restrict'
		) {
			relations.push(relation)
		}
	}

	return relations
}

/**
 * Check if delete should be blocked due to restrict policy.
 *
 * @param modelName - Model being deleted from
 * @param schema - Model's normalized schema
 * @param record - Record being deleted
 * @param ctx - Cascade context
 * @throws FlashcoreError if delete is blocked
 */
export async function checkRestrictConstraints(
	modelName: string,
	schema: NormalizedSchema,
	record: { id: string; [key: string]: unknown },
	ctx: CascadeContext
): Promise<void> {
	const restrictRelations = getRestrictRelations(schema)

	for (const relation of restrictRelations) {
		if (!relation.foreignKey) continue

		const targetModel = ctx.getModel(relation.model) as {
			count: (args: unknown) => Promise<number>
		} | undefined

		if (!targetModel) continue

		const count = await targetModel.count({
			where: { [relation.foreignKey]: record.id }
		})

		if (count > 0) {
			throw new FlashcoreError(
				`Cannot delete ${modelName}:${record.id} - ` +
				`${count} related ${relation.model} record(s) exist (onDelete: 'restrict'). ` +
				`Delete or reassign the related records first.`
			)
		}
	}
}

/**
 * Execute collected cascade operations.
 * Operations are executed in the correct order:
 * 1. Junction table deletions first
 * 2. setNull operations
 * 3. Cascade deletes (deepest first)
 *
 * @param ops - Collected cascade operations
 * @param parentId - Parent record ID
 * @param ctx - Cascade context
 */
export async function executeCascadeOperations(
	ops: CascadeOp[],
	parentId: string,
	ctx: CascadeContext
): Promise<void> {
	// 1. Process junction table deletions first
	const junctionOps = ops.filter(op => op.type === 'junction')
	for (const op of junctionOps) {
		const junctionModel = ctx.getModel(op.junctionModel!) as {
			deleteMany?: (args: unknown) => Promise<{ count: number }>
			findMany?: (args: unknown) => Promise<Array<{ id: string } | Record<string, unknown>>>
			delete?: (args: unknown) => Promise<unknown>
		} | undefined

		if (junctionModel) {
			await bulkDeleteByFK(junctionModel, op.foreignKey, parentId)
		}
	}

	// 2. Process setNull operations
	const setNullOps = ops.filter(op => op.action === 'setNull')
	for (const op of setNullOps) {
		const model = ctx.getModel(op.model!) as {
			update: (args: unknown) => Promise<unknown>
		} | undefined

		if (model && op.id) {
			await model.update({
				where: { id: op.id },
				data: { [op.foreignKey]: null }
			})
		}
	}

	// 3. Process cascade deletes (deepest first)
	const cascadeDeletes = ops
		.filter(op => op.action === 'cascade' && op.type === 'relation')
		.sort((a, b) => b.depth - a.depth) // Deepest first

	for (const op of cascadeDeletes) {
		const model = ctx.getModel(op.model!) as {
			delete: (args: unknown) => Promise<unknown>
		} | undefined

		if (model && op.id) {
			// Use a simple delete without cascades (already collected)
			await model.delete({ where: { id: op.id } })
		}
	}
}

/**
 * Check if a model has any relations that require cascade handling.
 */
export function hasCascadeRelations(schema: NormalizedSchema): boolean {
	for (const relation of schema.relations.values()) {
		if (relation.type === 'hasMany' || relation.type === 'hasOne') {
			return true
		}
		if (relation.type === 'manyToMany') {
			return true
		}
	}
	return false
}

/**
 * Get junction models for a given model from the registry.
 */
export function findJunctionModelsForModel(
	modelName: string,
	registeredModels: string[]
): string[] {
	const junctionModels: string[] = []

	for (const name of registeredModels) {
		if (!name.startsWith(JUNCTION_PREFIX)) continue

		const parsed = parseJunctionModelName(name)
		if (parsed && (parsed[0] === modelName || parsed[1] === modelName)) {
			junctionModels.push(name)
		}
	}

	return junctionModels
}
