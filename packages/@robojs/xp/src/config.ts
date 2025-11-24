/**
 * Configuration management with global defaults and per-guild merging
 *
 * Provides a high-level API for managing XP system configuration with:
 * - Global defaults that apply to all guilds
 * - Per-guild overrides with validation
 * - Deep merging of nested configuration objects
 * - Cache invalidation when global config changes
 * - Level curve validation with type-specific parameter checks
 * - Multi-store support: Each store has independent config with shared global defaults
 *
 * Config precedence (highest to lowest):
 * 1. Guild-specific config (per store)
 * 2. Global config defaults (shared across all stores)
 * 3. System defaults
 *
 * @example
 * ```typescript
 * // Default store
 * const config = await getConfig('123456789012345678')
 *
 * // Custom store (e.g., reputation system)
 * const repConfig = await getConfig('123456789012345678', { storeId: 'reputation' })
 * ```
 */

import type { GuildConfig, GlobalConfig, RoleReward, FlashcoreOptions, LevelCurveConfig } from './types.js'
import {
	updateConfig as storeUpdateConfig,
	getOrInitConfig as storeGetOrInitConfig,
	getDefaultConfig as storeGetDefaultConfig,
	getGlobalConfig as storeGetGlobalConfig,
	setGlobalConfig as storeSetGlobalConfig,
	mergeConfigs as storeMergeConfigs
} from './store/index.js'

/**
 * Default configuration constants
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
 * @param options - Optional Flashcore options (e.g., storeId for multi-store support)
 * @returns Complete GuildConfig (never null, uses defaults if needed)
 *
 * @example
 * // Default store
 * const config = await getConfig('123456789012345678')
 * if (config.cooldownSeconds > 0) {
 *   // Check cooldown before awarding XP
 * }
 *
 * // Custom store (e.g., reputation system)
 * const repConfig = await getConfig('123456789012345678', { storeId: 'reputation' })
 */
export async function getConfig(guildId: string, options?: FlashcoreOptions): Promise<GuildConfig> {
	return storeGetOrInitConfig(guildId, options)
}

/**
 * Updates guild configuration with validation
 * Merges partial values with existing config
 *
 * @param guildId - Guild ID
 * @param partial - Partial config to merge
 * @param options - Optional Flashcore options (e.g., storeId for multi-store support)
 * @returns Complete merged GuildConfig
 * @throws Error if validation fails
 *
 * @example
 * // Default store
 * const updated = await setConfig('123...', {
 *   cooldownSeconds: 90,
 *   roleRewards: [
 *     { level: 5, roleId: '345678901234567890' }
 *   ]
 * })
 *
 * // Custom store (e.g., reputation system)
 * const repUpdated = await setConfig('123...', {
 *   cooldownSeconds: 120
 * }, { storeId: 'reputation' })
 */
export async function setConfig(guildId: string, partial: Partial<GuildConfig>, options?: FlashcoreOptions): Promise<GuildConfig> {
	// Validate input
	const validation = validateConfig(partial)
	if (!validation.valid) {
		throw new Error(`Invalid config: ${validation.errors.join(', ')}`)
	}

	// Merge and persist
	return storeUpdateConfig(guildId, partial, options)
}

/**
 * Updates global configuration defaults
 * Clears all guild config caches to force re-merge on next access
 *
 * Global config is shared across all stores as base defaults.
 * Each store can then apply its own guild-specific overrides on top.
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
 * Global config is shared across all stores as base defaults.
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
 * Returns default guild configuration
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
 * Validates level curve configuration if present, including type-specific
 * parameter validation (positive numbers, sorted arrays, etc.).
 *
 * @param config - Partial config to validate
 * @returns Validation result with error messages
 *
 * @example
 * const result = validateConfig({ cooldownSeconds: -10 })
 * if (!result.valid) {
 *   console.error('Errors:', result.errors)
 * }
 *
 * @example
 * const result = validateConfig({
 *   levels: {
 *     type: 'linear',
 *     params: { xpPerLevel: -100 }
 *   }
 * })
 * // result.valid: false
 * // result.errors: ['levels.params.xpPerLevel must be positive number']
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
				if (
					typeof config.theme.embedColor !== 'number' ||
					config.theme.embedColor < 0 ||
					config.theme.embedColor > 0xffffff
				) {
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

	// Validate labels
	if (config.labels !== undefined) {
		if (typeof config.labels !== 'object' || config.labels === null) {
			errors.push('labels must be object')
		} else {
			if (config.labels.xpDisplayName !== undefined) {
				if (typeof config.labels.xpDisplayName !== 'string') {
					errors.push('labels.xpDisplayName must be string')
				} else if (config.labels.xpDisplayName.length === 0) {
					errors.push('labels.xpDisplayName cannot be empty string')
				} else if (config.labels.xpDisplayName.length > 20) {
					errors.push('labels.xpDisplayName must be 20 characters or less')
				}
			}
		}
	}

	// Validate levels (custom level curve)
	if (config.levels !== undefined) {
		if (typeof config.levels !== 'object' || config.levels === null) {
			errors.push('levels must be object')
		} else {
			const curveErrors = validateLevelCurve(config.levels)
			errors.push(...curveErrors)
		}
	}

	return {
		valid: errors.length === 0,
		errors
	}
}

/**
 * Validates level curve configuration
 *
 * Performs type-specific validation based on curve type discriminator.
 * Each curve type has different parameter requirements:
 * - Quadratic: optional positive coefficients (a, b, c)
 * - Linear: required positive xpPerLevel
 * - Exponential: required base > 1 and positive multiplier, maxLevel strongly recommended
 * - Lookup: required non-empty sorted array of non-negative thresholds
 *
 * @param curve - Level curve configuration to validate
 * @returns Array of error messages (empty if valid)
 *
 * @example
 * const errors = validateLevelCurve({
 *   type: 'linear',
 *   params: { xpPerLevel: 100 }
 * })
 * // errors: [] (valid)
 *
 * @example
 * const errors = validateLevelCurve({
 *   type: 'linear',
 *   params: { xpPerLevel: -50 }
 * })
 * // errors: ['levels.params.xpPerLevel must be positive number']
 */
export function validateLevelCurve(curve: LevelCurveConfig): string[] {
	const errors: string[] = []

	// Dispatch based on curve type discriminator
	switch (curve.type) {
		case 'quadratic':
			if (curve.params) {
				const { a, b, c } = curve.params
				if (a !== undefined && (typeof a !== 'number' || a <= 0)) {
					errors.push('levels.params.a must be positive number')
				}
				if (b !== undefined && (typeof b !== 'number' || b <= 0)) {
					errors.push('levels.params.b must be positive number')
				}
				if (c !== undefined && (typeof c !== 'number' || c <= 0)) {
					errors.push('levels.params.c must be positive number')
				}
			}
			break

		case 'linear':
			if (!curve.params || typeof curve.params.xpPerLevel !== 'number') {
				errors.push('levels.params.xpPerLevel is required for linear curves')
			} else if (curve.params.xpPerLevel <= 0) {
				errors.push('levels.params.xpPerLevel must be positive number')
			}
			break

		case 'exponential':
			if (!curve.params) {
				errors.push('levels.params is required for exponential curves')
			} else {
				const { base, multiplier } = curve.params
				if (typeof base !== 'number' || base <= 1) {
					errors.push('levels.params.base must be number greater than 1')
				}
				if (typeof multiplier !== 'number' || multiplier <= 0) {
					errors.push('levels.params.multiplier must be positive number')
				}
			}
			break

		case 'lookup':
			if (!curve.params || !Array.isArray(curve.params.thresholds)) {
				errors.push('levels.params.thresholds is required for lookup curves')
			} else {
				const thresholds = curve.params.thresholds

				// Check non-empty
				if (thresholds.length === 0) {
					errors.push('levels.params.thresholds must be non-empty array')
				}

				// Check all values are non-negative numbers
				for (let i = 0; i < thresholds.length; i++) {
					if (typeof thresholds[i] !== 'number' || thresholds[i] < 0) {
						errors.push(`levels.params.thresholds[${i}] must be non-negative number`)
					}
				}

				// Check sorted in ascending order
				for (let i = 1; i < thresholds.length; i++) {
					if (thresholds[i] < thresholds[i - 1]) {
						errors.push('levels.params.thresholds must be sorted in ascending order')
						break // Only report once
					}
				}

				// Validate maxLevel doesn't exceed array bounds
				if (curve.maxLevel !== undefined && curve.maxLevel > thresholds.length - 1) {
					errors.push(
						`levels.maxLevel (${curve.maxLevel}) cannot exceed thresholds.length - 1 (${thresholds.length - 1})`
					)
				}
			}
			break

		default: {
			// TypeScript exhaustiveness check
			const exhaustive: never = curve
			errors.push(`Unknown curve type: ${(exhaustive as LevelCurveConfig).type}`)
		}
	}

	// Validate maxLevel if present (common to all curve types)
	if (curve.maxLevel !== undefined) {
		if (typeof curve.maxLevel !== 'number' || curve.maxLevel < 0 || !Number.isInteger(curve.maxLevel)) {
			errors.push('levels.maxLevel must be non-negative integer')
		}
	}

	return errors
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
		if (typeof multipliers.server !== 'number' || multipliers.server < 0) {
			errors.push('multipliers.server must be non-negative number')
		}
	}

	// Validate role multipliers
	if (multipliers.role !== undefined) {
		if (typeof multipliers.role !== 'object' || multipliers.role === null) {
			errors.push('multipliers.role must be object')
		} else {
			for (const [roleId, multiplier] of Object.entries(multipliers.role)) {
				if (typeof multiplier !== 'number' || multiplier < 0) {
					errors.push(`multipliers.role[${roleId}] must be non-negative number`)
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
				if (typeof multiplier !== 'number' || multiplier < 0) {
					errors.push(`multipliers.user[${userId}] must be non-negative number`)
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
