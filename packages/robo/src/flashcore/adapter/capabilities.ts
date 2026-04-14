/**
 * Flashcore v1 (spec rev 4.3) Capability Detection
 *
 * Normalizes adapter capabilities from interface inspection and self-reporting.
 */

import type { AdapterCapabilities, FlashcoreAdapter } from './types.js'
import { FeatureNotSupportedError } from '../core/errors.js'

/**
 * Normalize adapter capabilities.
 *
 * Inspects the adapter interface for optional methods and combines with
 * self-reported capabilities if available.
 *
 * @param adapter - The adapter to inspect
 * @returns Normalized capabilities object
 */
export function normalizeCapabilities(adapter: FlashcoreAdapter): AdapterCapabilities {
	// Check which optional methods are present
	const hasScan = typeof adapter.scan === 'function'
	const hasSetIfNotExists = typeof adapter.setIfNotExists === 'function'
	const hasCompareAndSwap = typeof adapter.compareAndSwap === 'function'
	const hasAtomicBatch = typeof adapter.atomicBatch === 'function'
	const hasTransaction = typeof adapter.transaction === 'function'

	// Get self-reported capabilities if available
	const selfReported = adapter.capabilities?.() ?? {}

	// Determine adapter name
	// Skip generic constructor names like "Object" which don't provide useful info
	const constructorName = adapter.constructor?.name
	const adapterName = adapter.name ??
		(constructorName && constructorName !== 'Object' ? constructorName : 'unknown')

	return {
		// ACID support requires either native transactions or atomic batch
		acid: hasTransaction || hasAtomicBatch,

		// WAL requires scan for recovery discovery
		walEnabled: hasScan,

		// Individual capability flags
		nativeTransactions: hasTransaction,
		atomicBatch: hasAtomicBatch,
		setIfNotExists: hasSetIfNotExists,
		compareAndSwap: hasCompareAndSwap,
		scan: hasScan,

		// Isolation level from self-report or default
		isolation: selfReported.isolation ?? 'none',

		// Adapter identification
		adapter: adapterName,

		// Max value size from adapter property
		maxValueSize: adapter.maxValueSize,

		// Plugins and index types (populated later during init)
		plugins: [],
		indexTypes: []
	}
}

/**
 * Check if an adapter meets minimum requirements for a feature.
 */
export function requireCapability(
	capabilities: AdapterCapabilities,
	required: keyof AdapterCapabilities,
	featureName: string
): void {
	const value = capabilities[required]
	const hasCapability = typeof value === 'boolean' ? value : value !== undefined

	if (!hasCapability) {
		throw new FeatureNotSupportedError(
			`Feature "${featureName}" requires adapter capability "${required}" which is not available. ` +
			`Current adapter: ${capabilities.adapter}`,
			{ feature: featureName, requiredCapability: String(required) }
		)
	}
}

/**
 * Log warnings for missing recommended capabilities.
 */
export function warnMissingCapabilities(
	capabilities: AdapterCapabilities,
	logger: { warn: (msg: string) => void }
): void {
	if (!capabilities.walEnabled) {
		logger.warn(
			'WAL recovery is disabled (adapter lacks scan). ' +
			'Crash recovery guarantees are reduced.'
		)
	}

	if (!capabilities.setIfNotExists) {
		logger.warn(
			'Unique constraints are not race-free without setIfNotExists/CAS. ' +
			'Distributed mode is not safe for unique field enforcement.'
		)
	}

	if (!capabilities.acid) {
		logger.warn(
			'Adapter does not support multi-key atomic commit. ' +
			'Only single-mutation transactions are available.'
		)
	}
}

// ─────────────────────────────────────────────────────────────
// ACID Capability Checks
// ─────────────────────────────────────────────────────────────

/**
 * Check if ACID transactions are available.
 */
export function hasAcidSupport(adapter: FlashcoreAdapter): boolean {
	return !!(adapter.transaction || adapter.atomicBatch)
}

/**
 * Check if multi-key atomic operations are supported.
 * Required for bulk operations like createMany, updateMany, deleteMany.
 *
 * @throws FeatureNotSupportedError if ACID is not available
 */
export function requiresAcid(adapter: FlashcoreAdapter): void {
	if (!hasAcidSupport(adapter)) {
		throw new FeatureNotSupportedError(
			'This operation requires a storage adapter with true multi-key atomic commit. ' +
			'Use an adapter that implements transaction() or atomicBatch().',
			{
				feature: 'multi-key atomic commit',
				requiredCapability: 'transaction|atomicBatch'
			}
		)
	}
}
