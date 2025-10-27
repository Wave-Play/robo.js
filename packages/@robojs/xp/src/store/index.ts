/**
 * Flashcore CRUD operations for XP data persistence
 *
 * Uses Flashcore key-value store with namespace 'xp' and the following key structure:
 * - `user:{guildId}:{userId}` -> UserXP data
 * - `members:{guildId}` -> string[] of tracked user IDs
 * - `config:{guildId}` -> GuildConfig
 * - `config:global` -> GlobalConfig
 * - `schema:{guildId}` -> number (schema version)
 *
 * All keys use namespace: XP_NAMESPACE ('xp')
 * Implements caching for guild configs to reduce Flashcore reads.
 */

import { Flashcore } from 'robo.js'
import type { UserXP, GuildConfig, GlobalConfig } from '../types.js'

/**
 * Namespace for all XP-related Flashcore keys
 */
export const XP_NAMESPACE = 'xp'

/**
 * Current schema version for future migrations
 */
export const SCHEMA_VERSION = 1

/**
 * In-memory cache for guild configurations
 * Key: guildId, Value: GuildConfig
 * Reduces Flashcore reads for frequently accessed configs
 */
const configCache = new Map<string, GuildConfig>()

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Invalidates cached config for a specific guild
 * Forces next getConfig to read from Flashcore
 *
 * @param guildId - Guild ID to invalidate
 */
export function invalidateConfigCache(guildId: string): void {
	configCache.delete(guildId)
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
 * @returns UserXP data or null if user not tracked
 *
 * @example
 * const user = await getUser('123...', '456...')
 * if (user) {
 *   console.log(`Level ${user.level} with ${user.xp} XP`)
 * }
 */
export async function getUser(guildId: string, userId: string): Promise<UserXP | null> {
	const key = `user:${guildId}:${userId}`
	const data = await Flashcore.get<UserXP>(key, { namespace: XP_NAMESPACE })
	return data ?? null
}

/**
 * Persists user XP record and adds user to members set
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param data - UserXP data to persist
 *
 * @example
 * await putUser('123...', '456...', {
 *   xp: 1500,
 *   level: 5,
 *   lastAwardedAt: Date.now(),
 *   messages: 423
 * })
 */
export async function putUser(guildId: string, userId: string, data: UserXP): Promise<void> {
	const key = `user:${guildId}:${userId}`
	await Flashcore.set(key, data, { namespace: XP_NAMESPACE })
	await addMember(guildId, userId)
}

/**
 * Deletes user XP record and removes from members set
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 *
 * @example
 * await deleteUser('123...', '456...') // Resets user's XP progress
 */
export async function deleteUser(guildId: string, userId: string): Promise<void> {
	const key = `user:${guildId}:${userId}`
	await Flashcore.set(key, undefined, { namespace: XP_NAMESPACE })
	await removeMember(guildId, userId)
}

/**
 * Loads all user records for a guild
 * Fetches in parallel for better performance with large member sets
 * Used for leaderboard generation and bulk operations
 *
 * @param guildId - Guild ID
 * @returns Map of userId -> UserXP for all tracked members
 *
 * @example
 * const allUsers = await getAllUsers('123...')
 * const sorted = [...allUsers.entries()]
 *   .sort((a, b) => b[1].xp - a[1].xp)
 */
export async function getAllUsers(guildId: string): Promise<Map<string, UserXP>> {
	const members = await getMembers(guildId)
	const result = new Map<string, UserXP>()

	// Fetch all user records in parallel
	const promises = Array.from(members).map((userId) => getUser(guildId, userId))
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
 */
export async function addMember(guildId: string, userId: string): Promise<void> {
	const key = `members:${guildId}`
	const arr = await Flashcore.get<string[]>(key, { namespace: XP_NAMESPACE }) ?? []
	const members = new Set(arr)
	members.add(userId)
	await Flashcore.set(key, Array.from(members), { namespace: XP_NAMESPACE })
}

/**
 * Removes user ID from tracked members set
 * Idempotent - safe to call even if user not in set
 *
 * @param guildId - Guild ID
 * @param userId - User ID to remove
 */
export async function removeMember(guildId: string, userId: string): Promise<void> {
	const key = `members:${guildId}`
	const arr = await Flashcore.get<string[]>(key, { namespace: XP_NAMESPACE })
	if (arr) {
		const members = new Set(arr)
		members.delete(userId)
		await Flashcore.set(key, Array.from(members), { namespace: XP_NAMESPACE })
	}
}

/**
 * Retrieves all tracked member IDs for a guild
 *
 * @param guildId - Guild ID
 * @returns Set of user IDs (empty if no members tracked)
 */
export async function getMembers(guildId: string): Promise<Set<string>> {
	const key = `members:${guildId}`
	const arr = await Flashcore.get<string[]>(key, { namespace: XP_NAMESPACE }) ?? []
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
 * @returns Complete GuildConfig (never null, uses defaults if needed)
 *
 * @example
 * const config = await getConfig('123...')
 * if (config.cooldownSeconds > 0) { ... }
 */
export async function getConfig(guildId: string): Promise<GuildConfig> {
	// Check cache first
	if (configCache.has(guildId)) {
		return configCache.get(guildId)!
	}

	// Load from Flashcore
	const key = `config:${guildId}`
	const stored = await Flashcore.get<GuildConfig>(key, { namespace: XP_NAMESPACE })

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
	configCache.set(guildId, normalized)
	return normalized
}

/**
 * Persists guild config and updates cache
 *
 * @param guildId - Guild ID
 * @param config - Complete GuildConfig to persist
 *
 * @example
 * await putConfig('123...', {
 *   cooldownSeconds: 120,
 *   xpRate: 1.5,
 *   // ... other fields
 * })
 */
export async function putConfig(guildId: string, config: GuildConfig): Promise<void> {
	const key = `config:${guildId}`
	await Flashcore.set(key, config, { namespace: XP_NAMESPACE })
	configCache.set(guildId, config)
}

/**
 * Updates guild config with partial values
 * Merges with existing config, validates, and persists
 *
 * @param guildId - Guild ID
 * @param partial - Partial config to merge
 * @returns Complete merged GuildConfig
 *
 * @example
 * const updated = await updateConfig('123...', {
 *   cooldownSeconds: 90
 * })
 */
export async function updateConfig(guildId: string, partial: Partial<GuildConfig>): Promise<GuildConfig> {
	const existing = await getConfig(guildId)
	const merged = mergeConfigs(existing, partial)
	await putConfig(guildId, merged)
	return merged
}

/**
 * Returns existing config or creates default config for new guild
 * Merges with global config and persists if created
 *
 * @param guildId - Guild ID
 * @returns Complete GuildConfig
 *
 * @example
 * const config = await getOrInitConfig('123...') // Creates if needed
 */
export async function getOrInitConfig(guildId: string): Promise<GuildConfig> {
	// Check cache first
	if (configCache.has(guildId)) {
		return configCache.get(guildId)!
	}

	const key = `config:${guildId}`
	const existing = await Flashcore.get<GuildConfig>(key, { namespace: XP_NAMESPACE })

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
	configCache.set(guildId, normalized)

	// If no existing config, persist the merged result
	if (!existing) {
		await Flashcore.set(key, normalized, { namespace: XP_NAMESPACE })
	}

	return normalized
}

/**
 * Returns default guild configuration (MEE6 parity)
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
	const key = 'config:global'
	const config = await Flashcore.get<GlobalConfig>(key, { namespace: XP_NAMESPACE })
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
	const key = 'config:global'
	await Flashcore.set(key, config, { namespace: XP_NAMESPACE })
	clearConfigCache() // Force re-merge for all guilds
}

// ============================================================================
// Schema Management
// ============================================================================

/**
 * Retrieves schema version for a guild
 *
 * @param guildId - Guild ID
 * @returns Schema version number (defaults to 1)
 */
export async function getSchemaVersion(guildId: string): Promise<number> {
	const key = `schema:${guildId}`
	const version = await Flashcore.get<number>(key, { namespace: XP_NAMESPACE })
	return version ?? SCHEMA_VERSION
}

/**
 * Persists schema version for a guild
 * Used for future data migrations
 *
 * @param guildId - Guild ID
 * @param version - Schema version number
 */
export async function setSchemaVersion(guildId: string, version: number): Promise<void> {
	const key = `schema:${guildId}`
	await Flashcore.set(key, version, { namespace: XP_NAMESPACE })
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
		multipliers: config.multipliers
			? {
					server: config.multipliers.server,
					role: config.multipliers.role ?? {},
					user: config.multipliers.user ?? {}
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

	if (override.multipliers) {
		mergedMultipliers = {
			server: override.multipliers.server ?? mergedMultipliers?.server,
			role: { ...mergedMultipliers?.role, ...override.multipliers.role },
			user: { ...mergedMultipliers?.user, ...override.multipliers.user }
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
		multipliers: mergedMultipliers
	}
}
