/**
 * Schema Migration System for @robojs/xp
 *
 * This module handles versioned data migrations for the XP plugin. Migrations run automatically
 * when data is accessed via getUser() or getConfig(), ensuring backward compatibility across
 * plugin versions.
 *
 * @module store/migrations
 *
 * ## Architecture
 *
 * - **Per-Guild, Per-Store**: Each (guildId, storeId) pair has an independent schema version
 * - **Sequential Execution**: Migrations run in order (e.g., v1→v2→v3) to support multi-version upgrades
 * - **On-Demand Strategy**: Migrations trigger lazily when data is accessed, not at boot time
 * - **Idempotent**: Safe to run multiple times; schema version prevents re-execution
 *
 * ## Adding New Migrations
 *
 * When incrementing SCHEMA_VERSION, add a migration function:
 *
 * ```typescript
 * async function migrateV2ToV3(guildId: string, options?: FlashcoreOptions): Promise<void> {
 *   const storeId = resolveStoreId(options)
 *   logger.info(`Migrating guild ${guildId} store ${storeId} from v2 to v3`)
 *
 *   // Load all users
 *   const members = await getMembers(guildId, options)
 *
 *   // Modify data structure
 *   for (const userId of members) {
 *     const user = await getUser(guildId, userId, options)
 *     if (user) {
 *       const updated = { ...user, newField: defaultValue }
 *       await putUser(guildId, userId, updated, options)
 *     }
 *   }
 * }
 *
 * // Register migration
 * migrations.set(3, migrateV2ToV3)
 * ```
 *
 * ## Error Handling
 *
 * - Migrations wrap operations in try-catch blocks
 * - Schema version only updates on successful completion
 * - Failed migrations are safe to retry (schema version unchanged)
 * - Errors include context: guildId, storeId, target version
 */

import { Flashcore } from 'robo.js'
import type { FlashcoreOptions } from '../types.js'
import { resolveStoreId } from '../types.js'
import { xpLogger } from '../core/logger.js'

/**
 * Current schema version for future migrations
 * Must match SCHEMA_VERSION in index.ts
 */
export const SCHEMA_VERSION = 1

/**
 * Gets the current schema version for a guild/store
 * Internal helper to avoid circular dependency with index.ts
 */
async function getSchemaVersion(guildId: string, options?: FlashcoreOptions): Promise<number> {
	const storeId = resolveStoreId(options)
	const version = await Flashcore.get<number>('schema', { namespace: ['xp', storeId, guildId] })
	if (version == null) {
		// Persist baseline version on first access
		await setSchemaVersion(guildId, 1, { storeId })
		return 1
	}
	return version
}

/**
 * Sets the schema version for a guild/store
 * Internal helper to avoid circular dependency with index.ts
 */
async function setSchemaVersion(guildId: string, version: number, options?: FlashcoreOptions): Promise<void> {
	const storeId = resolveStoreId(options)
	await Flashcore.set('schema', version, { namespace: ['xp', storeId, guildId] })
}

/**
 * Migration function type definition
 *
 * @param guildId - Discord guild ID to migrate
 * @param options - Flashcore options (includes storeId for multi-store support)
 * @returns Promise that resolves when migration completes
 *
 * @example
 * ```typescript
 * const migrateV1ToV2: MigrationFunction = async (guildId, options) => {
 *   // Migration logic here
 * }
 * ```
 */
export type MigrationFunction = (guildId: string, options?: FlashcoreOptions) => Promise<void>

/**
 * Migration registry mapping version numbers to migration functions
 *
 * - Key: Target version number (e.g., 2 for v1→v2 migration)
 * - Value: Async migration function
 *
 * @example
 * ```typescript
 * migrations.set(2, migrateV1ToV2)
 * migrations.set(3, migrateV2ToV3)
 * ```
 */
const migrations = new Map<number, MigrationFunction>()

/**
 * Checks if a guild's data needs migration
 *
 * Compares the stored schema version with the current SCHEMA_VERSION constant.
 * Returns true if stored version is older than current version.
 *
 * @param guildId - Discord guild ID to check
 * @param options - Flashcore options (includes storeId)
 * @returns True if migration needed, false otherwise
 *
 * @example
 * ```typescript
 * if (await needsMigration(guildId, { storeId: 'custom' })) {
 *   await migrateGuildData(guildId, currentVersion, SCHEMA_VERSION, { storeId: 'custom' })
 * }
 * ```
 */
export async function needsMigration(guildId: string, options?: FlashcoreOptions): Promise<boolean> {
	const currentVersion = await getSchemaVersion(guildId, options)
	return currentVersion < SCHEMA_VERSION
}

/**
 * Migrates guild data from one schema version to another
 *
 * Executes migrations sequentially from fromVersion+1 to toVersion (inclusive).
 * Updates schema version after each successful migration step.
 *
 * ## Execution Flow
 *
 * 1. Validate input versions (fromVersion < toVersion, both positive)
 * 2. Loop from (fromVersion + 1) to toVersion
 * 3. Look up migration function in registry
 * 4. Execute migration function
 * 5. Update schema version on success
 * 6. Log migration step
 *
 * ## Error Handling
 *
 * - Throws error if migration function not found in registry
 * - Throws error if migration execution fails
 * - Schema version only updates on successful migration
 * - Failed migrations are safe to retry
 *
 * @param guildId - Discord guild ID to migrate
 * @param fromVersion - Current schema version
 * @param toVersion - Target schema version
 * @param options - Flashcore options (includes storeId)
 * @throws Error if fromVersion >= toVersion
 * @throws Error if migration function not found
 * @throws Error if migration execution fails
 *
 * @example
 * ```typescript
 * // Migrate from v1 to v3 (runs v1→v2, then v2→v3)
 * await migrateGuildData('123456789', 1, 3, { storeId: 'default' })
 * ```
 */
// In-progress migration locks per guild/store to prevent duplicate concurrent runs
const migrationLocks = new Map<string, Promise<void>>()

export async function migrateGuildData(
	guildId: string,
	fromVersion: number,
	toVersion: number,
	options?: FlashcoreOptions
): Promise<void> {
	// Validate inputs
	if (fromVersion >= toVersion) {
		throw new Error(`Invalid migration range: fromVersion (${fromVersion}) must be less than toVersion (${toVersion})`)
	}

	if (fromVersion < 0 || toVersion < 0) {
		throw new Error(`Invalid migration versions: both must be positive integers (from: ${fromVersion}, to: ${toVersion})`)
	}

	const storeId = resolveStoreId(options)
	const key = `${guildId}:${storeId}`

	// If a migration is already in progress for this key, wait for it and return
	const inProgress = migrationLocks.get(key)
	if (inProgress) {
		await inProgress
		return
	}

	// Create and register a promise representing this migration run
	const run = (async () => {
		// Execute migrations sequentially
		for (let version = fromVersion + 1; version <= toVersion; version++) {
			const migrationFn = migrations.get(version)

			if (!migrationFn) {
				throw new Error(
					`No migration defined for version ${version}. Cannot migrate guild ${guildId} store ${storeId} from v${fromVersion} to v${toVersion}`
				)
			}

			try {
				xpLogger.debug(`Running migration v${version - 1}→v${version} for guild ${guildId} store ${storeId}`)
				await migrationFn(guildId, options)

				// Update schema version after successful migration
				await setSchemaVersion(guildId, version, options)

				xpLogger.info(`Migrated guild ${guildId} store ${storeId} from v${version - 1} to v${version}`)
			} catch (error) {
				xpLogger.error(
					`Migration v${version - 1}→v${version} failed for guild ${guildId} store ${storeId}:`,
					error
				)
				throw error
			}
		}
	})()

	migrationLocks.set(key, run)
	try {
		await run
	} finally {
		migrationLocks.delete(key)
	}
}

/**
 * Example migration: v1 → v2 (No-op)
 *
 * This is a template migration demonstrating the migration pattern.
 * No actual data changes are needed for v2.
 *
 * ## Future Migration Pattern
 *
 * When adding real migrations:
 * 1. Load affected data (users, config, members)
 * 2. Transform data structure
 * 3. Write updated data back to Flashcore
 * 4. Schema version updates automatically via migrateGuildData()
 *
 * @param guildId - Discord guild ID to migrate
 * @param options - Flashcore options (includes storeId)
 *
 * @example
 * ```typescript
 * // Real migration example:
 * async function migrateV1ToV2(guildId: string, options?: FlashcoreOptions): Promise<void> {
 *   const storeId = resolveStoreId(options)
 *   logger.debug(`Running v1→v2 migration for guild ${guildId} store ${storeId}`)
 *
 *   const members = await getMembers(guildId, options)
 *   for (const userId of members) {
 *     const user = await getUser(guildId, userId, options)
 *     if (user) {
 *       // Add new field
 *       const updated = { ...user, newField: defaultValue }
 *       await putUser(guildId, userId, updated, options)
 *     }
 *   }
 * }
 * ```
 */
async function migrateV1ToV2(guildId: string, options?: FlashcoreOptions): Promise<void> {
	const storeId = resolveStoreId(options)
	xpLogger.debug(`Running v1→v2 migration (no-op) for guild ${guildId} store ${storeId}`)

	// Example migration - no data changes needed for v2
	// Future migrations should modify user data, config, or members as needed

	// Schema version will be updated automatically by migrateGuildData()
}

// Register migrations
// Add new migrations here when incrementing SCHEMA_VERSION
migrations.set(2, migrateV1ToV2)
