/**
 * Shared test helper to register all flashcore-extras extensions.
 *
 * Many tests call FlashcoreSystem methods (transaction, validateSchemas, runAutoRepair, etc.)
 * that delegate to extensions registered by @robojs/flashcore-extras. In production these are
 * registered by the plugin's start hook. In tests we must register them manually.
 */

import { registerExtensions } from 'robo.js/flashcore'
import { SchemaMetadataManager } from '../../src/migrations/metadata.js'
import { SchemaHistoryManager } from '../../src/migrations/history.js'
import { analyzeSchemaChanges, summarizeChanges } from '../../src/migrations/diff.js'
import { MigrationRunner } from '../../src/migrations/runner.js'
import { IntegrityChecker } from '../../src/integrity/check.js'
import { RepairEngine } from '../../src/integrity/repair.js'
import { rebuildCatalogFromChunks, verifyCatalogIntegrity } from '../../src/integrity/catalog-rebuild.js'
import { TransactionContext, getSerialQueue, clearSerialQueue } from '../../src/transactions/context.js'
import { validateMode, buildTransactionOptions, delay, calculateRetryDelay } from '../../src/transactions/modes.js'
import { WriteAheadLog } from '../../src/wal/manager.js'
import { recoverWAL } from '../../src/wal/recovery.js'
import * as deltaBuilders from '../../src/wal/deltas.js'

/**
 * Register all flashcore-extras extensions with the core extension registry.
 * Call this in beforeEach (after _reset, before init) for tests that need extensions.
 */
export function registerAllExtensions(): void {
	registerExtensions({
		migration: {
			createMetadataManager: (adapter) => new SchemaMetadataManager(adapter),
			createHistoryManager: (adapter) => new SchemaHistoryManager(adapter),
			analyzeSchemaChanges,
			summarizeChanges,
			createMigrationRunner: (adapter) => new MigrationRunner(adapter),
			createInitialMetadata: SchemaMetadataManager.createInitialMetadata,
			createUpdatedMetadata: SchemaMetadataManager.createUpdatedMetadata,
			createAutoEntry: SchemaHistoryManager.createAutoEntry
		},
		integrity: {
			createChecker: (adapter) => new IntegrityChecker(adapter),
			createRepairEngine: (adapter) => new RepairEngine(adapter),
			rebuildCatalogFromChunks,
			verifyCatalogIntegrity
		},
		transaction: {
			TransactionContext,
			getSerialQueue,
			clearSerialQueue,
			validateMode,
			buildTransactionOptions,
			delay,
			calculateRetryDelay
		},
		wal: {
			createWALManager: (adapter, config) => new WriteAheadLog(adapter, config),
			recoverWAL,
			deltaBuilders: {
				buildCreateDeltas: deltaBuilders.buildCreateDeltas,
				buildCreateSegmentedDeltas: deltaBuilders.buildCreateSegmentedDeltas,
				buildUpdateDeltas: deltaBuilders.buildUpdateDeltas,
				buildUpdateSegmentedDeltas: deltaBuilders.buildUpdateSegmentedDeltas,
				buildUpdateChunkToSegmentsDeltas: deltaBuilders.buildUpdateChunkToSegmentsDeltas,
				buildUpdateSegmentsToChunkDeltas: deltaBuilders.buildUpdateSegmentsToChunkDeltas,
				buildDeleteDeltas: deltaBuilders.buildDeleteDeltas,
				buildDeleteSegmentedDeltas: deltaBuilders.buildDeleteSegmentedDeltas,
				computePatch: deltaBuilders.computePatch,
				applyPatch: deltaBuilders.applyPatch
			}
		}
	})
}
