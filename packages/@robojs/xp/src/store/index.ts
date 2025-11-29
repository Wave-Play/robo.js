/**
 * Flashcore CRUD operations for XP data persistence
 *
 * Uses Flashcore key-value store with array namespaces for hierarchical organization:
 * - Flashcore.get(userId, { namespace: ['xp', storeId, guildId, 'users'] }) -> UserXP data
 * - Flashcore.get('members', { namespace: ['xp', storeId, guildId] }) -> string[] of tracked user IDs
 * - Flashcore.get('config', { namespace: ['xp', storeId, guildId] }) -> GuildConfig
 * - Flashcore.get('config', { namespace: ['xp', 'global'] }) -> GlobalConfig
 * - Flashcore.get('schema', { namespace: ['xp', storeId, guildId] }) -> number (schema version)
 *
 * Multi-store namespace structure:
 * - Default store: ['xp', 'default', guildId, 'users']
 * - Custom store: ['xp', 'reputation', guildId, 'users']
 * - Each store has independent user data, config, members, and schema
 *
 * Internal Flashcore keys (colon-separated):
 * - 'xp:default:guild123:users:user456' (user data - default store)
 * - 'xp:reputation:guild123:users:user456' (user data - custom store)
 * - 'xp:default:guild123:members' (members list - default store)
 * - 'xp:default:guild123:config' (guild config - default store)
 * - 'xp:global:config' (global defaults - shared across all stores)
 * - 'xp:default:guild123:schema' (schema version - default store)
 *
 * Schema migrations run automatically when data is accessed via getUser() or getConfig().
 * Migrations are per-guild, per-store, and execute sequentially (e.g., v1→v2→v3).
 * See src/store/migrations.ts for migration implementation details.
 *
 * Implements caching for guild configs to reduce Flashcore reads.
 * Cache structure: Map<string, GuildConfig> keyed by composite 'guildId:storeId'
 */

import { Flashcore } from 'robo.js'
import pLimit from 'p-limit'
import type { UserXP, GuildConfig, GlobalConfig, FlashcoreOptions } from '../types.js'
import { resolveStoreId } from '../types.js'
import * as migrations from './migrations.js'
import { SCHEMA_VERSION as _SCHEMA_VERSION } from './migrations.js'
import { invalidateCurveCache } from '../math/curves.js'

// Re-export schema version for external use
export const SCHEMA_VERSION = _SCHEMA_VERSION

// Shared concurrency limiter (caps concurrent Flashcore reads across all calls)
const limit = pLimit(100)

/**
 * In-memory cache for guild configurations
 * Key: composite 'guildId:storeId', Value: GuildConfig
 * Example keys: '123456789:default', '123456789:reputation'
 * Reduces Flashcore reads for frequently accessed configs
 */
const configCache = new Map<string, GuildConfig>()

/**
 * Generates cache key for guild and store combination
 * @param guildId - Guild ID
 * @param storeId - Store ID
 * @returns Composite key in format 'guildId:storeId'
 *
 * Note: storeId must not contain ':' to avoid ambiguous keys.
 */
const CACHE_KEY_SEPARATOR = ':'
function getCacheKey(guildId: string, storeId: string): string {
	// Assert constraint to prevent ambiguous keys
	if (storeId.includes(CACHE_KEY_SEPARATOR)) {
		throw new Error("storeId must not contain ':' (used as cache key separator)")
	}
	return `${guildId}${CACHE_KEY_SEPARATOR}${storeId}`
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Invalidates cached config for a specific guild and store
 * Forces next getConfig to read from Flashcore
 *
 * @param guildId - Guild ID to invalidate
 * @param options - Store options (defaults to 'default' store) or { all: true } to clear all stores
 *
 * @example
 * // Invalidate default store
 * invalidateConfigCache('123...')
 *
 * @example
 * // Invalidate specific store
 * invalidateConfigCache('123...', { storeId: 'reputation' })
 *
 * @example
 * // Invalidate all stores for guild
 * invalidateConfigCache('123...', { all: true })
 */
export function invalidateConfigCache(
	guildId: string,
	options?: FlashcoreOptions | { all: true }
): void {
	if (options && 'all' in options && options.all) {
		// Clear all stores for this guild by iterating through keys
		const prefix = `${guildId}${CACHE_KEY_SEPARATOR}`
		const keysToDelete: string[] = []
		for (const key of configCache.keys()) {
			if (key.startsWith(prefix)) {
				keysToDelete.push(key)
			}
		}
		for (const key of keysToDelete) {
			configCache.delete(key)
		}
	} else {
		const storeId = resolveStoreId(options as FlashcoreOptions)
		configCache.delete(getCacheKey(guildId, storeId))
	}
}

/**
 * Clears entire config cache
 * Used when global config changes to force re-merge for all guilds
 */
export function clearConfigCache(): void {
	configCache.clear()
}

// ============================================================================
// User Data CRUD
// ============================================================================

/**
 * Retrieves user XP record for a guild member
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param options - Store options (defaults to 'default' store)
 * @returns UserXP data or null if user not tracked
 *
 * @example
 * // Default store
 * const user = await getUser('123...', '456...')
 * if (user) {
 *   console.log(`Level ${user.level} with ${user.xp} XP`)
 * }
 *
 * @example
 * // Custom store
 * const reputation = await getUser('123...', '456...', { storeId: 'reputation' })
 */
export async function getUser(
	guildId: string,
	userId: string,
	options?: FlashcoreOptions
): Promise<UserXP | null> {
	const storeId = resolveStoreId(options)

	// Check schema version once and migrate if needed
	const currentVersion = await getSchemaVersion(guildId, { storeId })
	if (currentVersion < SCHEMA_VERSION) {
		await migrations.migrateGuildData(guildId, currentVersion, SCHEMA_VERSION, { storeId })
	}

	const data = await Flashcore.get<UserXP>(userId, { namespace: ['xp', storeId, guildId, 'users'] })
	return data ?? null
}

/**
 * Persists user XP record and adds user to members set
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param data - UserXP data to persist
 * @param options - Store options (defaults to 'default' store)
 *
 * @example
 * // Default store
 * await putUser('123...', '456...', {
 *   xp: 1500,
 *   level: 5,
 *   lastAwardedAt: Date.now(),
 *   messages: 423,
 *   xpMessages: 156
 * })
 *
 * @example
 * // Custom store
 * await putUser('123...', '456...', userData, { storeId: 'reputation' })
 */
export async function putUser(
	guildId: string,
	userId: string,
	data: UserXP,
	options?: FlashcoreOptions
): Promise<void> {
	const storeId = resolveStoreId(options)
	await Flashcore.set(userId, data, { namespace: ['xp', storeId, guildId, 'users'] })
	await addMember(guildId, userId, options)
}

/**
 * Deletes user XP record and removes from members set
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param options - Store options (defaults to 'default' store)
 *
 * @example
 * // Default store
 * await deleteUser('123...', '456...') // Resets user's XP progress
 *
 * @example
 * // Custom store
 * await deleteUser('123...', '456...', { storeId: 'reputation' })
 */
export async function deleteUser(
	guildId: string,
	userId: string,
	options?: FlashcoreOptions
): Promise<void> {
	const storeId = resolveStoreId(options)
	await Flashcore.set(userId, undefined, { namespace: ['xp', storeId, guildId, 'users'] })
	await removeMember(guildId, userId, options)
}

/**
 * Loads all user records for a guild
 * Fetches in parallel for better performance with large member sets
 * Used for leaderboard generation and bulk operations
 *
 * @param guildId - Guild ID
 * @param options - Store options (defaults to 'default' store)
 * @returns Map of userId -> UserXP for all tracked members
 *
 * @example
 * // Default store
 * const allUsers = await getAllUsers('123...')
 * const sorted = [...allUsers.entries()]
 *   .sort((a, b) => b[1].xp - a[1].xp)
 *
 * @example
 * // Custom store
 * const reputation = await getAllUsers('123...', { storeId: 'reputation' })
 */
export async function getAllUsers(guildId: string, options?: FlashcoreOptions): Promise<Map<string, UserXP>> {
	const members = await getMembers(guildId, options)
	const result = new Map<string, UserXP>()

	// Use shared rate limiter to cap concurrent Flashcore reads at 100 globally

	// Fetch all user records in parallel with rate limiting
	const promises = Array.from(members).map((userId) =>
		limit(() => getUser(guildId, userId, options))
	)
	const users = await Promise.all(promises)

	// Populate result map
	let index = 0
	for (const userId of members) {
		const user = users[index++]
		if (user) {
			result.set(userId, user)
		}
	}

	return result
}

// ============================================================================
// Members Set Management
// ============================================================================

/**
 * Adds user ID to tracked members set
 * Idempotent - safe to call multiple times
 *
 * @param guildId - Guild ID
 * @param userId - User ID to add
 * @param options - Store options (defaults to 'default' store)
 */
export async function addMember(guildId: string, userId: string, options?: FlashcoreOptions): Promise<void> {
	const storeId = resolveStoreId(options)
	const arr = (await Flashcore.get<string[]>('members', { namespace: ['xp', storeId, guildId] })) ?? []
	const members = new Set(arr)
	members.add(userId)
	await Flashcore.set('members', Array.from(members), { namespace: ['xp', storeId, guildId] })
}

/**
 * Removes user ID from tracked members set
 * Idempotent - safe to call even if user not in set
 *
 * @param guildId - Guild ID
 * @param userId - User ID to remove
 * @param options - Store options (defaults to 'default' store)
 */
export async function removeMember(guildId: string, userId: string, options?: FlashcoreOptions): Promise<void> {
	const storeId = resolveStoreId(options)
	const arr = await Flashcore.get<string[]>('members', { namespace: ['xp', storeId, guildId] })
	if (arr) {
		const members = new Set(arr)
		members.delete(userId)
		await Flashcore.set('members', Array.from(members), { namespace: ['xp', storeId, guildId] })
	}
}

/**
 * Retrieves all tracked member IDs for a guild
 *
 * @param guildId - Guild ID
 * @param options - Store options (defaults to 'default' store)
 * @returns Set of user IDs (empty if no members tracked)
 */
export async function getMembers(guildId: string, options?: FlashcoreOptions): Promise<Set<string>> {
	const storeId = resolveStoreId(options)
	const arr = (await Flashcore.get<string[]>('members', { namespace: ['xp', storeId, guildId] })) ?? []
	return new Set(arr)
}

// ============================================================================
// Guild Config CRUD
// ============================================================================

/**
 * Retrieves guild config with caching
 * Merges stored config with global config and defaults
 *
 * @param guildId - Guild ID
 * @param options - Store options (defaults to 'default' store)
 * @returns Complete GuildConfig (never null, uses defaults if needed)
 *
 * @example
 * // Default store
 * const config = await getConfig('123...')
 * if (config.cooldownSeconds > 0) { ... }
 *
 * @example
 * // Custom store
 * const repConfig = await getConfig('123...', { storeId: 'reputation' })
 */
export async function getConfig(guildId: string, options?: FlashcoreOptions): Promise<GuildConfig> {
	const storeId = resolveStoreId(options)

	// Check schema version once and migrate if needed
	const currentVersion = await getSchemaVersion(guildId, { storeId })
	if (currentVersion < SCHEMA_VERSION) {
		await migrations.migrateGuildData(guildId, currentVersion, SCHEMA_VERSION, { storeId })
		// Invalidate config cache after migration to ensure fresh data
		invalidateConfigCache(guildId, { storeId })
	}

	// Check cache first
	const cachedConfig = configCache.get(getCacheKey(guildId, storeId))
	if (cachedConfig) {
		return cachedConfig
	}

	// Load from Flashcore
	const stored = await Flashcore.get<GuildConfig>('config', { namespace: ['xp', storeId, guildId] })

	// Get global config
	const globalConfig = await getGlobalConfig()
	const defaults = getDefaultConfig()

	// Merge: defaults <- global <- stored
	let merged = mergeConfigs(defaults, globalConfig)
	if (stored) {
		merged = mergeConfigs(merged, stored)
	}

	// Normalize and cache
	const normalized = normalizeConfig(merged, defaults)
	configCache.set(getCacheKey(guildId, storeId), normalized)
	return normalized
}

/**
 * Persists guild config and updates cache
 *
 * @param guildId - Guild ID
 * @param config - Complete GuildConfig to persist
 * @param options - Store options (defaults to 'default' store)
 *
 * @example
 * // Default store
 * await putConfig('123...', {
 *   cooldownSeconds: 120,
 *   xpRate: 1.5,
 *   // ... other fields
 * })
 *
 * @example
 * // Custom store
 * await putConfig('123...', config, { storeId: 'reputation' })
 */
export async function putConfig(guildId: string, config: GuildConfig, options?: FlashcoreOptions): Promise<void> {
	const storeId = resolveStoreId(options)
	await Flashcore.set('config', config, { namespace: ['xp', storeId, guildId] })
	// Invalidate cache so next getConfig() recomputes and caches normalized config
	invalidateConfigCache(guildId, { storeId })
	// Invalidate curve cache so next getResolvedCurve() re-resolves with new config
	invalidateCurveCache(guildId, storeId)
}

/**
 * Updates guild config with partial values
 * Merges with existing config, validates, and persists
 *
 * @param guildId - Guild ID
 * @param partial - Partial config to merge
 * @param options - Store options (defaults to 'default' store)
 * @returns Complete merged GuildConfig
 *
 * @example
 * // Default store
 * const updated = await updateConfig('123...', {
 *   cooldownSeconds: 90
 * })
 *
 * @example
 * // Custom store
 * const updated = await updateConfig('123...', { xpRate: 2.0 }, { storeId: 'reputation' })
 */
export async function updateConfig(
	guildId: string,
	partial: Partial<GuildConfig>,
	options?: FlashcoreOptions
): Promise<GuildConfig> {
	const existing = await getConfig(guildId, options)
	const merged = mergeConfigs(existing, partial)
	await putConfig(guildId, merged, options)
	return merged
}

/**
 * Returns existing config or creates default config for new guild
 * Merges with global config and persists if created
 *
 * @param guildId - Guild ID
 * @param options - Store options (defaults to 'default' store)
 * @returns Complete GuildConfig
 *
 * @example
 * // Default store
 * const config = await getOrInitConfig('123...') // Creates if needed
 *
 * @example
 * // Custom store
 * const config = await getOrInitConfig('123...', { storeId: 'reputation' })
 */
export async function getOrInitConfig(guildId: string, options?: FlashcoreOptions): Promise<GuildConfig> {
	const storeId = resolveStoreId(options)

	// Check schema version once and migrate if needed
	const currentVersion = await getSchemaVersion(guildId, { storeId })
	if (currentVersion < SCHEMA_VERSION) {
		await migrations.migrateGuildData(guildId, currentVersion, SCHEMA_VERSION, { storeId })
		// Invalidate config cache after migration to ensure fresh data
		invalidateConfigCache(guildId, { storeId })
	}

	// Check cache first
	const cachedConfig = configCache.get(getCacheKey(guildId, storeId))
	if (cachedConfig) {
		return cachedConfig
	}

	const existing = await Flashcore.get<GuildConfig>('config', { namespace: ['xp', storeId, guildId] })

	// Get global config
	const globalConfig = await getGlobalConfig()
	const defaults = getDefaultConfig()

	// Merge: defaults <- global <- existing
	let merged = mergeConfigs(defaults, globalConfig)
	if (existing) {
		merged = mergeConfigs(merged, existing)
	}

	// Normalize and cache
	const normalized = normalizeConfig(merged, defaults)
	configCache.set(getCacheKey(guildId, storeId), normalized)

	// If no existing config, persist the merged result
	if (!existing) {
		await Flashcore.set('config', normalized, { namespace: ['xp', storeId, guildId] })
	}

	return normalized
}

/**
 * Returns default guild configuration
 *
 * @returns GuildConfig with all default values
 */
export function getDefaultConfig(): GuildConfig {
	return {
		cooldownSeconds: 60,
		xpRate: 1.0,
		noXpRoleIds: [],
		noXpChannelIds: [],
		roleRewards: [],
		rewardsMode: 'stack',
		removeRewardOnXpLoss: false,
		leaderboard: {
			public: false
		}
	}
}

/**
 * Returns default user XP data
 *
 * @returns UserXP with all fields initialized to 0
 */
export function getDefaultUser(): UserXP {
	return {
		xp: 0,
		level: 0,
		lastAwardedAt: 0,
		messages: 0,
		xpMessages: 0
	}
}

// ============================================================================
// Global Config CRUD
// ============================================================================

/**
 * Retrieves global configuration defaults
 *
 * @returns GlobalConfig (empty object if not set)
 *
 * @example
 * const global = await getGlobalConfig()
 * if (global.cooldownSeconds) {
 *   console.log('Global cooldown:', global.cooldownSeconds)
 * }
 */
export async function getGlobalConfig(): Promise<GlobalConfig> {
	const config = await Flashcore.get<GlobalConfig>('config', { namespace: ['xp', 'global'] })
	return config ?? {}
}

/**
 * Persists global configuration defaults
 * Clears all guild config caches to force re-merge
 *
 * @param config - Partial config to use as global defaults
 *
 * @example
 * await setGlobalConfig({
 *   cooldownSeconds: 90,
 *   xpRate: 1.2
 * })
 */
export async function setGlobalConfig(config: GlobalConfig): Promise<void> {
	await Flashcore.set('config', config, { namespace: ['xp', 'global'] })
	clearConfigCache() // Force re-merge for all guilds
}

// ============================================================================
// Schema Management
// ============================================================================

/**
 * Retrieves schema version for a guild
 *
 * @param guildId - Guild ID
 * @param options - Store options (defaults to 'default' store)
 * @returns Schema version number (defaults to 1)
 */
export async function getSchemaVersion(guildId: string, options?: FlashcoreOptions): Promise<number> {
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
 * Persists schema version for a guild
 * Used for future data migrations
 *
 * @param guildId - Guild ID
 * @param version - Schema version number
 * @param options - Store options (defaults to 'default' store)
 */
export async function setSchemaVersion(guildId: string, version: number, options?: FlashcoreOptions): Promise<void> {
	const storeId = resolveStoreId(options)
	await Flashcore.set('schema', version, { namespace: ['xp', storeId, guildId] })
}

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Validates and normalizes config object from Flashcore
 * Fills missing fields with defaults
 *
 * @param raw - Raw config from Flashcore (may be incomplete)
 * @param defaults - Default config to fill missing fields
 * @returns Complete normalized GuildConfig
 */
export function normalizeConfig(raw: unknown, defaults: GuildConfig): GuildConfig {
	if (!raw || typeof raw !== 'object') {
		return defaults
	}

	const config = raw as Partial<GuildConfig>

	return {
		cooldownSeconds: config.cooldownSeconds ?? defaults.cooldownSeconds,
		xpRate: config.xpRate ?? defaults.xpRate,
		noXpRoleIds: Array.isArray(config.noXpRoleIds) ? config.noXpRoleIds : defaults.noXpRoleIds,
		noXpChannelIds: Array.isArray(config.noXpChannelIds) ? config.noXpChannelIds : defaults.noXpChannelIds,
		roleRewards: Array.isArray(config.roleRewards) ? config.roleRewards : defaults.roleRewards,
		rewardsMode: config.rewardsMode ?? defaults.rewardsMode,
		removeRewardOnXpLoss: config.removeRewardOnXpLoss ?? defaults.removeRewardOnXpLoss,
		leaderboard: {
			public: config.leaderboard?.public ?? defaults.leaderboard.public
		},
		levels: config.levels ?? defaults.levels,
		multipliers: config.multipliers
			? {
					server: config.multipliers.server,
					role: config.multipliers.role ?? {},
					user: config.multipliers.user ?? {}
				}
			: undefined,
		labels: config.labels
			? {
					xpDisplayName: config.labels.xpDisplayName
				}
			: undefined
	}
}

/**
 * Deep merges two config objects
 * Override values take precedence over base values
 * Handles nested multipliers object carefully
 *
 * @param base - Base config (lower precedence)
 * @param override - Override config (higher precedence)
 * @returns Merged GuildConfig
 *
 * @example
 * const merged = mergeConfigs(
 *   { cooldownSeconds: 60, xpRate: 1.0, multipliers: { server: 1.5 } },
 *   { cooldownSeconds: 90, multipliers: { role: { '123': 2.0 } } }
 * )
 * // Result: { cooldownSeconds: 90, xpRate: 1.0, multipliers: { server: 1.5, role: { '123': 2.0 } } }
 */
export function mergeConfigs(base: GuildConfig, override: Partial<GuildConfig>): GuildConfig {
	// Deep merge multipliers object
	let mergedMultipliers = base.multipliers ? { ...base.multipliers } : undefined

	// Deep merge labels object
	let mergedLabels = base.labels ? { ...base.labels } : undefined

	if (override.multipliers) {
		mergedMultipliers = {
			server: override.multipliers.server ?? mergedMultipliers?.server,
			role: { ...mergedMultipliers?.role, ...override.multipliers.role },
			user: { ...mergedMultipliers?.user, ...override.multipliers.user }
		}
	}

	if (override.labels) {
		mergedLabels = {
			xpDisplayName: override.labels.xpDisplayName ?? mergedLabels?.xpDisplayName
		}
	}

	return {
		cooldownSeconds: override.cooldownSeconds ?? base.cooldownSeconds,
		xpRate: override.xpRate ?? base.xpRate,
		noXpRoleIds: override.noXpRoleIds ?? base.noXpRoleIds,
		noXpChannelIds: override.noXpChannelIds ?? base.noXpChannelIds,
		roleRewards: override.roleRewards ?? base.roleRewards,
		rewardsMode: override.rewardsMode ?? base.rewardsMode,
		removeRewardOnXpLoss: override.removeRewardOnXpLoss ?? base.removeRewardOnXpLoss,
		leaderboard: {
			public: override.leaderboard?.public ?? base.leaderboard.public
		},
		levels: override.levels ?? base.levels,
		multipliers: mergedMultipliers,
		labels: mergedLabels
	}
}
