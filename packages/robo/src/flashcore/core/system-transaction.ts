/**
 * Flashcore v1 System Transaction Methods
 *
 * Extracted from system.ts — transaction execution, optimistic
 * transaction retries, and serial queue management.
 */

import type { FlashcoreAdapter } from '../adapter/types.js'
import type { TransactionOptions, TransactionResult, ITransactionContext, ResolvedTransactionMode } from '../transaction/types.js'
import { TransactionConflictError } from './errors.js'
import { getExtensions, requireExtension } from './extensions.js'
import { ensureInitialized } from './system-utils.js'
import type { FlashcoreMetrics } from './system.js'

/**
 * Logger interface matching the system logger shape.
 */
interface Logger {
	warn: (msg: string) => void
	debug: (msg: string, ...args: unknown[]) => void
}

/**
 * Execute a function within a transaction.
 */
export async function transactionImpl<T>(
	initialized: boolean,
	adapter: FlashcoreAdapter | null,
	logger: Logger,
	metrics: FlashcoreMetrics,
	fn: (ctx: ITransactionContext) => Promise<T>,
	options?: TransactionOptions
): Promise<TransactionResult<T>> {
	ensureInitialized(initialized, adapter)

	const txExt = requireExtension('transaction', 'transaction')

	const startTime = Date.now()
	const effectiveOptions = txExt.buildTransactionOptions(options)
	const resolvedMode = txExt.validateMode(effectiveOptions.mode, adapter)

	logger.debug(`Starting transaction with mode: ${resolvedMode}`)

	// Handle serial mode with queue
	if (resolvedMode === 'serial') {
		const serialResult = await txExt.getSerialQueue().enqueue(async () => {
			return executeTransactionImpl(adapter, metrics, fn, resolvedMode, effectiveOptions, startTime)
		})
		return serialResult as TransactionResult<T>
	}

	// Handle optimistic mode with retries
	if (resolvedMode === 'optimistic') {
		return executeOptimisticTransactionImpl(adapter, logger, metrics, fn, resolvedMode, effectiveOptions, startTime)
	}

	// Other modes: native, batch, single
	return executeTransactionImpl(adapter, metrics, fn, resolvedMode, effectiveOptions, startTime)
}

/**
 * Execute a transaction (internal).
 */
export async function executeTransactionImpl<T>(
	adapter: FlashcoreAdapter,
	metrics: FlashcoreMetrics,
	fn: (ctx: ITransactionContext) => Promise<T>,
	mode: ResolvedTransactionMode,
	options: Required<TransactionOptions>,
	startTime: number
): Promise<TransactionResult<T>> {
	const txExt = requireExtension('transaction', '_executeTransaction')
	const ctx = new txExt.TransactionContext(adapter, mode, options)

	try {
		// Execute user function
		const result = await fn(ctx)

		// Commit staged operations
		await ctx.commit()

		return {
			result,
			retries: 0,
			durationMs: Date.now() - startTime
		}
	} catch (error) {
		// Rollback on error
		ctx.rollback()
		throw error
	}
}

/**
 * Execute an optimistic transaction with retries.
 */
export async function executeOptimisticTransactionImpl<T>(
	adapter: FlashcoreAdapter,
	logger: Logger,
	metrics: FlashcoreMetrics,
	fn: (ctx: ITransactionContext) => Promise<T>,
	mode: ResolvedTransactionMode,
	options: Required<TransactionOptions>,
	startTime: number
): Promise<TransactionResult<T>> {
	const txExt = requireExtension('transaction', '_executeOptimisticTransaction')
	let retries = 0
	let lastError: Error | null = null

	while (retries <= options.maxRetries) {
		const ctx = new txExt.TransactionContext(adapter, mode, options)

		try {
			// Execute user function
			const result = await fn(ctx)

			// Commit staged operations (validates versions)
			await ctx.commit()

			return {
				result,
				retries,
				durationMs: Date.now() - startTime
			}
		} catch (error) {
			ctx.rollback()

			// Check if it's a conflict error (retriable)
			if (error instanceof TransactionConflictError) {
				lastError = error
				retries++
				metrics.transactionRetries++

				if (retries <= options.maxRetries) {
					// Wait before retry with exponential backoff
					const delayMs = txExt.calculateRetryDelay(options.retryDelay, retries - 1)
					logger.debug(`Transaction conflict, retrying in ${delayMs}ms (attempt ${retries}/${options.maxRetries})`)
					await txExt.delay(delayMs)
					continue
				}
			}

			// Non-conflict error or retries exhausted
			throw error
		}
	}

	// Should not reach here, but just in case
	throw lastError ?? new Error('Transaction failed after retries')
}

/**
 * Clear the serial transaction queue.
 */
export function clearSerialQueueImpl(): void {
	getExtensions().transaction?.clearSerialQueue()
}
