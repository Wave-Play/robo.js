/**
 * Flashcore v1 (spec rev 4.3) Migration Runner
 *
 * Orchestrates migration execution with lock management, status tracking,
 * and rollback on failure.
 */

import type { FlashcoreAdapter } from 'robo.js/flashcore'
import { MigrationError } from 'robo.js/flashcore'
import type {
	RegisteredMigration,
	MigrationMetadata,
	MigrationResult,
	MigrationRunOptions,
	MigrationRunnerOptions,
	MigrationStatusReport,
	MigrationContext,
	MigrationModelAccessor
} from './types.js'
import { MigrationLockManager } from './lock.js'
import { extrasLogger as logger } from '../core/logger.js'

/**
 * Storage key prefix for migration metadata.
 */
const MIGRATION_PREFIX = '_flashcore:migrations:'

/**
 * Migration runner class.
 *
 * Handles:
 * - Lock acquisition/release
 * - Pending migration discovery
 * - Migration execution with status tracking
 * - Rollback on failure
 * - Dry-run mode
 */
export class MigrationRunner {
	private readonly lockManager: MigrationLockManager
	private readonly getMigrations: () => RegisteredMigration[]
	private readonly getModelAccessor?: <T extends { id: string }>(name: string) => MigrationModelAccessor<T>

	constructor(
		private readonly adapter: FlashcoreAdapter,
		options?: MigrationRunnerOptions
	) {
		this.lockManager = new MigrationLockManager(adapter, {
			timeoutMs: options?.lockTimeoutMs
		})
		this.getMigrations = options?.getMigrations ?? (() => [])
		this.getModelAccessor = options?.getModelAccessor
	}

	// =========================================================================
	// Public API
	// =========================================================================

	/**
	 * Run all pending migrations.
	 *
	 * @param options - Run options (dryRun, forceUnlock, target)
	 * @returns Results for each migration attempted
	 */
	async runPending(options: MigrationRunOptions = {}): Promise<MigrationResult[]> {
		const { dryRun = false, forceUnlock = false, target } = options

		// Force unlock if requested
		if (forceUnlock) {
			await this.lockManager.forceRelease()
		}

		// Acquire lock
		const lockResult = await this.lockManager.acquire()

		if (!lockResult.acquired) {
			throw new MigrationError(
				'Another migration is in progress. ' +
				`Lock held by: ${lockResult.holder}. ` +
				"If this is stuck, run: robo db migrate --force-unlock",
				{ phase: 'lock' }
			)
		}

		const lockId = lockResult.lockId!
		const results: MigrationResult[] = []

		try {
			// Get pending migrations
			const pending = await this.getPendingMigrations()

			if (pending.length === 0) {
				logger.info('No pending migrations')
				return []
			}

			logger.info(`Found ${pending.length} pending migration(s)`)

			// Filter to target if specified
			const toRun = target
				? pending.filter((m, i) => {
						const targetIndex = pending.findIndex(p => p.name === target)
						return targetIndex >= 0 && i <= targetIndex
				  })
				: pending

			// Run each migration
			for (const migration of toRun) {
				const result = await this.runMigration(migration, { dryRun, lockId })
				results.push(result)

				// Stop on first failure
				if (result.status === 'failed') {
					logger.error(`Migration '${migration.name}' failed, stopping`)
					break
				}

				// Extend lock after each successful migration
				if (!dryRun) {
					await this.lockManager.extend(lockId)
				}
			}

			return results

		} finally {
			// Always release lock
			await this.lockManager.release(lockId)
		}
	}

	/**
	 * Roll back a specific migration.
	 *
	 * @param migrationName - Name of migration to roll back
	 * @returns Result of rollback attempt
	 */
	async rollback(migrationName: string): Promise<MigrationResult> {
		// Acquire lock
		const lockResult = await this.lockManager.acquire()

		if (!lockResult.acquired) {
			throw new MigrationError(
				'Cannot rollback: another migration is in progress',
				{ phase: 'lock', migrationName }
			)
		}

		const lockId = lockResult.lockId!

		try {
			// Find the migration
			const migrations = this.getMigrations()
			const migration = migrations.find(m => m.name === migrationName)

			if (!migration) {
				return {
					name: migrationName,
					status: 'failed',
					error: `Migration '${migrationName}' not found`,
					durationMs: 0
				}
			}

			// Check if migration was applied
			const metadata = await this.getMigrationMetadata(migrationName)

			if (!metadata || metadata.status !== 'completed') {
				return {
					name: migrationName,
					status: 'failed',
					error: `Migration '${migrationName}' has not been applied`,
					durationMs: 0
				}
			}

			// Check for down function
			if (!migration.down) {
				return {
					name: migrationName,
					status: 'failed',
					error: `Migration '${migrationName}' does not have a rollback (down) function`,
					durationMs: 0
				}
			}

			const startTime = Date.now()

			// Run rollback
			try {
				logger.info(`Rolling back migration: ${migrationName}`)
				await migration.down(this.createContext())

				// Update status
				await this.setMigrationMetadata(migrationName, {
					...metadata,
					status: 'pending',
					rollbackAttempted: true,
					appliedAt: undefined
				})

				return {
					name: migrationName,
					status: 'success',
					durationMs: Date.now() - startTime
				}

			} catch (error) {
				return {
					name: migrationName,
					status: 'failed',
					error: String(error),
					rollbackAttempted: true,
					durationMs: Date.now() - startTime
				}
			}

		} finally {
			await this.lockManager.release(lockId)
		}
	}

	/**
	 * Get the current migration status report.
	 *
	 * @returns Status report with pending, completed, and failed migrations
	 */
	async getStatus(): Promise<MigrationStatusReport> {
		const migrations = this.getMigrations()
		const pending: string[] = []
		const completed: string[] = []
		const failed: string[] = []

		for (const migration of migrations) {
			const metadata = await this.getMigrationMetadata(migration.name)

			if (!metadata || metadata.status === 'pending') {
				pending.push(migration.name)
			} else if (metadata.status === 'completed') {
				completed.push(migration.name)
			} else if (metadata.status === 'failed') {
				failed.push(migration.name)
			} else if (metadata.status === 'running') {
				// Running migrations are treated as failed (stale)
				failed.push(migration.name)
			}
		}

		const lockStatus = await this.lockManager.isLocked()

		return {
			pending,
			completed,
			failed,
			lockStatus: {
				locked: lockStatus.locked,
				holder: lockStatus.holder,
				acquiredAt: lockStatus.acquiredAt,
				stale: lockStatus.stale
			}
		}
	}

	/**
	 * Force unlock the migration lock.
	 *
	 * @returns True if unlocked
	 */
	async forceUnlock(): Promise<boolean> {
		await this.lockManager.forceRelease()
		return true
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	/**
	 * Get all pending migrations in order.
	 */
	private async getPendingMigrations(): Promise<RegisteredMigration[]> {
		const migrations = this.getMigrations()
		const pending: RegisteredMigration[] = []

		for (const migration of migrations) {
			const metadata = await this.getMigrationMetadata(migration.name)

			// Check for code drift
			if (metadata?.status === 'completed' && metadata.checksum !== migration.checksum) {
				throw new MigrationError(
					`Migration '${migration.name}' has been modified since it was applied. ` +
					'This could indicate data inconsistency.',
					{ migrationName: migration.name }
				)
			}

			if (!metadata || metadata.status === 'pending') {
				pending.push(migration)
			}
		}

		return pending
	}

	/**
	 * Run a single migration.
	 */
	private async runMigration(
		migration: RegisteredMigration,
		options: { dryRun: boolean; lockId: string }
	): Promise<MigrationResult> {
		const { dryRun } = options
		const startTime = Date.now()

		// Dry run: just report what would happen
		if (dryRun) {
			logger.info(`[DRY RUN] Would run migration: ${migration.name}`)
			return {
				name: migration.name,
				status: 'skipped',
				durationMs: 0
			}
		}

		logger.info(`Running migration: ${migration.name}`)

		// Mark as running
		await this.setMigrationMetadata(migration.name, {
			name: migration.name,
			status: 'running',
			checksum: migration.checksum
		})

		try {
			// Run the migration
			await migration.up(this.createContext())

			// Mark as completed
			await this.setMigrationMetadata(migration.name, {
				name: migration.name,
				status: 'completed',
				checksum: migration.checksum,
				appliedAt: new Date().toISOString()
			})

			logger.info(`Migration completed: ${migration.name}`)

			return {
				name: migration.name,
				status: 'success',
				durationMs: Date.now() - startTime
			}

		} catch (error) {
			// Mark as failed
			await this.setMigrationMetadata(migration.name, {
				name: migration.name,
				status: 'failed',
				checksum: migration.checksum,
				error: String(error)
			})

			// Attempt rollback if down() exists
			let rollbackAttempted = false
			if (migration.down) {
				logger.info(`Attempting rollback of '${migration.name}'...`)
				try {
					await migration.down(this.createContext())

					// Reset to pending
					await this.setMigrationMetadata(migration.name, {
						name: migration.name,
						status: 'pending',
						checksum: migration.checksum,
						rollbackAttempted: true
					})

					logger.info(`Rollback of '${migration.name}' succeeded`)
					rollbackAttempted = true

				} catch (rollbackError) {
					logger.error(`Rollback of '${migration.name}' failed: ${rollbackError}`)
					rollbackAttempted = true
				}
			}

			return {
				name: migration.name,
				status: 'failed',
				error: String(error),
				rollbackAttempted,
				durationMs: Date.now() - startTime
			}
		}
	}

	/**
	 * Create a migration context for up/down functions.
	 */
	private createContext(): MigrationContext {
		const self = this

		return {
			model<T extends { id: string }>(name: string): MigrationModelAccessor<T> {
				if (self.getModelAccessor) {
					return self.getModelAccessor<T>(name)
				}

				// Return a no-op accessor if not configured
				return {
					async findMany(): Promise<T[]> { return [] },
					async findUnique(): Promise<T | null> { return null },
					async update(): Promise<T | null> { return null },
					async updateMany(): Promise<number> { return 0 },
					async delete(): Promise<T | null> { return null },
					async deleteMany(): Promise<number> { return 0 },
					async count(): Promise<number> { return 0 }
				}
			},

			async raw(operation: string): Promise<void> {
				logger.warn(`Raw migration operation: ${operation}`)
				// Raw operations are intentionally limited for safety
				// Actual implementation would parse and execute
			},

			progress(message: string): void {
				logger.info(`  ${message}`)
			},

			async batch<T>(
				items: T[],
				batchSize: number,
				fn: (batch: T[]) => Promise<void>
			): Promise<void> {
				for (let i = 0; i < items.length; i += batchSize) {
					const batch = items.slice(i, i + batchSize)
					await fn(batch)
					logger.info(`  Processed ${Math.min(i + batchSize, items.length)}/${items.length}`)
				}
			},

			adapter: self.adapter
		}
	}

	/**
	 * Get metadata for a specific migration.
	 */
	private async getMigrationMetadata(name: string): Promise<MigrationMetadata | null> {
		const key = `${MIGRATION_PREFIX}${name}`
		const data = await this.adapter.get(key)

		if (!data || typeof data !== 'object') {
			return null
		}

		const obj = data as Record<string, unknown>

		return {
			name: obj.name as string,
			status: obj.status as MigrationMetadata['status'],
			checksum: obj.checksum as string,
			appliedAt: obj.appliedAt as string | undefined,
			error: obj.error as string | undefined,
			rollbackAttempted: obj.rollbackAttempted as boolean | undefined
		}
	}

	/**
	 * Set metadata for a specific migration.
	 */
	private async setMigrationMetadata(
		name: string,
		metadata: MigrationMetadata
	): Promise<void> {
		const key = `${MIGRATION_PREFIX}${name}`
		await this.adapter.set(key, metadata)
	}
}

/**
 * Create a migration runner with model access.
 *
 * @param adapter - Flashcore adapter
 * @param models - Map of model name to model instance
 * @param migrations - Array of registered migrations
 * @returns Configured migration runner
 */
export function createMigrationRunner(
	adapter: FlashcoreAdapter,
	models: Map<string, { findMany: Function; findUnique: Function; update: Function; delete: Function; count: Function }>,
	migrations: RegisteredMigration[]
): MigrationRunner {
	return new MigrationRunner(adapter, {
		getMigrations: () => migrations,
		getModelAccessor: <T extends { id: string }>(name: string) => {
			const model = models.get(name)
			if (!model) {
				throw new MigrationError(
					`Model '${name}' not found in migration context`,
					{ phase: 'up' }
				)
			}

			return {
				findMany: model.findMany.bind(model),
				findUnique: model.findUnique.bind(model),
				update: model.update.bind(model),
				updateMany: async (args: any) => {
					// Implement updateMany via findMany + update
					const records = await model.findMany({ where: args.where })
					let count = 0
					for (const record of records) {
						await model.update({ where: { id: (record as any).id }, data: args.data })
						count++
					}
					return count
				},
				delete: model.delete.bind(model),
				deleteMany: async (args: any) => {
					// Implement deleteMany via findMany + delete
					const records = await model.findMany({ where: args.where })
					let count = 0
					for (const record of records) {
						await model.delete({ where: { id: (record as any).id } })
						count++
					}
					return count
				},
				count: model.count.bind(model)
			} as MigrationModelAccessor<T>
		}
	})
}
