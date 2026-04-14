/**
 * Flashcore v1 Transaction Types (spec rev 4.3)
 *
 * Types for the transaction system, including modes, options, and context.
 */

import type { FlashcoreAdapter } from 'robo.js/flashcore'

/**
 * Transaction modes supported by Flashcore.
 *
 * - `auto`: Default. Picks the strongest supported mode for the adapter.
 * - `native`: Use adapter.transaction() for full ACID guarantees.
 * - `batch`: Use adapter.atomicBatch() for atomic commit of staged writes.
 * - `optimistic`: Optimistic concurrency control with version checking and retries.
 * - `serial`: Serialize transactions within the process using a queue.
 * - `single`: For minimal adapters. At most one mutation allowed per transaction.
 */
export type TransactionMode = 'auto' | 'native' | 'batch' | 'optimistic' | 'serial' | 'single'

/**
 * Transaction options for Flashcore.$.transaction().
 */
export interface TransactionOptions {
	/**
	 * Transaction mode.
	 * @default 'auto'
	 */
	mode?: TransactionMode

	/**
	 * Maximum retry attempts for optimistic transactions.
	 * Only used when mode is 'optimistic'.
	 * @default 3
	 */
	maxRetries?: number

	/**
	 * Delay between retry attempts in milliseconds.
	 * Only used when mode is 'optimistic'.
	 * @default 100
	 */
	retryDelay?: number

	/**
	 * Transaction timeout in milliseconds.
	 * @default 30000
	 */
	timeout?: number
}

/**
 * Effective transaction mode after resolving 'auto'.
 */
export type ResolvedTransactionMode = Exclude<TransactionMode, 'auto'>

/**
 * Staged operation type for transaction context.
 */
export type StagedOperation =
	| { type: 'set'; key: string; value: unknown }
	| { type: 'delete'; key: string }

/**
 * Read set entry for version tracking.
 */
export interface ReadSetEntry {
	key: string
	version: number
}

/**
 * Transaction context interface exposed to user code.
 *
 * Provides methods for reading and staging writes within a transaction.
 */
export interface ITransactionContext {
	/**
	 * Read a value within the transaction.
	 * The value is tracked for conflict detection in optimistic mode.
	 */
	read<V = unknown>(key: string): Promise<V | undefined>

	/**
	 * Stage a set operation. Written on commit.
	 */
	set(key: string, value: unknown): void

	/**
	 * Stage a delete operation. Executed on commit.
	 */
	delete(key: string): void

	/**
	 * Get the current transaction mode.
	 */
	readonly mode: ResolvedTransactionMode

	/**
	 * Get mutation count so far.
	 */
	readonly mutationCount: number
}

/**
 * Internal transaction context state.
 */
export interface TransactionContextState {
	/**
	 * Staged set operations.
	 */
	staged: Map<string, unknown>

	/**
	 * Staged delete operations.
	 */
	deletes: Set<string>

	/**
	 * Read set for version tracking (optimistic mode).
	 * Maps composite key "model:id" to the version read.
	 */
	readVersions: Map<string, number>

	/**
	 * Mutation count for single-mode enforcement.
	 */
	mutationCount: number

	/**
	 * Whether the transaction has been committed or rolled back.
	 */
	completed: boolean
}

/**
 * Transaction execution result.
 */
export interface TransactionResult<T> {
	/**
	 * The result returned from the transaction function.
	 */
	result: T

	/**
	 * Number of retry attempts (only relevant for optimistic mode).
	 */
	retries: number

	/**
	 * Total duration in milliseconds.
	 */
	durationMs: number
}

/**
 * Internal options for transaction execution.
 */
export interface TransactionExecutionOptions extends Required<TransactionOptions> {
	/**
	 * Resolved mode (no 'auto').
	 */
	resolvedMode: ResolvedTransactionMode
}

/**
 * Serial mode queue item.
 */
export interface SerialQueueItem {
	/**
	 * The transaction function to execute.
	 */
	fn: () => Promise<unknown>

	/**
	 * Resolve callback for the queue promise.
	 */
	resolve: (value: unknown) => void

	/**
	 * Reject callback for the queue promise.
	 */
	reject: (error: Error) => void
}

/**
 * Transaction commit handler type.
 * Used internally to execute the commit logic.
 */
export type TransactionCommitHandler = (
	adapter: FlashcoreAdapter,
	staged: Map<string, unknown>,
	deletes: Set<string>,
	readVersions: Map<string, number>
) => Promise<void>

/**
 * Model-level transaction context for bulk operations.
 * Allows models to participate in a shared transaction.
 */
export interface ModelTransactionContext {
	/**
	 * Stage a model operation.
	 */
	stageOperation(model: string, op: StagedOperation): void

	/**
	 * Track a read for version checking.
	 */
	trackRead(model: string, id: string, version: number): void

	/**
	 * Get the underlying transaction context.
	 */
	readonly context: ITransactionContext
}
