/**
 * Flashcore v1 (spec rev 4.3) Migration Lock Manager
 *
 * Provides distributed locking for migration operations to prevent
 * concurrent migrations from corrupting data.
 */

import { randomUUID } from 'crypto'
import type { FlashcoreAdapter } from 'robo.js/flashcore'
import type { LockAcquisitionResult, LockStatus, MigrationLock, MigrationLockOptions } from './types.js'
import { extrasLogger as logger } from '../core/logger.js'

/**
 * Storage key for the migration lock.
 */
const LOCK_KEY = '_flashcore:migrations:lock'

/**
 * Default lock timeout in milliseconds (5 minutes).
 * Locks older than this are considered stale and can be overridden.
 */
const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Manager for migration lock acquisition and release.
 *
 * Uses compare-and-swap (CAS) or setIfNotExists when available
 * for safe concurrent access. Falls back to check-then-set
 * with a small race window for adapters without atomic support.
 */
export class MigrationLockManager {
	private readonly timeoutMs: number

	constructor(
		private readonly adapter: FlashcoreAdapter,
		options?: MigrationLockOptions
	) {
		this.timeoutMs = options?.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS
	}

	/**
	 * Attempt to acquire the migration lock.
	 *
	 * Algorithm:
	 * 1. Check for existing lock
	 * 2. If locked and not stale, return false
	 * 3. If stale, try atomic override (CAS if available)
	 * 4. If no lock, use setIfNotExists if available, else check-then-set
	 *
	 * @returns Lock acquisition result with lock ID if successful
	 */
	async acquire(): Promise<LockAcquisitionResult> {
		const lockId = randomUUID()
		const now = new Date()

		try {
			// Check for existing lock
			const existing = await this.getLock()

			if (existing) {
				const age = now.getTime() - existing.acquiredAt.getTime()

				if (age < this.timeoutMs) {
					// Lock is held and valid
					return {
						acquired: false,
						reason: 'held',
						holder: existing.holder,
						acquiredAt: existing.acquiredAt
					}
				}

				// Lock is stale - try to override
				logger.warn(
					`Attempting to override stale migration lock (held by ${existing.holder} for ${Math.round(age / 1000)}s)`
				)

				return this.tryOverrideStaleLock(lockId, existing)
			}

			// No existing lock - try to acquire
			return this.tryAcquireNewLock(lockId)

		} catch (error) {
			logger.error('Failed to acquire migration lock:', error)
			return {
				acquired: false,
				reason: 'error'
			}
		}
	}

	/**
	 * Release the migration lock.
	 *
	 * Only releases if the lock is held by the given lockId.
	 *
	 * @param lockId - Lock ID returned from acquire()
	 * @returns True if the lock was released
	 */
	async release(lockId: string): Promise<boolean> {
		try {
			const existing = await this.getLock()

			if (!existing) {
				// No lock to release
				return true
			}

			if (existing.holder !== lockId) {
				// Lock is held by someone else
				logger.warn(
					`Cannot release migration lock: held by ${existing.holder}, not ${lockId}`
				)
				return false
			}

			// Release the lock
			await this.adapter.delete(LOCK_KEY)
			return true

		} catch (error) {
			logger.error('Failed to release migration lock:', error)
			return false
		}
	}

	/**
	 * Force release the migration lock regardless of holder.
	 *
	 * Use with caution - only for stuck locks or CLI force-unlock.
	 */
	async forceRelease(): Promise<void> {
		await this.adapter.delete(LOCK_KEY)
		logger.warn('Migration lock forcefully released')
	}

	/**
	 * Check the current lock status.
	 *
	 * @returns Lock status information
	 */
	async isLocked(): Promise<LockStatus> {
		const lock = await this.getLock()

		if (!lock) {
			return { locked: false }
		}

		const age = Date.now() - lock.acquiredAt.getTime()
		const stale = age >= this.timeoutMs

		return {
			locked: true,
			holder: lock.holder,
			acquiredAt: lock.acquiredAt,
			stale
		}
	}

	/**
	 * Extend the lock timeout (heartbeat).
	 *
	 * Call periodically during long-running migrations to prevent
	 * the lock from appearing stale.
	 *
	 * @param lockId - Lock ID to extend
	 * @returns True if extended successfully
	 */
	async extend(lockId: string): Promise<boolean> {
		try {
			const existing = await this.getLock()

			if (!existing || existing.holder !== lockId) {
				return false
			}

			// Update the lock with new timestamp
			const newLock: MigrationLock = {
				holder: lockId,
				acquiredAt: new Date().toISOString()
			}

			await this.adapter.set(LOCK_KEY, newLock)
			return true

		} catch (error) {
			logger.error('Failed to extend migration lock:', error)
			return false
		}
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	/**
	 * Get the current lock from storage.
	 */
	private async getLock(): Promise<{ holder: string; acquiredAt: Date } | null> {
		const data = await this.adapter.get(LOCK_KEY)

		if (!data || typeof data !== 'object') {
			return null
		}

		const lock = data as Record<string, unknown>

		if (typeof lock.holder !== 'string' || !lock.acquiredAt) {
			return null
		}

		return {
			holder: lock.holder,
			acquiredAt: new Date(lock.acquiredAt as string)
		}
	}

	/**
	 * Try to override a stale lock atomically.
	 */
	private async tryOverrideStaleLock(
		newLockId: string,
		existing: { holder: string; acquiredAt: Date }
	): Promise<LockAcquisitionResult> {
		const newLock: MigrationLock = {
			holder: newLockId,
			acquiredAt: new Date().toISOString()
		}

		// Try CAS if available
		if (typeof (this.adapter as any).compareAndSwap === 'function') {
			const expectedValue = {
				holder: existing.holder,
				acquiredAt: existing.acquiredAt.toISOString()
			}

			try {
				const success = await (this.adapter as any).compareAndSwap(
					LOCK_KEY,
					expectedValue,
					newLock
				)

				if (success) {
					logger.info('Successfully overrode stale migration lock')
					return { acquired: true, lockId: newLockId }
				} else {
					// Someone else beat us to it
					return {
						acquired: false,
						reason: 'race'
					}
				}
			} catch {
				// CAS not supported or failed
			}
		}

		// Fallback: check-then-set with small race window
		const recheck = await this.getLock()
		if (recheck?.holder !== existing.holder) {
			// Lock changed while we were checking
			return {
				acquired: false,
				reason: 'race',
				holder: recheck?.holder,
				acquiredAt: recheck?.acquiredAt
			}
		}

		// Override the stale lock
		await this.adapter.set(LOCK_KEY, newLock)
		logger.info('Successfully overrode stale migration lock (non-atomic)')
		return { acquired: true, lockId: newLockId }
	}

	/**
	 * Try to acquire a new lock (no existing lock).
	 */
	private async tryAcquireNewLock(lockId: string): Promise<LockAcquisitionResult> {
		const newLock: MigrationLock = {
			holder: lockId,
			acquiredAt: new Date().toISOString()
		}

		// Try setIfNotExists if available
		if (typeof (this.adapter as any).setIfNotExists === 'function') {
			try {
				const success = await (this.adapter as any).setIfNotExists(LOCK_KEY, newLock)

				if (success) {
					return { acquired: true, lockId }
				} else {
					// Someone else acquired the lock
					const current = await this.getLock()
					return {
						acquired: false,
						reason: 'race',
						holder: current?.holder,
						acquiredAt: current?.acquiredAt
					}
				}
			} catch {
				// setIfNotExists not supported or failed
			}
		}

		// Fallback: check-then-set with small race window
		const finalCheck = await this.getLock()
		if (finalCheck) {
			return {
				acquired: false,
				reason: 'race',
				holder: finalCheck.holder,
				acquiredAt: finalCheck.acquiredAt
			}
		}

		// Acquire the lock
		await this.adapter.set(LOCK_KEY, newLock)
		return { acquired: true, lockId }
	}
}
