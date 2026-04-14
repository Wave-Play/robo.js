/**
 * Flashcore v1 Transaction Context (spec rev 4.3)
 *
 * Implements the transaction context with staging, read tracking, and commit logic.
 */

import type { FlashcoreAdapter, BatchOperation } from 'robo.js/flashcore'
import type {
	ITransactionContext,
	TransactionContextState,
	ResolvedTransactionMode,
	TransactionOptions
} from './types.js'
import { TransactionConflictError, FeatureNotSupportedError } from 'robo.js/flashcore'
import { VERSION_FIELD_NAME } from 'robo.js/flashcore'

/**
 * Transaction context implementation.
 *
 * Provides staging for writes/deletes, read tracking for optimistic locking,
 * and commit logic for different transaction modes.
 */
export class TransactionContext implements ITransactionContext {
	private state: TransactionContextState

	constructor(
		private readonly adapter: FlashcoreAdapter,
		private readonly resolvedMode: ResolvedTransactionMode,
		private readonly options: Required<TransactionOptions>
	) {
		this.state = {
			staged: new Map(),
			deletes: new Set(),
			readVersions: new Map(),
			mutationCount: 0,
			completed: false
		}
	}

	/**
	 * Get the transaction mode.
	 */
	get mode(): ResolvedTransactionMode {
		return this.resolvedMode
	}

	/**
	 * Get the current mutation count.
	 */
	get mutationCount(): number {
		return this.state.mutationCount
	}

	/**
	 * Get transaction options.
	 */
	getOptions(): Required<TransactionOptions> {
		return this.options
	}

	/**
	 * Read a value within the transaction.
	 * Tracks the version for conflict detection in optimistic mode.
	 */
	async read<V = unknown>(key: string): Promise<V | undefined> {
		this.ensureNotCompleted()

		// Check staged writes first
		if (this.state.staged.has(key)) {
			return this.state.staged.get(key) as V | undefined
		}

		// Check if deleted
		if (this.state.deletes.has(key)) {
			return undefined
		}

		// Read from adapter
		const value = await this.adapter.get(key)

		// Track version if present (for optimistic mode)
		if (value !== undefined && typeof value === 'object' && value !== null) {
			const record = value as Record<string, unknown>
			if (typeof record[VERSION_FIELD_NAME] === 'number') {
				this.state.readVersions.set(key, record[VERSION_FIELD_NAME])
			}
		}

		return value as V | undefined
	}

	/**
	 * Stage a set operation.
	 */
	set(key: string, value: unknown): void {
		this.ensureNotCompleted()
		this.enforceSingleModeLimit()

		// Remove from deletes if present
		this.state.deletes.delete(key)

		this.state.staged.set(key, value)
		this.state.mutationCount++
	}

	/**
	 * Stage a delete operation.
	 */
	delete(key: string): void {
		this.ensureNotCompleted()
		this.enforceSingleModeLimit()

		// Remove from staged if present
		this.state.staged.delete(key)

		this.state.deletes.add(key)
		this.state.mutationCount++
	}

	/**
	 * Track a read version externally (for model operations).
	 */
	trackReadVersion(key: string, version: number): void {
		this.state.readVersions.set(key, version)
	}

	/**
	 * Get the read versions map (for commit).
	 */
	getReadVersions(): Map<string, number> {
		return this.state.readVersions
	}

	/**
	 * Get staged writes.
	 */
	getStagedWrites(): Map<string, unknown> {
		return this.state.staged
	}

	/**
	 * Get staged deletes.
	 */
	getStagedDeletes(): Set<string> {
		return this.state.deletes
	}

	/**
	 * Check if there are any pending operations.
	 */
	hasPendingOperations(): boolean {
		return this.state.staged.size > 0 || this.state.deletes.size > 0
	}

	/**
	 * Commit the transaction.
	 * The actual commit logic is determined by the mode.
	 */
	async commit(): Promise<void> {
		this.ensureNotCompleted()
		this.state.completed = true

		// No pending operations - nothing to commit
		if (!this.hasPendingOperations()) {
			return
		}

		switch (this.resolvedMode) {
			case 'native':
				await this.commitNative()
				break

			case 'batch':
				await this.commitBatch()
				break

			case 'optimistic':
				await this.commitOptimistic()
				break

			case 'serial':
				// Serial mode uses the same commit as batch/native
				// The serialization happens at the system level
				await this.commitWithAtomicPrimitive()
				break

			case 'single':
				await this.commitSingle()
				break

			default:
				throw new Error(`Unknown transaction mode: ${this.resolvedMode}`)
		}
	}

	/**
	 * Rollback the transaction (discard staged operations).
	 */
	rollback(): void {
		this.state.staged.clear()
		this.state.deletes.clear()
		this.state.readVersions.clear()
		this.state.mutationCount = 0
		this.state.completed = true
	}

	/**
	 * Commit using native adapter transaction.
	 */
	private async commitNative(): Promise<void> {
		if (!this.adapter.transaction) {
			throw new Error('Adapter does not support native transactions')
		}

		await this.adapter.transaction(async (tx) => {
			// Apply staged writes
			for (const [key, value] of this.state.staged) {
				tx.set(key, value)
			}

			// Apply deletes
			for (const key of this.state.deletes) {
				tx.delete(key)
			}
		})
	}

	/**
	 * Commit using atomic batch.
	 */
	private async commitBatch(): Promise<void> {
		if (!this.adapter.atomicBatch) {
			throw new Error('Adapter does not support atomic batch')
		}

		const ops: BatchOperation<string, unknown>[] = []

		// Add set operations
		for (const [key, value] of this.state.staged) {
			ops.push({ type: 'set', key, value })
		}

		// Add delete operations
		for (const key of this.state.deletes) {
			ops.push({ type: 'delete', key })
		}

		await this.adapter.atomicBatch(ops)
	}

	/**
	 * Commit with optimistic concurrency control.
	 * Validates read versions before committing.
	 */
	private async commitOptimistic(): Promise<void> {
		// Validate read versions
		for (const [key, expectedVersion] of this.state.readVersions) {
			const current = await this.adapter.get(key)

			if (current !== undefined && typeof current === 'object' && current !== null) {
				const currentVersion = (current as Record<string, unknown>)[VERSION_FIELD_NAME]

				if (typeof currentVersion === 'number' && currentVersion !== expectedVersion) {
					throw new TransactionConflictError(
						`Version conflict: expected ${expectedVersion}, found ${currentVersion}`,
						{
							expectedVersion,
							actualVersion: currentVersion
						}
					)
				}
			}
		}

		// Commit using the best available atomic primitive
		await this.commitWithAtomicPrimitive()
	}

	/**
	 * Commit using the best available atomic primitive.
	 */
	private async commitWithAtomicPrimitive(): Promise<void> {
		if (this.adapter.transaction) {
			await this.commitNative()
		} else if (this.adapter.atomicBatch) {
			await this.commitBatch()
		} else {
			// Should not reach here - mode validation should prevent this
			throw new Error('No atomic commit primitive available')
		}
	}

	/**
	 * Commit for single mode (direct operations).
	 * Only one mutation should be present.
	 */
	private async commitSingle(): Promise<void> {
		// Apply staged writes directly
		for (const [key, value] of this.state.staged) {
			await this.adapter.set(key, value)
		}

		// Apply deletes directly
		for (const key of this.state.deletes) {
			await this.adapter.delete(key)
		}
	}

	/**
	 * Ensure the transaction is not already completed.
	 */
	private ensureNotCompleted(): void {
		if (this.state.completed) {
			throw new Error('Transaction has already been completed')
		}
	}

	/**
	 * Enforce single-mode mutation limit.
	 */
	private enforceSingleModeLimit(): void {
		if (this.resolvedMode === 'single' && this.state.mutationCount >= 1) {
			throw new FeatureNotSupportedError(
				'Multi-op transactions require adapter.transaction or adapter.atomicBatch. ' +
				'Only one mutation is allowed in single mode.',
				{
					feature: 'multi-mutation transaction',
					requiredCapability: 'acid'
				}
			)
		}
	}
}

/**
 * Serial mode queue for serializing transactions within the process.
 */
export class SerialTransactionQueue {
	private queue: Array<{
		fn: () => Promise<unknown>
		resolve: (value: unknown) => void
		reject: (error: Error) => void
	}> = []

	private processing = false

	/**
	 * Enqueue a transaction for serial execution.
	 */
	async enqueue<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push({
				fn: fn as () => Promise<unknown>,
				resolve: resolve as (value: unknown) => void,
				reject
			})

			this.processQueue()
		})
	}

	/**
	 * Process the queue.
	 */
	private async processQueue(): Promise<void> {
		if (this.processing) {
			return
		}

		this.processing = true

		while (this.queue.length > 0) {
			const item = this.queue.shift()!

			try {
				const result = await item.fn()
				item.resolve(result)
			} catch (error) {
				item.reject(error instanceof Error ? error : new Error(String(error)))
			}

			// Yield multiple times to ensure all promise handlers (including nested
			// async wrappers from FlashcoreSystem.transaction) complete before
			// the synchronous part of the next transaction's function runs
			await Promise.resolve()
			await Promise.resolve()
			await Promise.resolve()
		}

		this.processing = false
	}

	/**
	 * Check if the queue is empty.
	 */
	isEmpty(): boolean {
		return this.queue.length === 0 && !this.processing
	}

	/**
	 * Clear the queue (for testing/shutdown).
	 */
	clear(): void {
		// Reject all pending items
		for (const item of this.queue) {
			item.reject(new Error('Transaction queue cleared'))
		}
		this.queue = []
	}
}

// Global serial queue instance
let serialQueue: SerialTransactionQueue | null = null

/**
 * Get the serial transaction queue.
 */
export function getSerialQueue(): SerialTransactionQueue {
	if (!serialQueue) {
		serialQueue = new SerialTransactionQueue()
	}
	return serialQueue
}

/**
 * Clear the serial queue (for testing).
 */
export function clearSerialQueue(): void {
	if (serialQueue) {
		serialQueue.clear()
		serialQueue = null
	}
}
