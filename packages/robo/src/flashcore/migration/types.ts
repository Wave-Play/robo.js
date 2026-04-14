/**
 * Flashcore v1 (spec rev 4.3) Migration Types
 *
 * Type definitions for schema metadata, migrations, and change tracking.
 */

import type { FieldType, RelationType, OnDeleteAction, NormalizedField } from '../schema/types.js'

// ============================================================================
// Migration Runner Options
// ============================================================================

/**
 * Options for the migration runner.
 */
export interface MigrationRunnerOptions {
	/** Lock timeout in milliseconds */
	lockTimeoutMs?: number
	/** Function to discover registered migrations */
	getMigrations?: () => RegisteredMigration[]
	/** Model accessor factory for migration context */
	getModelAccessor?: <T extends { id: string }>(name: string) => MigrationModelAccessor<T>
}

// ============================================================================
// Migration Lock Types
// ============================================================================

/**
 * Result of a lock acquisition attempt.
 */
export interface LockAcquisitionResult {
	/** Whether the lock was acquired */
	acquired: boolean
	/** Unique lock ID (used for release) */
	lockId?: string
	/** If not acquired, reason why */
	reason?: 'held' | 'race' | 'error'
	/** Current lock holder info if lock is held */
	holder?: string
	/** When current lock was acquired */
	acquiredAt?: Date
}

/**
 * Current lock status.
 */
export interface LockStatus {
	/** Whether a lock is currently held */
	locked: boolean
	/** Lock holder ID if locked */
	holder?: string
	/** When lock was acquired */
	acquiredAt?: Date
	/** Whether the lock is stale (exceeded timeout) */
	stale?: boolean
}

/**
 * Migration lock manager options.
 */
export interface MigrationLockOptions {
	/** Lock timeout in milliseconds (default: 5 minutes) */
	timeoutMs?: number
}

// ============================================================================
// Schema Metadata Types
// ============================================================================

/**
 * Field metadata stored for schema history tracking.
 * This is the serializable version of NormalizedField.
 */
export interface FieldMetadata {
	name: string
	type: FieldType
	optional: boolean
	unique: boolean
	indexed: boolean
	indexTypes: string[]
	primaryKey: boolean
	version: boolean
	hasDefault: boolean
	enumValues?: string[]
}

/**
 * Relation metadata for schema tracking.
 */
export interface RelationMetadata {
	type: RelationType
	model: string
	foreignKey?: string
	onDelete: OnDeleteAction
}

/**
 * Schema metadata persisted per model.
 * Stored at: _model:{ns}::{model}:_meta
 */
export interface SchemaMetadata {
	/** Schema version number (incremented on each change) */
	version: number
	/** Deterministic FNV-1a 32-bit checksum of schema structure */
	checksum: string
	/** Field definitions */
	fields: Record<string, FieldMetadata>
	/** Relation definitions */
	relations: Record<string, RelationMetadata>
	/** Last migration timestamp (ISO string) */
	migratedAt: string
	/** List of applied migration names */
	migrationHistory: string[]
}

/**
 * Namespace-level schema snapshot.
 * Stored at: _flashcore:schema:{namespace}
 */
export interface SchemaSnapshot {
	/** Snapshot version number */
	version: number
	/** Namespace name (or '_default' for main namespace) */
	namespace: string
	/** All models in this namespace */
	models: Record<string, SchemaMetadata>
	/** Combined checksum of all model checksums */
	checksum: string
	/** Creation timestamp (ISO string) */
	createdAt: string
}

/**
 * Schema history entry for visual diff support.
 * Stored at: _flashcore:schema-history:{namespace} (append-only array)
 */
export interface SchemaHistoryEntry {
	/** Version number at this point in history */
	version: number
	/** Combined checksum at this version */
	checksum: string
	/** Changes applied in this version */
	changes: SchemaChange[]
	/** When this version was applied (ISO string) */
	appliedAt: string
	/** How this change was applied */
	appliedBy: 'auto' | 'migration'
	/** Migration name if applied by migration */
	migrationName?: string
}

// ============================================================================
// Schema Change Types
// ============================================================================

/**
 * Types of schema changes that can be detected.
 */
export type SchemaChangeType =
	| 'add_model'
	| 'remove_model'
	| 'add_field'
	| 'remove_field'
	| 'add_required_field'
	| 'change_type'
	| 'add_index'
	| 'remove_index'
	| 'add_unique'
	| 'remove_unique'
	| 'add_relation'
	| 'remove_relation'
	| 'change_optional'
	| 'change_default'

/**
 * Schema change descriptor.
 */
export interface SchemaChange {
	/** Type of change */
	type: SchemaChangeType
	/** Affected model name */
	model?: string
	/** Affected field name */
	field?: string
	/** Human-readable description */
	description: string
	/** Whether this change is safe to auto-apply */
	safe: boolean
	/** Previous value (for change operations) */
	oldValue?: unknown
	/** New value (for change operations) */
	newValue?: unknown
}

/**
 * Result of analyzing schema changes.
 */
export interface ChangeAnalysisResult {
	/** Changes that can be auto-applied safely */
	safe: SchemaChange[]
	/** Changes that require explicit migration */
	breaking: SchemaChange[]
	/** Whether any breaking changes were detected */
	hasBreakingChanges: boolean
}

// ============================================================================
// Migration Definition Types
// ============================================================================

/**
 * Context passed to migration up/down functions.
 */
export interface MigrationContext {
	/**
	 * Access model for CRUD operations.
	 * Usage: ctx.model('user').findMany({ where: { ... } })
	 */
	model: <T extends { id: string }>(name: string) => MigrationModelAccessor<T>

	/**
	 * Execute a raw operation (advanced usage).
	 * Warning: This bypasses normal safeguards.
	 */
	raw: (operation: string) => Promise<void>

	/**
	 * Report progress to the user.
	 */
	progress: (message: string) => void

	/**
	 * Process items in batches with progress reporting.
	 */
	batch: <T>(
		items: T[],
		batchSize: number,
		fn: (batch: T[]) => Promise<void>
	) => Promise<void>

	/**
	 * Get adapter for advanced operations.
	 */
	adapter: unknown
}

/**
 * Model accessor for migrations (subset of full model API).
 */
export interface MigrationModelAccessor<T extends { id: string }> {
	findMany: (args?: { where?: Record<string, unknown>; take?: number; skip?: number }) => Promise<T[]>
	findUnique: (args: { where: { id: string } }) => Promise<T | null>
	update: (args: { where: { id: string }; data: Partial<T> }) => Promise<T | null>
	updateMany: (args: { where?: Record<string, unknown>; data: Partial<T> }) => Promise<number>
	delete: (args: { where: { id: string } }) => Promise<T | null>
	deleteMany: (args: { where?: Record<string, unknown> }) => Promise<number>
	count: (args?: { where?: Record<string, unknown> }) => Promise<number>
}

/**
 * Migration definition provided by user.
 */
export interface MigrationDefinition {
	/** Unique name for this migration */
	name: string
	/** Forward migration function */
	up: (ctx: MigrationContext) => Promise<void>
	/** Rollback migration function (optional) */
	down?: (ctx: MigrationContext) => Promise<void>
}

/**
 * Registered migration with computed checksum.
 */
export interface RegisteredMigration extends MigrationDefinition {
	/** Checksum of migration code for drift detection */
	checksum: string
}

// ============================================================================
// Migration Status Types
// ============================================================================

/**
 * Migration status values.
 */
export type MigrationStatus = 'pending' | 'running' | 'completed' | 'failed'

/**
 * Migration metadata stored in adapter.
 * Stored at: _flashcore:migrations:{name}
 */
export interface MigrationMetadata {
	/** Migration name */
	name: string
	/** When the migration was applied (ISO string) */
	appliedAt?: string
	/** Current status */
	status: MigrationStatus
	/** Checksum of migration code for drift detection */
	checksum: string
	/** Error message if failed */
	error?: string
	/** Whether rollback was attempted */
	rollbackAttempted?: boolean
}

/**
 * Migration lock data.
 * Stored at: _flashcore:migrations:lock
 */
export interface MigrationLock {
	/** Unique identifier of the lock holder */
	holder: string
	/** When the lock was acquired (ISO string) */
	acquiredAt: string
}

/**
 * Result of running a single migration.
 */
export interface MigrationResult {
	/** Migration name */
	name: string
	/** Outcome status */
	status: 'success' | 'failed' | 'skipped'
	/** Error message if failed */
	error?: string
	/** Whether rollback was attempted */
	rollbackAttempted?: boolean
	/** Duration in milliseconds */
	durationMs: number
}

/**
 * Options for running migrations.
 */
export interface MigrationRunOptions {
	/** Show what would be done without applying */
	dryRun?: boolean
	/** Force release the migration lock if stuck */
	forceUnlock?: boolean
	/** Run up to a specific migration name */
	target?: string
}

/**
 * Migration status report for CLI.
 */
export interface MigrationStatusReport {
	/** Pending migrations */
	pending: string[]
	/** Completed migrations */
	completed: string[]
	/** Failed migrations */
	failed: string[]
	/** Lock status */
	lockStatus: {
		locked: boolean
		holder?: string
		acquiredAt?: Date
		stale?: boolean
	}
}

// ============================================================================
// Auto-Repair Configuration
// ============================================================================

/**
 * Configuration for automatic repair on startup.
 */
export interface AutoRepairConfig {
	/** Rebuild Cuckoo filter if corrupted */
	filter?: boolean
	/** Rebuild sorted indexes if corrupted */
	indexes?: boolean
	/** Clean orphaned unique index keys */
	uniqueIndexes?: boolean
	/** Rebuild catalog from chunks (DANGEROUS - requires explicit opt-in) */
	catalog?: boolean
}

// ============================================================================
// Visual Diff Types
// ============================================================================

/**
 * Diff between two schema versions.
 */
export interface VersionDiff {
	/** From version entry */
	from: SchemaHistoryEntry
	/** To version entry */
	to: SchemaHistoryEntry
	/** Per-model diffs */
	modelDiffs: ModelDiff[]
}

/**
 * Diff for a single model between versions.
 */
export interface ModelDiff {
	/** Model name */
	modelName: string
	/** Fields added in this diff */
	added: string[]
	/** Fields removed in this diff */
	removed: string[]
	/** Fields that changed */
	modified: FieldDiffEntry[]
}

/**
 * A single field modification entry.
 */
export interface FieldDiffEntry {
	/** Field name */
	field: string
	/** Previous field metadata */
	from: FieldMetadata
	/** New field metadata */
	to: FieldMetadata
}

// ============================================================================
// Helper Functions for Type Conversion
// ============================================================================

/**
 * Convert a NormalizedField to FieldMetadata for storage.
 */
export function normalizedFieldToMetadata(field: NormalizedField): FieldMetadata {
	return {
		name: field.name,
		type: field.type,
		optional: field.optional,
		unique: field.unique,
		indexed: field.indexed,
		indexTypes: field.indexTypes,
		primaryKey: field.primaryKey,
		version: field.version,
		hasDefault: field.hasDefault,
		enumValues: field.enumValues
	}
}

/**
 * Convert FieldMetadata back to a partial NormalizedField structure.
 */
export function metadataToNormalizedField(metadata: FieldMetadata): NormalizedField {
	return {
		name: metadata.name,
		type: metadata.type,
		optional: metadata.optional,
		unique: metadata.unique,
		indexed: metadata.indexed,
		indexTypes: metadata.indexTypes,
		primaryKey: metadata.primaryKey,
		version: metadata.version,
		hasDefault: metadata.hasDefault,
		enumValues: metadata.enumValues
	}
}
