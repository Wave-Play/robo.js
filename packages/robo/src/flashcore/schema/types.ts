/**
 * Flashcore v1 (spec rev 4.3) Schema Types
 *
 * Type definitions for schema fields, models, and inference helpers.
 */

/**
 * Supported field types.
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'json' | 'enum'

/**
 * Relation types for model relationships.
 */
export type RelationType = 'belongsTo' | 'hasOne' | 'hasMany' | 'manyToMany'

/**
 * Delete behavior for relations.
 */
export type OnDeleteAction = 'restrict' | 'cascade' | 'setNull'

/**
 * Internal field definition structure.
 */
export interface FieldDef {
	type: FieldType
	optional: boolean
	unique: boolean
	indexed: boolean
	indexTypes: string[]
	primaryKey: boolean
	version: boolean
	default?: unknown | (() => unknown)
	hasDefault: boolean
	enumValues?: string[]
}

/**
 * Internal relation field definition.
 */
export interface RelationDef {
	type: RelationType
	model: string
	foreignKey?: string
	onDelete: OnDeleteAction
}

/**
 * Compound unique constraint definition.
 */
export interface CompoundUniqueConstraint {
	_type: 'compoundUnique'
	fields: string[]
}

/**
 * Schema field (either a Field or RelationField).
 */
export interface SchemaField {
	_def: FieldDef | RelationDef
	_isRelation?: boolean
}

/**
 * Schema fields object (model schema definition).
 */
export type SchemaFields = Record<string, SchemaField | CompoundUniqueConstraint>

/**
 * Model options for registration.
 */
export interface ModelOptions {
	namespace?: string
	methods?: Record<string, (...args: unknown[]) => unknown>
	hooks?: ModelHooks
}

/**
 * Model hooks for lifecycle events.
 */
export interface ModelHooks<T = unknown> {
	beforeCreate?: (data: unknown) => unknown | Promise<unknown>
	afterCreate?: (record: T) => void | Promise<void>
	beforeUpdate?: (data: unknown, existing: T) => unknown | Promise<unknown>
	afterUpdate?: (record: T) => void | Promise<void>
	beforeDelete?: (record: T) => void | Promise<void>
	afterDelete?: (record: T) => void | Promise<void>
}

/**
 * Normalized schema for internal use.
 */
export interface NormalizedSchema {
	fields: Map<string, NormalizedField>
	primaryKey: string
	uniqueFields: string[]
	indexedFields: string[]
	requiredFields: string[]
	optionalFields: string[]
	defaultFields: Map<string, unknown | (() => unknown)>
	relations: Map<string, RelationDef>
	compoundUniques: CompoundUniqueConstraint[]
	checksum: string
}

/** Normalized field for internal use. */
export type NormalizedField = FieldDef & { name: string }

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Infer the TypeScript type for a field type.
 */
export type InferFieldType<T extends FieldType, Custom = unknown> =
	T extends 'string' ? string :
	T extends 'number' ? number :
	T extends 'boolean' ? boolean :
	T extends 'date' ? Date :
	T extends 'json' ? Custom :
	T extends 'enum' ? string :
	never

/**
 * Infer the TypeScript type for a complete model schema.
 */
export type InferModelType<S extends SchemaFields> = {
	// Required fields (non-optional, non-relation)
	[K in keyof S as S[K] extends { _def: FieldDef; _isRelation?: false }
		? S[K]['_def'] extends { optional: false }
			? K
			: never
		: never]: S[K] extends { _def: FieldDef }
			? InferFieldType<S[K]['_def']['type']>
			: never
} & {
	// Optional fields
	[K in keyof S as S[K] extends { _def: FieldDef; _isRelation?: false }
		? S[K]['_def'] extends { optional: true }
			? K
			: never
		: never]?: S[K] extends { _def: FieldDef }
			? InferFieldType<S[K]['_def']['type']>
			: never
}

/**
 * Create input type - omit id (auto-generated), required without defaults are required.
 */
export type CreateInput<T> = Omit<T, 'id'> & { id?: string }

/**
 * Update input type - all fields optional except id which is not allowed.
 */
export type UpdateInput<T> = Partial<Omit<T, 'id'>>

/**
 * Unique where clause - by id or unique fields.
 */
export type UniqueWhere<T> = { id: string } | Partial<Pick<T, keyof T & string>>

/**
 * Find unique arguments.
 */
export interface FindUniqueArgs<T> {
	where: UniqueWhere<T>
	select?: Partial<Record<keyof T, boolean>>
	include?: Record<string, boolean | object>
}

/**
 * Update arguments.
 */
export interface UpdateArgs<T> {
	where: UniqueWhere<T>
	data: UpdateInput<T>
	version?: number
}

/**
 * Delete arguments.
 */
export interface DeleteArgs<T> {
	where: UniqueWhere<T>
}

/**
 * Validation result from schema validation.
 */
export interface ValidationResult {
	valid: boolean
	errors: ValidationError[]
}

/**
 * Individual validation error.
 */
export interface ValidationError {
	field: string
	message: string
	code: string
	value?: unknown
}

/**
 * Catalog entry in serialized format (v2).
 */
export interface CatalogEntryData {
	id: string
	kind: 'chunk' | 'segments'
	chunkId?: number      // For kind='chunk'
	segmentIds?: string[] // For kind='segments'
	estimatedSize?: number // Estimated size in bytes for accurate size tracking
}

/**
 * Chunk stats in serialized format (v2).
 */
export interface ChunkStatsData {
	chunkId: number
	count: number
	size?: number  // Estimated size in bytes (v2)
}

/**
 * Catalog data for serialization (v2 format).
 * Supports both regular chunked records and segmented large records.
 */
export interface CatalogData {
	version: number
	// v2: supports both chunk and segmented entries
	entries: CatalogEntryData[]
	chunkStats: ChunkStatsData[]
	count: number
	segmentedCount?: number  // v2: count of segmented records
}

/**
 * Chunk data format.
 */
export type ChunkData = Record<string, unknown>

// ============================================================================
// Query Types (Phase 2)
// ============================================================================

/**
 * Where clause operators for filtering.
 */
export type WhereOperators<T> = {
	equals?: T
	not?: T
	gt?: T
	gte?: T
	lt?: T
	lte?: T
	in?: T[]
	contains?: string
	startsWith?: string
	endsWith?: string
}

/**
 * Where clause for filtering records.
 */
export type WhereClause<T> = {
	[K in keyof T]?: T[K] | WhereOperators<T[K]>
} & {
	AND?: WhereClause<T>[]
	OR?: WhereClause<T>[]
	NOT?: WhereClause<T>
}

/**
 * Order direction.
 */
export type OrderDirection = 'asc' | 'desc'

/**
 * Order by clause for sorting.
 */
export type OrderBy<T> = Partial<Record<keyof T, OrderDirection>>

/**
 * Select clause for projection.
 */
export type SelectClause<T> = Partial<Record<keyof T, boolean>>

/**
 * Include clause for relations.
 */
export type IncludeClause = Record<string, boolean | { select?: Record<string, boolean>; include?: IncludeClause }>

/**
 * FindMany arguments.
 */
export interface FindManyArgs<T> {
	where?: WhereClause<T>
	select?: SelectClause<T>
	include?: IncludeClause
	orderBy?: OrderBy<T> | OrderBy<T>[]
	take?: number
	skip?: number
	allowCorruptReads?: boolean
}

/**
 * FindFirst arguments (same as FindMany).
 */
export interface FindFirstArgs<T> extends FindManyArgs<T> {}

/**
 * Count arguments.
 */
export interface CountArgs<T> {
	where?: WhereClause<T>
}

// ============================================================================
// Bulk Operation Types (Phase 8)
// ============================================================================

/**
 * CreateMany arguments.
 */
export interface CreateManyArgs<T> {
	data: CreateInput<T>[]
	skipDuplicates?: boolean
}

/**
 * UpdateMany arguments.
 */
export interface UpdateManyArgs<T> {
	where: WhereClause<T>
	data: UpdateInput<T>
}

/**
 * DeleteMany arguments.
 */
export interface DeleteManyArgs<T> {
	where: WhereClause<T>
}

/**
 * Upsert arguments.
 */
export interface UpsertArgs<T> {
	where: UniqueWhere<T>
	create: CreateInput<T>
	update: UpdateInput<T>
}

/**
 * Batch operation result for createMany/updateMany/deleteMany.
 */
export interface BatchResult {
	count: number
}
