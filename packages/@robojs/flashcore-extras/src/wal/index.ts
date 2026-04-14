/**
 * WAL (Write-Ahead Log) module for @robojs/flashcore-extras.
 *
 * Provides the WriteAheadLog manager, delta builders, and recovery logic.
 */

export { WriteAheadLog } from './manager.js'

export {
	buildCreateDeltas,
	buildCreateSegmentedDeltas,
	buildUpdateDeltas,
	buildUpdateSegmentedDeltas,
	buildUpdateChunkToSegmentsDeltas,
	buildUpdateSegmentsToChunkDeltas,
	buildDeleteDeltas,
	buildDeleteSegmentedDeltas,
	computePatch,
	applyPatch
} from './deltas.js'

export {
	recoverWAL,
	applyCatalogSetDelta,
	applyCatalogSetSegmentsDelta,
	applyCatalogDeleteDelta,
	replayEntryWithContext,
	rollbackEntryWithContext
} from './recovery.js'
