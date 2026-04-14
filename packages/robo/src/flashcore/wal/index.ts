/**
 * Flashcore v1 (spec rev 4.3) WAL Module
 *
 * Write-Ahead Logging for crash-safe operations.
 *
 * The WriteAheadLog implementation, delta builders, and recovery logic
 * have moved to @robojs/flashcore-extras. This barrel exports only
 * types and the global singleton shim.
 */

// Types
export type {
	WalOp,
	WalPhase,
	WalAuthoritativeDelta,
	WalInverseDelta,
	WalDerivedDelta,
	ChunkPutDelta,
	ChunkPatchDelta,
	ChunkDeleteDelta,
	CatalogSetDelta,
	CatalogDeleteDelta,
	CatalogSetSegmentsDelta,
	UniqueAcquireDelta,
	UniqueReleaseDelta,
	SegmentPutDelta,
	SegmentDeleteDelta,
	FilterAddDelta,
	FilterRemoveDelta,
	IndexUpsertDelta,
	IndexRemoveDelta,
	WalSegmentInfo,
	WALEntry,
	WALEntryHeader,
	WALEntryInput,
	RecoveryResult,
	WALConfig,
	RecoveryContext,
	// Data types used by CRUD
	DeltaBuildResult,
	UniqueChange,
	UniqueUpdate,
	SegmentWrite,
	// Extension interfaces
	WalManager,
	WalDeltaBuilders,
	WalContext
} from './types.js'

// Global singleton shim
export { setWALManager, getWALManager, isWALEnabled, getWalPendingEntriesCount, setWalPendingEntriesCount } from './manager.js'

// WalContext helper
export { getWalContext } from './context.js'
