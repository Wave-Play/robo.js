/**
 * Flashcore v1 (spec rev 4.3) Schema Metadata Manager
 *
 * Manages persistence of schema metadata for drift detection and history tracking.
 */

import type { FlashcoreAdapter } from 'robo.js/flashcore'
import type { NormalizedSchema } from 'robo.js/flashcore'
import { buildModelKey, buildSchemaKey } from 'robo.js/flashcore'
import type {
	SchemaMetadata,
	SchemaSnapshot,
	FieldMetadata,
	RelationMetadata
} from './types.js'
import { normalizedFieldToMetadata as fieldToMeta } from './types.js'

/**
 * Manager for schema metadata persistence.
 *
 * Handles:
 * - Per-model schema metadata storage and retrieval
 * - Namespace-level schema snapshots
 * - Conversion between runtime and storage formats
 */
export class SchemaMetadataManager {
	constructor(private readonly adapter: FlashcoreAdapter) {}

	// =========================================================================
	// Model-Level Metadata
	// =========================================================================

	/**
	 * Get schema metadata for a model.
	 *
	 * @param modelName - Model name
	 * @param namespace - Optional namespace
	 * @returns Schema metadata or null if not found
	 */
	async getModelMetadata(
		modelName: string,
		namespace?: string
	): Promise<SchemaMetadata | null> {
		const key = buildModelKey(modelName, '_meta', namespace)
		const data = await this.adapter.get(key)

		if (!data) {
			return null
		}

		// Parse and validate
		return this.parseSchemaMetadata(data)
	}

	/**
	 * Store schema metadata for a model.
	 *
	 * @param modelName - Model name
	 * @param metadata - Schema metadata to store
	 * @param namespace - Optional namespace
	 */
	async setModelMetadata(
		modelName: string,
		metadata: SchemaMetadata,
		namespace?: string
	): Promise<void> {
		const key = buildModelKey(modelName, '_meta', namespace)
		await this.adapter.set(key, metadata)
	}

	/**
	 * Delete schema metadata for a model.
	 *
	 * @param modelName - Model name
	 * @param namespace - Optional namespace
	 */
	async deleteModelMetadata(
		modelName: string,
		namespace?: string
	): Promise<void> {
		const key = buildModelKey(modelName, '_meta', namespace)
		await this.adapter.delete(key)
	}

	/**
	 * Check if schema metadata exists for a model.
	 *
	 * @param modelName - Model name
	 * @param namespace - Optional namespace
	 */
	async hasModelMetadata(
		modelName: string,
		namespace?: string
	): Promise<boolean> {
		const key = buildModelKey(modelName, '_meta', namespace)
		return this.adapter.has(key)
	}

	// =========================================================================
	// Namespace-Level Snapshots
	// =========================================================================

	/**
	 * Get the schema snapshot for a namespace.
	 *
	 * @param namespace - Namespace name (undefined for default)
	 * @returns Schema snapshot or null if not found
	 */
	async getSnapshot(namespace?: string): Promise<SchemaSnapshot | null> {
		const key = buildSchemaKey(namespace)
		const data = await this.adapter.get(key)

		if (!data) {
			return null
		}

		return this.parseSchemaSnapshot(data)
	}

	/**
	 * Store a schema snapshot for a namespace.
	 *
	 * @param snapshot - Schema snapshot to store
	 * @param namespace - Namespace name (undefined for default)
	 */
	async setSnapshot(
		snapshot: SchemaSnapshot,
		namespace?: string
	): Promise<void> {
		const key = buildSchemaKey(namespace)
		await this.adapter.set(key, snapshot)
	}

	/**
	 * Delete the schema snapshot for a namespace.
	 *
	 * @param namespace - Namespace name (undefined for default)
	 */
	async deleteSnapshot(namespace?: string): Promise<void> {
		const key = buildSchemaKey(namespace)
		await this.adapter.delete(key)
	}

	// =========================================================================
	// Conversion Helpers
	// =========================================================================

	/**
	 * Convert a NormalizedSchema to SchemaMetadata for storage.
	 *
	 * @param schema - Normalized schema from a model
	 * @param version - Version number (default 1 for new)
	 * @param migrationHistory - List of applied migrations
	 * @returns Schema metadata ready for storage
	 */
	static schemaToMetadata(
		schema: NormalizedSchema,
		version = 1,
		migrationHistory: string[] = []
	): SchemaMetadata {
		// Convert fields
		const fields: Record<string, FieldMetadata> = {}
		for (const [name, field] of schema.fields) {
			fields[name] = fieldToMeta(field)
		}

		// Convert relations
		const relations: Record<string, RelationMetadata> = {}
		for (const [name, relation] of schema.relations) {
			relations[name] = {
				type: relation.type,
				model: relation.model,
				foreignKey: relation.foreignKey,
				onDelete: relation.onDelete
			}
		}

		return {
			version,
			checksum: schema.checksum,
			fields,
			relations,
			migratedAt: new Date().toISOString(),
			migrationHistory
		}
	}

	/**
	 * Create initial metadata for a new model.
	 *
	 * @param schema - Normalized schema
	 * @returns Initial schema metadata
	 */
	static createInitialMetadata(schema: NormalizedSchema): SchemaMetadata {
		return SchemaMetadataManager.schemaToMetadata(schema, 1, [])
	}

	/**
	 * Create updated metadata after a schema change.
	 *
	 * @param schema - New normalized schema
	 * @param previous - Previous schema metadata
	 * @param migrationName - Optional migration name if applied by migration
	 * @returns Updated schema metadata
	 */
	static createUpdatedMetadata(
		schema: NormalizedSchema,
		previous: SchemaMetadata,
		migrationName?: string
	): SchemaMetadata {
		const history = [...previous.migrationHistory]
		if (migrationName) {
			history.push(migrationName)
		}

		return SchemaMetadataManager.schemaToMetadata(
			schema,
			previous.version + 1,
			history
		)
	}

	/**
	 * Compute a combined checksum for multiple models.
	 *
	 * Used for namespace-level snapshot checksums.
	 *
	 * @param models - Map of model name to schema metadata
	 * @returns Combined checksum string
	 */
	static computeCombinedChecksum(models: Record<string, SchemaMetadata>): string {
		// Sort model names for deterministic order
		const sortedNames = Object.keys(models).sort()

		// Combine all checksums
		const combined = sortedNames
			.map(name => `${name}:${models[name].checksum}`)
			.join('|')

		// FNV-1a hash of combined string
		let hash = 0x811c9dc5
		for (let i = 0; i < combined.length; i++) {
			hash ^= combined.charCodeAt(i)
			hash = Math.imul(hash, 0x01000193)
		}

		return (hash >>> 0).toString(16).padStart(8, '0')
	}

	/**
	 * Create a schema snapshot from multiple models.
	 *
	 * @param models - Map of model name to schema metadata
	 * @param namespace - Namespace name
	 * @param version - Snapshot version
	 * @returns Schema snapshot
	 */
	static createSnapshot(
		models: Record<string, SchemaMetadata>,
		namespace: string,
		version: number
	): SchemaSnapshot {
		return {
			version,
			namespace,
			models,
			checksum: SchemaMetadataManager.computeCombinedChecksum(models),
			createdAt: new Date().toISOString()
		}
	}

	// =========================================================================
	// Parsing Helpers
	// =========================================================================

	/**
	 * Parse and validate schema metadata from storage.
	 */
	private parseSchemaMetadata(data: unknown): SchemaMetadata | null {
		if (!data || typeof data !== 'object') {
			return null
		}

		const obj = data as Record<string, unknown>

		// Validate required fields
		if (
			typeof obj.version !== 'number' ||
			typeof obj.checksum !== 'string' ||
			!obj.fields ||
			typeof obj.fields !== 'object'
		) {
			return null
		}

		return {
			version: obj.version as number,
			checksum: obj.checksum as string,
			fields: obj.fields as Record<string, FieldMetadata>,
			relations: (obj.relations as Record<string, RelationMetadata>) || {},
			migratedAt: (obj.migratedAt as string) || new Date().toISOString(),
			migrationHistory: Array.isArray(obj.migrationHistory)
				? (obj.migrationHistory as string[])
				: []
		}
	}

	/**
	 * Parse and validate schema snapshot from storage.
	 */
	private parseSchemaSnapshot(data: unknown): SchemaSnapshot | null {
		if (!data || typeof data !== 'object') {
			return null
		}

		const obj = data as Record<string, unknown>

		// Validate required fields
		if (
			typeof obj.version !== 'number' ||
			typeof obj.namespace !== 'string' ||
			typeof obj.checksum !== 'string' ||
			!obj.models ||
			typeof obj.models !== 'object'
		) {
			return null
		}

		return {
			version: obj.version as number,
			namespace: obj.namespace as string,
			models: obj.models as Record<string, SchemaMetadata>,
			checksum: obj.checksum as string,
			createdAt: (obj.createdAt as string) || new Date().toISOString()
		}
	}
}
