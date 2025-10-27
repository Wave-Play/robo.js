/**
 * Configuration management with global defaults and per-guild merging
 *
 * Provides a high-level API for managing XP system configuration with:
 * - Global defaults that apply to all guilds
 * - Per-guild overrides with validation
 * - Deep merging of nested configuration objects
 * - Cache invalidation when global config changes
 *
 * Config precedence (highest to lowest):
 * 1. Guild-specific config
 * 2. Global config defaults
 * 3. System defaults (MEE6 parity)
 */

import type { GuildConfig, GlobalConfig, RoleReward } from './types.js'
import {
	getConfig as storeGetConfig,
	putConfig as storePutConfig,
	updateConfig as storeUpdateConfig,
	getOrInitConfig as storeGetOrInitConfig,
	getDefaultConfig as storeGetDefaultConfig,
	getGlobalConfig as storeGetGlobalConfig,
	setGlobalConfig as storeSetGlobalConfig,
	mergeConfigs as storeMergeConfigs,
	clearConfigCache
} from './store/index.js'

/**
 * Default configuration constants (MEE6 parity)
 */
export const DEFAULT_COOLDOWN = 60 // 1 minute between XP awards
export const DEFAULT_XP_RATE = 1.0 // No rate modification
export const DEFAULT_REWARDS_MODE = 'stack' // Stack role rewards by default
export const DEFAULT_REMOVE_ON_LOSS = false // Don't remove rewards when XP decreases
export const DEFAULT_LEADERBOARD_PUBLIC = false // Leaderboard restricted by default

/**
 * Retrieves guild configuration with all defaults applied
 * Primary entry point for reading guild configuration
 *
 * @param guildId - Guild ID
 * @returns Complete GuildConfig (never null, uses defaults if needed)
 *
 * @example
 * const config = await getConfig('123456789012345678')
 * if (config.cooldownSeconds > 0) {
 *   // Check cooldown before awarding XP
 * }
 */
export async function getConfig(guildId: string): Promise<GuildConfig> {
	return storeGetOrInitConfig(guildId)
}

/**
 * Updates guild configuration with validation
 * Merges partial values with existing config
 *
 * @param guildId - Guild ID
 * @param partial - Partial config to merge
 * @returns Complete merged GuildConfig
 * @throws Error if validation fails
 *
 * @example
 * const updated = await setConfig('123...', {
 *   cooldownSeconds: 90,
 *   roleRewards: [
 *     { level: 5, roleId: '345678901234567890' }
 *   ]
 * })
 */
export async function setConfig(guildId: string, partial: Partial<GuildConfig>): Promise<GuildConfig> {
	// Validate input
	const validation = validateConfig(partial)
	if (!validation.valid) {
		throw new Error(`Invalid config: ${validation.errors.join(', ')}`)
	}

	// Merge and persist
	return storeUpdateConfig(guildId, partial)
}

/**
 * Updates global configuration defaults
 * Clears all guild config caches to force re-merge on next access
 *
 * @param config - Partial config to use as global defaults
 * @throws Error if validation fails
 *
 * @example
 * await setGlobalConfig({
 *   cooldownSeconds: 90,
 *   xpRate: 1.2
 * })
 */
export async function setGlobalConfig(config: GlobalConfig): Promise<void> {
	// Validate input
	const validation = validateConfig(config)
	if (!validation.valid) {
		throw new Error(`Invalid global config: ${validation.errors.join(', ')}`)
	}

	await storeSetGlobalConfig(config)
}

/**
 * Retrieves current global configuration defaults
 *
 * @returns GlobalConfig (empty object if not set)
 *
 * @example
 * const global = await getGlobalConfig()
 * console.log('Global cooldown:', global.cooldownSeconds ?? DEFAULT_COOLDOWN)
 */
export async function getGlobalConfig(): Promise<GlobalConfig> {
	return storeGetGlobalConfig()
}

/**
 * Returns default guild configuration (MEE6 parity)
 *
 * @returns GuildConfig with all default values
 *
 * @example
 * const defaults = getDefaultConfig()
 * console.log('Default cooldown:', defaults.cooldownSeconds) // 60
 */
export function getDefaultConfig(): GuildConfig {
	return storeGetDefaultConfig()
}

/**
 * Validates configuration object
 *
 * @param config - Partial config to validate
 * @returns Validation result with error messages
 *
 * @example
 * const result = validateConfig({ cooldownSeconds: -10 })
 * if (!result.valid) {
 *   console.error('Errors:', result.errors)
 * }
 */
export function validateConfig(config: Partial<GuildConfig>): { valid: boolean; errors: string[] } {
	const errors: string[] = []

	// Validate cooldownSeconds
	if (config.cooldownSeconds !== undefined) {
		if (typeof config.cooldownSeconds !== 'number' || config.cooldownSeconds < 0) {
			errors.push('cooldownSeconds must be non-negative number')
		}
	}

	// Validate xpRate
	if (config.xpRate !== undefined) {
		if (typeof config.xpRate !== 'number' || config.xpRate <= 0) {
			errors.push('xpRate must be positive number')
		}
	}

	// Validate noXpRoleIds
	if (config.noXpRoleIds !== undefined) {
		if (!Array.isArray(config.noXpRoleIds)) {
			errors.push('noXpRoleIds must be array')
		} else {
			const invalidIds = config.noXpRoleIds.filter((id) => !isValidSnowflake(id))
			if (invalidIds.length > 0) {
				errors.push(`noXpRoleIds contains invalid Discord snowflakes: ${invalidIds.join(', ')}`)
			}
			const uniqueIds = new Set(config.noXpRoleIds)
			if (uniqueIds.size !== config.noXpRoleIds.length) {
				errors.push('noXpRoleIds contains duplicate IDs')
			}
		}
	}

	// Validate noXpChannelIds
	if (config.noXpChannelIds !== undefined) {
		if (!Array.isArray(config.noXpChannelIds)) {
			errors.push('noXpChannelIds must be array')
		} else {
			const invalidIds = config.noXpChannelIds.filter((id) => !isValidSnowflake(id))
			if (invalidIds.length > 0) {
				errors.push(`noXpChannelIds contains invalid Discord snowflakes: ${invalidIds.join(', ')}`)
			}
			const uniqueIds = new Set(config.noXpChannelIds)
			if (uniqueIds.size !== config.noXpChannelIds.length) {
				errors.push('noXpChannelIds contains duplicate IDs')
			}
		}
	}

	// Validate roleRewards
	if (config.roleRewards !== undefined) {
		if (!Array.isArray(config.roleRewards)) {
			errors.push('roleRewards must be array')
		} else {
			const rewardErrors = validateRoleRewards(config.roleRewards)
			errors.push(...rewardErrors)
		}
	}

	// Validate rewardsMode
	if (config.rewardsMode !== undefined) {
		if (config.rewardsMode !== 'stack' && config.rewardsMode !== 'replace') {
			errors.push("rewardsMode must be 'stack' or 'replace'")
		}
	}

	// Validate removeRewardOnXpLoss
	if (config.removeRewardOnXpLoss !== undefined) {
		if (typeof config.removeRewardOnXpLoss !== 'boolean') {
			errors.push('removeRewardOnXpLoss must be boolean')
		}
	}

	// Validate leaderboard
	if (config.leaderboard !== undefined) {
		if (typeof config.leaderboard !== 'object' || config.leaderboard === null) {
			errors.push('leaderboard must be object')
		} else {
			if (config.leaderboard.public !== undefined && typeof config.leaderboard.public !== 'boolean') {
				errors.push('leaderboard.public must be boolean')
			}
		}
	}

	// Validate multipliers
	if (config.multipliers !== undefined) {
		const multiplierErrors = validateMultipliers(config.multipliers)
		errors.push(...multiplierErrors)
	}

	// Validate theme
	if (config.theme !== undefined) {
		if (typeof config.theme !== 'object' || config.theme === null) {
			errors.push('theme must be object')
		} else {
			if (config.theme.embedColor !== undefined) {
				if (typeof config.theme.embedColor !== 'number' || config.theme.embedColor < 0 || config.theme.embedColor > 0xffffff) {
					errors.push('theme.embedColor must be number between 0 and 0xFFFFFF (valid hex color)')
				}
			}
			if (config.theme.backgroundUrl !== undefined) {
				if (typeof config.theme.backgroundUrl !== 'string') {
					errors.push('theme.backgroundUrl must be string')
				}
			}
		}
	}

	return {
		valid: errors.length === 0,
		errors
	}
}

/**
 * Validates role rewards array
 *
 * @param rewards - Role rewards to validate
 * @returns Array of error messages (empty if valid)
 *
 * @example
 * const errors = validateRoleRewards([
 *   { level: 5, roleId: '123456789012345678' },
 *   { level: 5, roleId: '234567890123456789' } // duplicate level
 * ])
 * // errors: ['roleRewards contains duplicate levels']
 */
export function validateRoleRewards(rewards: RoleReward[]): string[] {
	const errors: string[] = []

	// Check for duplicate levels
	const levels = rewards.map((r) => r.level)
	const uniqueLevels = new Set(levels)
	if (uniqueLevels.size !== levels.length) {
		errors.push('roleRewards contains duplicate levels')
	}

	// Validate each reward
	for (const reward of rewards) {
		if (typeof reward.level !== 'number' || reward.level < 0) {
			errors.push(`roleReward level ${reward.level} must be non-negative number`)
		}
		if (!isValidSnowflake(reward.roleId)) {
			errors.push(`roleReward roleId ${reward.roleId} is not a valid Discord snowflake`)
		}
	}

	return errors
}

/**
 * Validates multipliers object
 *
 * @param multipliers - Multipliers to validate
 * @returns Array of error messages (empty if valid)
 *
 * @example
 * const errors = validateMultipliers({
 *   server: 2.0,
 *   role: { '123': 1.5 },
 *   user: { '456': -0.5 } // negative multiplier
 * })
 * // errors: ['multipliers.user[456] must be positive number']
 */
export function validateMultipliers(multipliers: GuildConfig['multipliers']): string[] {
	const errors: string[] = []

	if (multipliers === undefined) return []

	if (typeof multipliers !== 'object' || multipliers === null) {
		errors.push('multipliers must be object')
		return errors
	}

	// Validate server multiplier
	if (multipliers.server !== undefined) {
		if (typeof multipliers.server !== 'number' || multipliers.server <= 0) {
			errors.push('multipliers.server must be positive number')
		}
	}

	// Validate role multipliers
	if (multipliers.role !== undefined) {
		if (typeof multipliers.role !== 'object' || multipliers.role === null) {
			errors.push('multipliers.role must be object')
		} else {
			for (const [roleId, multiplier] of Object.entries(multipliers.role)) {
				if (typeof multiplier !== 'number' || multiplier <= 0) {
					errors.push(`multipliers.role[${roleId}] must be positive number`)
				}
			}
		}
	}

	// Validate user multipliers
	if (multipliers.user !== undefined) {
		if (typeof multipliers.user !== 'object' || multipliers.user === null) {
			errors.push('multipliers.user must be object')
		} else {
			for (const [userId, multiplier] of Object.entries(multipliers.user)) {
				if (typeof multiplier !== 'number' || multiplier <= 0) {
					errors.push(`multipliers.user[${userId}] must be positive number`)
				}
			}
		}
	}

	return errors
}

/**
 * Deep merges guild config with global defaults
 * Guild values take precedence over global values
 *
 * @param guildConfig - Guild-specific config (higher precedence)
 * @param globalConfig - Global defaults (lower precedence)
 * @returns Merged GuildConfig
 *
 * @example
 * const merged = mergeWithGlobal(
 *   { cooldownSeconds: 90 },
 *   { cooldownSeconds: 60, xpRate: 1.5 }
 * )
 * // Result: { cooldownSeconds: 90, xpRate: 1.5, ...defaults }
 */
export function mergeWithGlobal(guildConfig: Partial<GuildConfig>, globalConfig: GlobalConfig): GuildConfig {
	const base = getDefaultConfig()
	const withGlobal = storeMergeConfigs(base, globalConfig)
	return storeMergeConfigs(withGlobal, guildConfig)
}

/**
 * Validates Discord snowflake ID
 * Snowflakes are 18-19 digit strings
 *
 * @param id - ID to validate
 * @returns True if valid snowflake
 */
function isValidSnowflake(id: string): boolean {
	return typeof id === 'string' && /^\d{17,19}$/.test(id)
}
