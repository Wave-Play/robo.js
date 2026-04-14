/**
 * Phase 7: Migration Lock Tests
 *
 * Tests for the MigrationLockManager which provides distributed locking
 * for migration operations to prevent concurrent migrations.
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { MigrationLockManager } from '../../src/migrations/lock.js'
import { MemoryAdapter } from 'robo.js/flashcore'

describe('MigrationLockManager', () => {
	let adapter: MemoryAdapter
	let lockManager: MigrationLockManager

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		lockManager = new MigrationLockManager(adapter)
	})

	describe('acquire', () => {
		it('should acquire lock when none exists', async () => {
			const result = await lockManager.acquire()

			expect(result.acquired).toBe(true)
			expect(result.lockId).toBeDefined()
			expect(typeof result.lockId).toBe('string')
		})

		it('should fail to acquire when lock is held', async () => {
			const first = await lockManager.acquire()
			expect(first.acquired).toBe(true)

			const second = await lockManager.acquire()
			expect(second.acquired).toBe(false)
			expect(second.reason).toBe('held')
			expect(second.holder).toBe(first.lockId)
		})

		it('should allow acquiring after release', async () => {
			const first = await lockManager.acquire()
			expect(first.acquired).toBe(true)

			await lockManager.release(first.lockId!)

			const second = await lockManager.acquire()
			expect(second.acquired).toBe(true)
		})
	})

	describe('release', () => {
		it('should release lock when called with correct lockId', async () => {
			const result = await lockManager.acquire()
			expect(result.acquired).toBe(true)

			const released = await lockManager.release(result.lockId!)
			expect(released).toBe(true)

			const status = await lockManager.isLocked()
			expect(status.locked).toBe(false)
		})

		it('should not release lock when called with wrong lockId', async () => {
			const result = await lockManager.acquire()
			expect(result.acquired).toBe(true)

			const released = await lockManager.release('wrong-id')
			expect(released).toBe(false)

			const status = await lockManager.isLocked()
			expect(status.locked).toBe(true)
		})

		it('should return true when no lock exists', async () => {
			const released = await lockManager.release('any-id')
			expect(released).toBe(true)
		})
	})

	describe('forceRelease', () => {
		it('should force release any lock', async () => {
			const result = await lockManager.acquire()
			expect(result.acquired).toBe(true)

			await lockManager.forceRelease()

			const status = await lockManager.isLocked()
			expect(status.locked).toBe(false)
		})
	})

	describe('isLocked', () => {
		it('should return locked: false when no lock', async () => {
			const status = await lockManager.isLocked()
			expect(status.locked).toBe(false)
		})

		it('should return locked: true with holder info when locked', async () => {
			const result = await lockManager.acquire()

			const status = await lockManager.isLocked()
			expect(status.locked).toBe(true)
			expect(status.holder).toBe(result.lockId)
			expect(status.acquiredAt).toBeDefined()
		})

		it('should detect stale locks', async () => {
			// Create a lock manager with very short timeout
			const shortTimeoutManager = new MigrationLockManager(adapter, {
				timeoutMs: 1 // 1ms timeout
			})

			await shortTimeoutManager.acquire()

			// Wait for lock to become stale
			await new Promise((resolve) => setTimeout(resolve, 10))

			const status = await shortTimeoutManager.isLocked()
			expect(status.locked).toBe(true)
			expect(status.stale).toBe(true)
		})
	})

	describe('extend', () => {
		it('should extend lock when called with correct lockId', async () => {
			const result = await lockManager.acquire()
			expect(result.acquired).toBe(true)

			const extended = await lockManager.extend(result.lockId!)
			expect(extended).toBe(true)
		})

		it('should fail to extend when called with wrong lockId', async () => {
			const result = await lockManager.acquire()
			expect(result.acquired).toBe(true)

			const extended = await lockManager.extend('wrong-id')
			expect(extended).toBe(false)
		})

		it('should fail to extend when no lock exists', async () => {
			const extended = await lockManager.extend('any-id')
			expect(extended).toBe(false)
		})
	})

	describe('stale lock override', () => {
		it('should override stale lock', async () => {
			// Create a lock manager with very short timeout
			const shortTimeoutManager = new MigrationLockManager(adapter, {
				timeoutMs: 1 // 1ms timeout
			})

			const first = await shortTimeoutManager.acquire()
			expect(first.acquired).toBe(true)

			// Wait for lock to become stale
			await new Promise((resolve) => setTimeout(resolve, 10))

			const second = await shortTimeoutManager.acquire()
			expect(second.acquired).toBe(true)
			expect(second.lockId).not.toBe(first.lockId)
		})
	})
})
