import { registerExtensions } from 'robo.js/flashcore'
import { SchemaMetadataManager } from '../migrations/metadata.js'
import { SchemaHistoryManager } from '../migrations/history.js'
import { analyzeSchemaChanges, summarizeChanges } from '../migrations/diff.js'
import { MigrationRunner } from '../migrations/runner.js'
import { IntegrityChecker } from '../integrity/check.js'
import { RepairEngine } from '../integrity/repair.js'
import { rebuildCatalogFromChunks, verifyCatalogIntegrity } from '../integrity/catalog-rebuild.js'
import { TransactionContext, getSerialQueue, clearSerialQueue } from '../transactions/context.js'
import { validateMode, buildTransactionOptions, delay, calculateRetryDelay } from '../transactions/modes.js'
import { WriteAheadLog } from '../wal/manager.js'
import { recoverWAL } from '../wal/recovery.js'
import * as deltaBuilders from '../wal/deltas.js'

export default () => {
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
