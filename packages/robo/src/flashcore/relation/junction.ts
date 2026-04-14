/**
 * Flashcore v1 (spec rev 4.3) Junction Table Manager
 *
 * Manages many-to-many relationships through auto-generated junction tables.
 */

import type { FlashcoreAdapter } from '../adapter/types.js'
import { scanKeysToArray } from '../adapter/scan.js'
import type { SchemaFields } from '../schema/types.js'
import type { JunctionTableDef } from './types.js'
import { JUNCTION_PREFIX } from '../core/constants.js'
import { f, compoundUnique } from '../schema/field.js'
import { FeatureNotSupportedError, FlashcoreError, UniqueConstraintError, ValidationError } from '../core/errors.js'

function getJunctionForeignKeys(modelA: string, modelB: string): { fkA: string; fkB: string } {
	const fkBase = (name: string) =>
		`${name.charAt(0).toLowerCase()}${name.slice(1)}Id`

	// Self-referential many-to-many needs distinct FK field names.
	// We use a deterministic A/B suffix for stability.
	if (modelA === modelB) {
		return {
			fkA: `${fkBase(modelA)}A`,
			fkB: `${fkBase(modelB)}B`
		}
	}

	return {
		fkA: fkBase(modelA),
		fkB: fkBase(modelB)
	}
}

/**
 * Get deterministic junction model name for two models.
 * Models are sorted alphabetically to ensure consistent naming.
 *
 * @param modelA - First model name
 * @param modelB - Second model name
 * @returns Junction model name
 */
export function getJunctionModelName(modelA: string, modelB: string): string {
	const sorted = [modelA, modelB].sort()
	return `${JUNCTION_PREFIX}${sorted[0]}_${sorted[1]}`
}

/**
 * Check if a model name is a junction table.
 *
 * @param modelName - Model name to check
 * @returns True if the model is a junction table
 */
export function isJunctionModel(modelName: string): boolean {
	return modelName.startsWith(JUNCTION_PREFIX)
}

/**
 * Parse junction model name to extract the two related models.
 *
 * @param junctionName - Junction model name
 * @returns Tuple of [modelA, modelB] or null if not a junction
 */
export function parseJunctionModelName(junctionName: string): [string, string] | null {
	if (!junctionName.startsWith(JUNCTION_PREFIX)) {
		return null
	}

	const suffix = junctionName.slice(JUNCTION_PREFIX.length)
	const parts = suffix.split('_')

	if (parts.length !== 2) {
		return null
	}

	return [parts[0], parts[1]]
}

/**
 * Create the schema definition for a junction table.
 *
 * @param modelA - First model name (alphabetically)
 * @param modelB - Second model name
 * @returns Junction table schema fields
 */
export function createJunctionSchema(modelA: string, modelB: string): SchemaFields {
	const { fkA, fkB } = getJunctionForeignKeys(modelA, modelB)

	return {
		id: f.id(),
		[fkA]: f.string().indexed(),
		[fkB]: f.string().indexed(),
		createdAt: f.date().default(() => new Date()),
		// Compound unique constraint prevents duplicate relationships
		_compound: compoundUnique([fkA, fkB])
	}
}

/**
 * Get compound unique constraint for a junction schema.
 */
export function getJunctionCompoundUnique(modelA: string, modelB: string) {
	const { fkA, fkB } = getJunctionForeignKeys(modelA, modelB)
	return compoundUnique([fkA, fkB])
}

/**
 * Resolve which FK field is the source and which is the target,
 * given a junction table definition and the source model name.
 */
export function resolveJunctionFKs(
	junctionDef: JunctionTableDef,
	sourceModel: string
): { fkSource: string; fkTarget: string } {
	const isSourceA = junctionDef.modelA === sourceModel
	return {
		fkSource: isSourceA ? junctionDef.foreignKeyA : junctionDef.foreignKeyB,
		fkTarget: isSourceA ? junctionDef.foreignKeyB : junctionDef.foreignKeyA
	}
}

/**
 * Delete all junction entries matching a foreign key value.
 * Prefers deleteMany, falls back to findMany + per-record delete.
 *
 * @returns Number of entries deleted
 */
export async function bulkDeleteByFK(
	model: {
		deleteMany?: (args: unknown) => Promise<{ count: number }>
		findMany?: (args: unknown) => Promise<Array<{ id: string } | Record<string, unknown>>>
		delete?: (args: unknown) => Promise<unknown>
	},
	fkField: string,
	fkValue: string
): Promise<number> {
	try {
		if (typeof model.deleteMany === 'function') {
			const result = await model.deleteMany({ where: { [fkField]: fkValue } })
			return result.count
		}
	} catch {
		// Fall back to per-record deletion below.
	}

	if (typeof model.findMany === 'function' && typeof model.delete === 'function') {
		const entries = await model.findMany({ where: { [fkField]: fkValue } })
		let count = 0
		for (const entry of entries) {
			const id = (entry as { id?: unknown }).id
			if (typeof id === 'string') {
				await model.delete({ where: { id } })
				count++
			}
		}
		return count
	}

	return 0
}

/**
 * Get junction table definition for a many-to-many relation.
 *
 * @param sourceModel - Source model name
 * @param targetModel - Target model name
 * @returns Junction table definition
 */
export function getJunctionTableDef(sourceModel: string, targetModel: string): JunctionTableDef {
	const sorted = [sourceModel, targetModel].sort()
	const [modelA, modelB] = sorted
	const { fkA, fkB } = getJunctionForeignKeys(modelA, modelB)

	return {
		name: getJunctionModelName(modelA, modelB),
		modelA,
		modelB,
		foreignKeyA: fkA,
		foreignKeyB: fkB
	}
}

/**
 * Junction table manager for many-to-many relationships.
 *
 * Provides methods to add, remove, and query junction table entries.
 */
export class JunctionTableManager {
	private readonly adapter: FlashcoreAdapter
	private readonly getModel: (name: string) => unknown | undefined

	constructor(adapter: FlashcoreAdapter, getModel: (name: string) => unknown | undefined) {
		this.adapter = adapter
		this.getModel = getModel
	}

	private getNamespaceForModel(modelName: string): string | undefined {
		const model = this.getModel(modelName) as { namespace?: string } | undefined
		return model?.namespace
	}

	private async ensureExists(modelName: string, recordId: string): Promise<void> {
		const model = this.getModel(modelName) as {
			findUnique: (args: { where: { id: string } }) => Promise<unknown | null>
		} | undefined

		if (!model) {
			throw new FlashcoreError(`Model '${modelName}' not registered.`)
		}

		const record = await model.findUnique({ where: { id: recordId } })
		if (!record) {
			throw new ValidationError(
				`Foreign key constraint failed: '${modelName}' record with id '${recordId}' does not exist.`,
				{ field: 'id', value: recordId }
			)
		}
	}

	/**
	 * Add a relationship between two records.
	 * Uses compound unique constraint to prevent duplicates.
	 *
	 * @param sourceModel - Source model name
	 * @param sourceId - Source record ID
	 * @param targetModel - Target model name
	 * @param targetId - Target record ID
	 * @throws UniqueConstraintError if relationship already exists
	 */
	async addRelation(
		sourceModel: string,
		sourceId: string,
		targetModel: string,
		targetId: string
	): Promise<void> {
		// Referential integrity: ensure both records exist before inserting into junction.
		await Promise.all([
			this.ensureExists(sourceModel, sourceId),
			this.ensureExists(targetModel, targetId)
		])

		const junctionDef = getJunctionTableDef(sourceModel, targetModel)
		const junctionModel = this.getModel(junctionDef.name) as {
			findFirst: (args: unknown) => Promise<unknown>
			create: (data: unknown) => Promise<unknown>
		} | undefined

		if (!junctionModel) {
			throw new FlashcoreError(
				`Junction model '${junctionDef.name}' not registered. ` +
				`Ensure manyToMany relation is properly configured.`
			)
		}

		// Determine which FK is which based on model names
		const { fkSource: fkSourceField, fkTarget: fkTargetField } = resolveJunctionFKs(junctionDef, sourceModel)

		// Check for existing relationship
		const existing = await junctionModel.findFirst({
			where: {
				[fkSourceField]: sourceId,
				[fkTargetField]: targetId
			}
		})

		if (existing) {
			throw new UniqueConstraintError(
				`Relation already exists: ${sourceModel}:${sourceId} <-> ${targetModel}:${targetId}`,
				{
					model: junctionDef.name,
					field: `[${fkSourceField}, ${fkTargetField}]`,
					value: `[${sourceId}, ${targetId}]`
				}
			)
		}

		// Create junction entry
		await junctionModel.create({
			[fkSourceField]: sourceId,
			[fkTargetField]: targetId
		})
	}

	/**
	 * Remove a relationship between two records.
	 *
	 * @param sourceModel - Source model name
	 * @param sourceId - Source record ID
	 * @param targetModel - Target model name
	 * @param targetId - Target record ID
	 * @returns True if relationship was removed, false if it didn't exist
	 */
	async removeRelation(
		sourceModel: string,
		sourceId: string,
		targetModel: string,
		targetId: string
	): Promise<boolean> {
		const junctionDef = getJunctionTableDef(sourceModel, targetModel)
		const junctionModel = this.getModel(junctionDef.name) as {
			findFirst: (args: unknown) => Promise<{ id: string } | null>
			delete: (args: unknown) => Promise<unknown>
		} | undefined

		if (!junctionModel) {
			return false
		}

		const { fkSource: fkSourceField, fkTarget: fkTargetField } = resolveJunctionFKs(junctionDef, sourceModel)

		// Find the junction entry
		const existing = await junctionModel.findFirst({
			where: {
				[fkSourceField]: sourceId,
				[fkTargetField]: targetId
			}
		})

		if (!existing) {
			return false
		}

		// Delete the junction entry
		await junctionModel.delete({ where: { id: existing.id } })
		return true
	}

	/**
	 * Remove all relationships for a record (used in cascade delete).
	 *
	 * @param model - Model name
	 * @param recordId - Record ID
	 * @returns Number of relationships removed
	 */
	async removeAllRelations(model: string, recordId: string): Promise<number> {
		if (typeof this.adapter.scan !== 'function') {
			throw new FeatureNotSupportedError(
				'removeAllRelations requires adapter.scan to discover junction models.',
				{ feature: 'scan', requiredCapability: 'scan' }
			)
		}

		// Find all junction models that involve this model
		const junctionModels = await this.findJunctionModelsFor(model)
		let count = 0

		for (const junctionName of junctionModels) {
			const junctionModel = this.getModel(junctionName) as {
				deleteMany?: (args: unknown) => Promise<{ count: number }>
				findMany?: (args: unknown) => Promise<Array<{ id: string } | Record<string, unknown>>>
				delete?: (args: unknown) => Promise<unknown>
			} | undefined

			if (!junctionModel) continue

			const parsed = parseJunctionModelName(junctionName)
			if (!parsed) continue

			const [modelA, modelB] = parsed
			if (modelA !== model && modelB !== model) continue

			const junctionDef = getJunctionTableDef(modelA, modelB)
			const { fkSource: fkField } = resolveJunctionFKs(junctionDef, model)

			count += await bulkDeleteByFK(junctionModel, fkField, recordId)
		}

		return count
	}

	/**
	 * Get all related IDs through a junction table.
	 *
	 * @param sourceModel - Source model name
	 * @param sourceId - Source record ID
	 * @param targetModel - Target model name
	 * @returns Array of related record IDs
	 */
	async getRelatedIds(
		sourceModel: string,
		sourceId: string,
		targetModel: string
	): Promise<string[]> {
		const junctionDef = getJunctionTableDef(sourceModel, targetModel)
		const junctionModel = this.getModel(junctionDef.name) as {
			findMany: (args: unknown) => Promise<Record<string, unknown>[]>
		} | undefined

		if (!junctionModel) {
			return []
		}

		const { fkSource: fkSourceField, fkTarget: fkTargetField } = resolveJunctionFKs(junctionDef, sourceModel)

		const entries = await junctionModel.findMany({
			where: { [fkSourceField]: sourceId }
		})

		return entries.map(entry => String(entry[fkTargetField]))
	}

	/**
	 * Set relationships to exactly the given IDs (replaces existing).
	 *
	 * @param sourceModel - Source model name
	 * @param sourceId - Source record ID
	 * @param targetModel - Target model name
	 * @param targetIds - Array of target record IDs
	 */
	async setRelations(
		sourceModel: string,
		sourceId: string,
		targetModel: string,
		targetIds: string[]
	): Promise<void> {
		// Referential integrity: ensure both source and all targets exist.
		await this.ensureExists(sourceModel, sourceId)
		await Promise.all(targetIds.map(id => this.ensureExists(targetModel, id)))

		const junctionDef = getJunctionTableDef(sourceModel, targetModel)
		const junctionModel = this.getModel(junctionDef.name) as {
			findMany: (args: unknown) => Promise<{ id: string; [key: string]: unknown }[]>
			delete: (args: unknown) => Promise<unknown>
			create: (data: unknown) => Promise<unknown>
		} | undefined

		if (!junctionModel) {
			throw new FlashcoreError(
				`Junction model '${junctionDef.name}' not registered.`
			)
		}

		const { fkSource: fkSourceField, fkTarget: fkTargetField } = resolveJunctionFKs(junctionDef, sourceModel)

		// Get current relations
		const existing = await junctionModel.findMany({
			where: { [fkSourceField]: sourceId }
		})

		const existingIds = new Set(existing.map(e => String(e[fkTargetField])))
		const newIds = new Set(targetIds)

		// Remove relations not in the new set
		for (const entry of existing) {
			const targetId = String(entry[fkTargetField])
			if (!newIds.has(targetId)) {
				await junctionModel.delete({ where: { id: entry.id } })
			}
		}

		// Add new relations not in the existing set
		for (const targetId of targetIds) {
			if (!existingIds.has(targetId)) {
				await junctionModel.create({
					[fkSourceField]: sourceId,
					[fkTargetField]: targetId
				})
			}
		}
	}

	/**
	 * Find all junction models that involve a specific model.
	 * This is a helper for cascade delete operations.
	 *
	 * Note: In a full implementation, this would scan registered models.
	 * For now, it returns an empty array - actual implementation will
	 * be integrated with the model registry in system.ts.
	 */
	private async findJunctionModelsFor(model: string): Promise<string[]> {
		const namespace = this.getNamespaceForModel(model)
		if (namespace === undefined && !this.getModel(model)) {
			throw new FlashcoreError(`Model '${model}' not registered.`)
		}

		const prefix = namespace
			? `_model:${namespace}::${JUNCTION_PREFIX}`
			: `_model:${JUNCTION_PREFIX}`

		const keys = await scanKeysToArray(this.adapter, prefix)
		const basePrefix = namespace ? `_model:${namespace}::` : '_model:'

		// scanKeysToArray yields *all keys* with this prefix (catalog/chunks/indexes/etc).
		// Extract the model name segment and de-dupe.
		const models = new Set<string>()
		for (const key of keys as unknown as string[]) {
			if (!key.startsWith(basePrefix)) continue
			const rest = key.slice(basePrefix.length)
			const colon = rest.indexOf(':')
			if (colon === -1) continue
			const modelName = rest.slice(0, colon)
			if (modelName.startsWith(JUNCTION_PREFIX)) {
				models.add(modelName)
			}
		}

		return Array.from(models)
	}
}
