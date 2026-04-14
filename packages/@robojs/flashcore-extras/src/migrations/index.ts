/**
 * Flashcore v1 (spec rev 4.3) Migration Module
 *
 * Exports all migration-related functionality.
 */

// Type exports
export type {
	// Schema metadata types
	FieldMetadata,
	RelationMetadata,
	SchemaMetadata,
	SchemaSnapshot,
	SchemaHistoryEntry,

	// Schema change types
	SchemaChangeType,
	SchemaChange,
	ChangeAnalysisResult,

	// Lock types
	LockAcquisitionResult,
	LockStatus,
	MigrationLockOptions,

	// Migration types
	MigrationDefinition,
	RegisteredMigration,
	MigrationMetadata,
	MigrationLock,
	MigrationStatus,
	MigrationResult,
	MigrationRunOptions,
	MigrationRunnerOptions,
	MigrationStatusReport,
	MigrationContext,
	MigrationModelAccessor,

	// Auto-repair types
	AutoRepairConfig,

	// Diff types
	VersionDiff,
	ModelDiff,
	FieldDiffEntry
} from './types.js'

// Type conversion helpers
export {
	normalizedFieldToMetadata,
	metadataToNormalizedField
} from './types.js'

// Schema metadata manager
export { SchemaMetadataManager } from './metadata.js'

// Schema diff analysis
export {
	analyzeSchemaChanges,
	analyzeNamespaceChanges,
	formatSchemaChanges,
	hasSchemaChanged,
	summarizeChanges
} from './diff.js'

// Schema history manager
export { SchemaHistoryManager } from './history.js'

// Migration lock
export { MigrationLockManager } from './lock.js'

// Migration runner
export { MigrationRunner, createMigrationRunner } from './runner.js'

// Migration definition API
export {
	defineMigration,
	MigrationRegistry,
	migrationRegistry,
	generateMigrationFilename,
	generateMigrationContent,
	MIGRATION_TEMPLATE
} from './define.js'
