/**
 * Flashcore v1 Transaction Module (spec rev 4.3)
 *
 * Exports for the transaction system.
 */

// Types
export type {
	TransactionMode,
	TransactionOptions,
	ResolvedTransactionMode,
	StagedOperation,
	ReadSetEntry,
	ITransactionContext,
	TransactionContextState,
	TransactionResult,
	TransactionExecutionOptions,
	SerialQueueItem,
	TransactionCommitHandler,
	ModelTransactionContext
} from './types.js'

// Context
export {
	TransactionContext,
	SerialTransactionQueue,
	getSerialQueue,
	clearSerialQueue
} from './context.js'

// Modes
export {
	resolveAutoMode,
	validateMode,
	hasAcidSupport,
	requiresAcid,
	buildTransactionOptions,
	getModeName,
	requiresVersionTracking,
	delay,
	calculateRetryDelay
} from './modes.js'
