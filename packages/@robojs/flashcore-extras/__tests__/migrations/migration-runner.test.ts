/**
 * Phase 7: Migration Runner Tests
 *
 * Tests for MigrationRunner which handles migration execution,
 * lock management, and rollback on failure.
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { MigrationRunner } from '../../src/migrations/runner.js'
import { defineMigration } from '../../src/migrations/define.js'
import { MemoryAdapter } from 'robo.js/flashcore'
import type { RegisteredMigration } from '../../src/migrations/types.js'

describe('MigrationRunner', () => {
	let adapter: MemoryAdapter
	let migrations: RegisteredMigration[]

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		migrations = []
	})

	function createRunner() {
		return new MigrationRunner(adapter, {
			getMigrations: () => migrations
		})
	}

	describe('runPending', () => {
		it('should return empty array when no migrations', async () => {
			const runner = createRunner()
			const results = await runner.runPending()

			expect(results).toEqual([])
		})

		it('should run pending migrations in order', async () => {
			const order: string[] = []

			migrations = [
				defineMigration({
					name: '001_first',
					async up() {
						order.push('first')
					}
				}),
				defineMigration({
					name: '002_second',
					async up() {
						order.push('second')
					}
				})
			]

			const runner = createRunner()
			const results = await runner.runPending()

			expect(results).toHaveLength(2)
			expect(results[0].status).toBe('success')
			expect(results[1].status).toBe('success')
			expect(order).toEqual(['first', 'second'])
		})

		it('should skip already applied migrations', async () => {
			const runCount = { first: 0, second: 0 }

			migrations = [
				defineMigration({
					name: '001_first',
					async up() {
						runCount.first++
					}
				}),
				defineMigration({
					name: '002_second',
					async up() {
						runCount.second++
					}
				})
			]

			const runner = createRunner()

			// Run first time
			await runner.runPending()

			// Run second time
			const results = await runner.runPending()

			expect(results).toHaveLength(0) // No pending migrations
			expect(runCount.first).toBe(1)
			expect(runCount.second).toBe(1)
		})

		it('should stop on first failure', async () => {
			const order: string[] = []

			migrations = [
				defineMigration({
					name: '001_first',
					async up() {
						order.push('first')
					}
				}),
				defineMigration({
					name: '002_fails',
					async up() {
						order.push('fails')
						throw new Error('Migration failed')
					}
				}),
				defineMigration({
					name: '003_third',
					async up() {
						order.push('third') // Should not run
					}
				})
			]

			const runner = createRunner()
			const results = await runner.runPending()

			expect(results).toHaveLength(2) // first + fails
			expect(results[0].status).toBe('success')
			expect(results[1].status).toBe('failed')
			expect(order).toEqual(['first', 'fails'])
		})

		it('should support dry run mode', async () => {
			const runCount = { migration: 0 }

			migrations = [
				defineMigration({
					name: '001_test',
					async up() {
						runCount.migration++
					}
				})
			]

			const runner = createRunner()
			const results = await runner.runPending({ dryRun: true })

			expect(results).toHaveLength(1)
			expect(results[0].status).toBe('skipped')
			expect(runCount.migration).toBe(0) // Should not have run
		})

		it('should support target option', async () => {
			const order: string[] = []

			migrations = [
				defineMigration({
					name: '001_first',
					async up() {
						order.push('first')
					}
				}),
				defineMigration({
					name: '002_second',
					async up() {
						order.push('second')
					}
				}),
				defineMigration({
					name: '003_third',
					async up() {
						order.push('third')
					}
				})
			]

			const runner = createRunner()
			const results = await runner.runPending({ target: '002_second' })

			expect(results).toHaveLength(2)
			expect(order).toEqual(['first', 'second'])
		})

		it('should attempt rollback on failure if down exists', async () => {
			let rolledBack = false

			migrations = [
				defineMigration({
					name: '001_fails',
					async up() {
						throw new Error('Failed')
					},
					async down() {
						rolledBack = true
					}
				})
			]

			const runner = createRunner()
			const results = await runner.runPending()

			expect(results[0].status).toBe('failed')
			expect(results[0].rollbackAttempted).toBe(true)
			expect(rolledBack).toBe(true)
		})
	})

	describe('rollback', () => {
		it('should rollback applied migration', async () => {
			let rolledBack = false

			migrations = [
				defineMigration({
					name: '001_to_rollback',
					async up() {},
					async down() {
						rolledBack = true
					}
				})
			]

			const runner = createRunner()
			await runner.runPending()

			const result = await runner.rollback('001_to_rollback')

			expect(result.status).toBe('success')
			expect(rolledBack).toBe(true)
		})

		it('should fail if migration not found', async () => {
			const runner = createRunner()
			const result = await runner.rollback('nonexistent')

			expect(result.status).toBe('failed')
			expect(result.error).toContain('not found')
		})

		it('should fail if migration not applied', async () => {
			migrations = [
				defineMigration({
					name: '001_not_applied',
					async up() {},
					async down() {}
				})
			]

			const runner = createRunner()
			const result = await runner.rollback('001_not_applied')

			expect(result.status).toBe('failed')
			expect(result.error).toContain('has not been applied')
		})

		it('should fail if no down function', async () => {
			migrations = [
				defineMigration({
					name: '001_no_down',
					async up() {}
					// No down function
				})
			]

			const runner = createRunner()
			await runner.runPending()

			const result = await runner.rollback('001_no_down')

			expect(result.status).toBe('failed')
			expect(result.error).toContain('does not have a rollback')
		})
	})

	describe('getStatus', () => {
		it('should report pending migrations', async () => {
			migrations = [
				defineMigration({
					name: '001_pending',
					async up() {}
				})
			]

			const runner = createRunner()
			const status = await runner.getStatus()

			expect(status.pending).toContain('001_pending')
			expect(status.completed).toHaveLength(0)
		})

		it('should report completed migrations', async () => {
			migrations = [
				defineMigration({
					name: '001_completed',
					async up() {}
				})
			]

			const runner = createRunner()
			await runner.runPending()

			const status = await runner.getStatus()

			expect(status.completed).toContain('001_completed')
			expect(status.pending).toHaveLength(0)
		})

		it('should report lock status', async () => {
			const runner = createRunner()
			const status = await runner.getStatus()

			expect(status.lockStatus).toBeDefined()
			expect(status.lockStatus.locked).toBe(false)
		})
	})

	describe('forceUnlock', () => {
		it('should release migration lock', async () => {
			const runner = createRunner()

			// Force unlock should succeed even if no lock
			const result = await runner.forceUnlock()
			expect(result).toBe(true)
		})
	})

	describe('code drift detection', () => {
		it('should detect modified migration after application', async () => {
			// First, apply migration with original checksum
			migrations = [
				defineMigration({
					name: '001_original',
					async up() {
						// Original code
					}
				})
			]

			const runner = createRunner()
			await runner.runPending()

			// Simulate code change by creating new migration with different checksum
			migrations = [
				defineMigration({
					name: '001_original',
					async up() {
						// Modified code - different checksum
						console.log('modified')
					}
				})
			]

			// Should throw when trying to run with modified migration
			await expect(runner.runPending()).rejects.toThrow(/modified/)
		})
	})
})
