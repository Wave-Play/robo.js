/**
 * Flashcore v1 Extension Registry
 *
 * Allows optional subsystems (migrations, integrity, transactions)
 * to be registered at runtime by the @robojs/flashcore-extras plugin.
 *
 * Core system.ts delegates to these extensions instead of importing implementations directly.
 */

import type { FlashcoreAdapter } from '../adapter/types.js'
import type { FieldMetadata, ChangeAnalysisResult, SchemaChange } from '../migration/types.js'
import type { Catalog } from '../model/catalog.js'
import type { NormalizedSchema } from '../schema/types.js'
import type { TransactionMode, TransactionOptions, ResolvedTransactionMode } from '../transaction/types.js'
import type { WalManager, WalDeltaBuilders, WALConfig, RecoveryResult } from '../wal/types.js'
import { FeatureNotSupportedError } from './errors.js'

// ─────────────────────────────────────────────────────────────
// Extension Interfaces
// ─────────────────────────────────────────────────────────────

/**
 * Migration extension — factories for schema metadata, history, migration runner, and diff utilities.
 */
export interface MigrationExtension {
	createMetadataManager(adapter: FlashcoreAdapter): any
	createHistoryManager(adapter: FlashcoreAdapter): any
	analyzeSchemaChanges(storedFields: Record<string, FieldMetadata>, currentSchema: NormalizedSchema, modelName: string): ChangeAnalysisResult
	summarizeChanges(analysis: ChangeAnalysisResult): string
	createMigrationRunner(adapter: FlashcoreAdapter): any
	createInitialMetadata(schema: NormalizedSchema): any
	createUpdatedMetadata(schema: NormalizedSchema, stored: any): any
	createAutoEntry(version: number, checksum: string, changes: SchemaChange[]): any
}

/**
 * Integrity extension — factories for integrity checking and repair.
 */
export interface IntegrityExtension {
	createChecker(adapter: FlashcoreAdapter): any
	createRepairEngine(adapter: FlashcoreAdapter): any
	rebuildCatalogFromChunks(adapter: FlashcoreAdapter, modelName: string, namespace?: string, options?: any): Promise<any>
	verifyCatalogIntegrity(adapter: FlashcoreAdapter, catalog: Catalog, modelName: string, namespace?: string): Promise<any>
}

/**
 * Transaction extension — transaction context, serial queue, and mode utilities.
 */
export interface TransactionExtension {
	TransactionContext: new (adapter: FlashcoreAdapter, mode: ResolvedTransactionMode, options: Required<TransactionOptions>) => any
	getSerialQueue(): any
	clearSerialQueue(): void
	validateMode(mode: TransactionMode, adapter: FlashcoreAdapter): ResolvedTransactionMode
	buildTransactionOptions(options?: TransactionOptions): Required<TransactionOptions>
	delay(ms: number): Promise<void>
	calculateRetryDelay(baseDelay: number, attempt: number, jitter?: boolean): number
}

/**
 * WAL extension — factories for WAL manager, recovery, and delta builders.
 */
export interface WalExtension {
	createWALManager(adapter: FlashcoreAdapter, config?: WALConfig): WalManager
	recoverWAL(adapter: FlashcoreAdapter, config?: WALConfig): Promise<RecoveryResult>
	deltaBuilders: WalDeltaBuilders
}

/**
 * Combined extension registry.
 */
export interface ExtensionRegistry {
	migration?: MigrationExtension
	integrity?: IntegrityExtension
	transaction?: TransactionExtension
	wal?: WalExtension
}

// ─────────────────────────────────────────────────────────────
// Global Singleton
// ─────────────────────────────────────────────────────────────

let extensions: ExtensionRegistry = {}

/**
 * Register extensions (merges into existing registry).
 *
 * Called by `@robojs/flashcore-extras` start hook.
 */
export function registerExtensions(ext: ExtensionRegistry): void {
	extensions = { ...extensions, ...ext }
}

/**
 * Get the current extension registry.
 */
export function getExtensions(): Readonly<ExtensionRegistry> {
	return extensions
}

/**
 * Require a specific extension, throwing a clear error if not installed.
 *
 * @param name - Extension name ('migration', 'integrity', 'transaction')
 * @param methodName - The calling method name (for the error message)
 * @returns The extension
 * @throws FeatureNotSupportedError with install instructions
 */
export function requireExtension<K extends keyof ExtensionRegistry>(
	name: K,
	methodName: string
): NonNullable<ExtensionRegistry[K]> {
	const ext = extensions[name]
	if (!ext) {
		throw new FeatureNotSupportedError(
			`Flashcore.$.${methodName}() requires the "${name}" extension. ` +
			`Install @robojs/flashcore-extras: npx robo add @robojs/flashcore-extras`,
			{ feature: `${name} extension` }
		)
	}
	return ext as NonNullable<ExtensionRegistry[K]>
}

/**
 * Reset extensions (for testing).
 * @internal
 */
export function _resetExtensions(): void {
	extensions = {}
}
