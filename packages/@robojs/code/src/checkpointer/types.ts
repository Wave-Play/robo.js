/**
 * Checkpointer adapter types for @robojs/code SDK
 *
 * Checkpointers are required for interrupt/resume functionality.
 * The SDK works with LangGraph checkpointers but provides these
 * adapter types for flexibility.
 */

/**
 * Checkpoint data structure
 */
export interface CheckpointData {
	/**
	 * LangGraph thread ID (same as runId)
	 */
	threadId: string

	/**
	 * Serialized agent state
	 */
	state: unknown

	/**
	 * Optional metadata
	 */
	metadata?: Record<string, unknown>

	/**
	 * Checkpoint version for migration support
	 */
	version?: number

	/**
	 * When the checkpoint was created
	 */
	createdAt?: string
}

/**
 * Checkpointer interface for saving/loading agent state.
 *
 * @deprecated Use BaseCheckpointSaver from @langchain/langgraph instead.
 * This interface is maintained for backward compatibility only.
 *
 * For new implementations, import BaseCheckpointSaver:
 * ```typescript
 * import type { BaseCheckpointSaver } from '@robojs/code'
 * // or directly from LangGraph:
 * import type { BaseCheckpointSaver } from '@langchain/langgraph'
 * ```
 *
 * Hard requirement: Approvals and questions require a checkpointer.
 *
 * Options:
 * - In-memory: Sufficient for same-page sessions
 * - Durable: Required for "come back later" functionality
 *
 * LangGraph provides built-in checkpointers that can be used directly.
 * These types are for custom implementations.
 */
export interface Checkpointer {
	/**
	 * Save a checkpoint
	 */
	save(checkpoint: CheckpointData): Promise<void>

	/**
	 * Load a checkpoint by thread ID
	 */
	load(threadId: string): Promise<CheckpointData | null>

	/**
	 * Delete a checkpoint
	 */
	delete(threadId: string): Promise<void>

	/**
	 * List all checkpoint thread IDs (optional)
	 */
	list?(): Promise<string[]>
}

/**
 * In-memory checkpointer configuration
 */
export interface MemoryCheckpointerConfig {
	/**
	 * Maximum number of checkpoints to keep
	 */
	maxCheckpoints?: number
}

/**
 * Configuration for a durable checkpointer
 */
export interface DurableCheckpointerConfig {
	/**
	 * Storage backend type
	 */
	type: 'indexeddb' | 'filesystem' | 'redis' | 'postgres' | 'custom'

	/**
	 * Connection string or configuration
	 */
	connection: string | Record<string, unknown>

	/**
	 * Key prefix for namespacing
	 */
	keyPrefix?: string

	/**
	 * TTL for checkpoints in seconds (0 = no expiry)
	 */
	ttlSeconds?: number
}
