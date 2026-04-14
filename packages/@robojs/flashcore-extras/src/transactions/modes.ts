/**
 * Flashcore v1 Transaction Modes (spec rev 4.3)
 *
 * Mode selection, validation, and helper functions.
 */

import type { FlashcoreAdapter } from 'robo.js/flashcore'
import type { TransactionMode, ResolvedTransactionMode, TransactionOptions } from './types.js'
import { FeatureNotSupportedError } from 'robo.js/flashcore'
import { DEFAULT_TRANSACTION_SETTINGS } from 'robo.js/flashcore'

/**
 * Resolve 'auto' mode to a concrete mode based on adapter capabilities.
 *
 * Priority order:
 * 1. native (if adapter.transaction exists)
 * 2. batch (if adapter.atomicBatch exists)
 * 3. single (fallback for minimal adapters)
 */
export function resolveAutoMode(adapter: FlashcoreAdapter): ResolvedTransactionMode {
	if (adapter.transaction) {
		return 'native'
	}

	if (adapter.atomicBatch) {
		return 'batch'
	}

	return 'single'
}

/**
 * Validate that a transaction mode is supported by the adapter.
 *
 * @throws FeatureNotSupportedError if the mode is not supported
 */
export function validateMode(
	mode: TransactionMode,
	adapter: FlashcoreAdapter
): ResolvedTransactionMode {
	// Auto mode - resolve to best available
	if (mode === 'auto') {
		return resolveAutoMode(adapter)
	}

	const hasNative = !!adapter.transaction
	const hasBatch = !!adapter.atomicBatch
	const hasAcid = hasNative || hasBatch

	switch (mode) {
		case 'native':
			if (!hasNative) {
				throw new FeatureNotSupportedError(
					'Native transactions require adapter.transaction()',
					{
						feature: 'native transactions',
						requiredCapability: 'nativeTransactions'
					}
				)
			}
			return 'native'

		case 'batch':
			if (!hasBatch) {
				throw new FeatureNotSupportedError(
					'Batch transactions require adapter.atomicBatch()',
					{
						feature: 'batch transactions',
						requiredCapability: 'atomicBatch'
					}
				)
			}
			return 'batch'

		case 'optimistic':
			if (!hasAcid) {
				throw new FeatureNotSupportedError(
					'Optimistic transactions require adapter.transaction() or adapter.atomicBatch() for atomic commit',
					{
						feature: 'optimistic transactions',
						requiredCapability: 'acid'
					}
				)
			}
			return 'optimistic'

		case 'serial':
			if (!hasAcid) {
				throw new FeatureNotSupportedError(
					'Serial transactions require adapter.transaction() or adapter.atomicBatch() for atomic commit',
					{
						feature: 'serial transactions',
						requiredCapability: 'acid'
					}
				)
			}
			return 'serial'

		case 'single':
			// Always supported - minimal mode
			return 'single'

		default:
			throw new Error(`Unknown transaction mode: ${mode}`)
	}
}

/**
 * Check if ACID transactions are available.
 */
export function hasAcidSupport(adapter: FlashcoreAdapter): boolean {
	return !!(adapter.transaction || adapter.atomicBatch)
}

/**
 * Check if multi-key atomic operations are supported.
 * Required for bulk operations like createMany, updateMany, deleteMany.
 */
export function requiresAcid(adapter: FlashcoreAdapter): void {
	if (!hasAcidSupport(adapter)) {
		throw new FeatureNotSupportedError(
			'This operation requires multi-key atomic commit. ' +
			'Adapter must support transaction() or atomicBatch().',
			{
				feature: 'bulk operations',
				requiredCapability: 'acid'
			}
		)
	}
}

/**
 * Build effective transaction options with defaults.
 */
export function buildTransactionOptions(
	options?: TransactionOptions
): Required<TransactionOptions> {
	return {
		mode: options?.mode ?? 'auto',
		maxRetries: options?.maxRetries ?? DEFAULT_TRANSACTION_SETTINGS.maxRetries,
		retryDelay: options?.retryDelay ?? DEFAULT_TRANSACTION_SETTINGS.retryDelay,
		timeout: options?.timeout ?? DEFAULT_TRANSACTION_SETTINGS.timeout
	}
}

/**
 * Get a descriptive name for a transaction mode.
 */
export function getModeName(mode: ResolvedTransactionMode): string {
	switch (mode) {
		case 'native':
			return 'Native Transaction'
		case 'batch':
			return 'Atomic Batch'
		case 'optimistic':
			return 'Optimistic Concurrency'
		case 'serial':
			return 'Serial Queue'
		case 'single':
			return 'Single Mutation'
		default:
			return 'Unknown'
	}
}

/**
 * Determine if a mode requires version tracking for conflict detection.
 */
export function requiresVersionTracking(mode: ResolvedTransactionMode): boolean {
	return mode === 'optimistic'
}

/**
 * Delay helper for retry logic.
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate retry delay with optional jitter.
 */
export function calculateRetryDelay(baseDelay: number, attempt: number, jitter = true): number {
	// Exponential backoff with base delay
	let delayMs = baseDelay * Math.pow(2, attempt)

	// Add jitter (±20%)
	if (jitter) {
		const jitterFactor = 0.8 + Math.random() * 0.4
		delayMs = Math.floor(delayMs * jitterFactor)
	}

	return delayMs
}
