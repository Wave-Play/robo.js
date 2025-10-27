/**
 * Unit tests for configuration management
 * Tests validation, merging, and default values
 *
 * Note: This file tests the config validation logic.
 * Tests requiring Flashcore mocking are in store.test.ts
 */

import { describe, test, expect } from '@jest/globals'
import {
	validateConfig,
	validateRoleRewards,
	validateMultipliers,
	mergeWithGlobal,
	getDefaultConfig,
	DEFAULT_COOLDOWN,
	DEFAULT_XP_RATE,
	DEFAULT_REWARDS_MODE,
	DEFAULT_REMOVE_ON_LOSS,
	DEFAULT_LEADERBOARD_PUBLIC
} from '../src/config.js'
import type { GuildConfig, GlobalConfig } from '../src/types.js'

// ============================================================================
// Test Suite: Default Config
// ============================================================================

test('getDefaultConfig returns object with all required fields', () => {
	const config = getDefaultConfig()
	expect(typeof config.cooldownSeconds === 'number').toBeTruthy()
	expect(typeof config.xpRate === 'number').toBeTruthy()
	expect(Array.isArray(config.noXpRoleIds)).toBeTruthy()
	expect(Array.isArray(config.noXpChannelIds)).toBeTruthy()
	expect(Array.isArray(config.roleRewards)).toBeTruthy()
	expect(typeof config.rewardsMode === 'string').toBeTruthy()
	expect(typeof config.removeRewardOnXpLoss === 'boolean').toBeTruthy()
	expect(typeof config.leaderboard === 'object').toBeTruthy()
	expect(typeof config.leaderboard.public === 'boolean').toBeTruthy()
})

test('getDefaultConfig matches MEE6 parity values', () => {
	const config = getDefaultConfig()
	expect(config.cooldownSeconds).toBe(60)
	expect(config.xpRate).toBe(1.0)
	expect(config.rewardsMode).toBe('stack')
	expect(config.removeRewardOnXpLoss).toBe(false)
	expect(config.leaderboard.public).toBe(false)
})

test('getDefaultConfig returns empty arrays', () => {
	const config = getDefaultConfig()
	expect(config.noXpRoleIds.length).toBe(0)
	expect(config.noXpChannelIds.length).toBe(0)
	expect(config.roleRewards.length).toBe(0)
})

test('default constants match config values', () => {
	const config = getDefaultConfig()
	expect(config.cooldownSeconds).toBe(DEFAULT_COOLDOWN)
	expect(config.xpRate).toBe(DEFAULT_XP_RATE)
	expect(config.rewardsMode).toBe(DEFAULT_REWARDS_MODE)
	expect(config.removeRewardOnXpLoss).toBe(DEFAULT_REMOVE_ON_LOSS)
	expect(config.leaderboard.public).toBe(DEFAULT_LEADERBOARD_PUBLIC)
})

test('getDefaultConfig multipliers is undefined', () => {
	const config = getDefaultConfig()
	expect(config.multipliers).toBe(undefined)
})

// ============================================================================
// Test Suite: Config Validation
// ============================================================================

test('validateConfig accepts valid complete config', () => {
	const config: GuildConfig = {
		cooldownSeconds: 90,
		xpRate: 1.5,
		noXpRoleIds: ['123456789012345678'],
		noXpChannelIds: ['234567890123456789'],
		roleRewards: [{ level: 5, roleId: '345678901234567890' }],
		rewardsMode: 'stack',
		removeRewardOnXpLoss: true,
		leaderboard: { public: true },
		multipliers: {
			server: 2.0,
			role: { '456789012345678901': 1.5 },
			user: { '567890123456789012': 0.5 }
		}
	}
	const result = validateConfig(config)
	expect(result.valid).toBeTruthy()
	expect(result.errors.length).toBe(0)
})

test('validateConfig accepts partial config', () => {
	const config: Partial<GuildConfig> = {
		cooldownSeconds: 120
	}
	const result = validateConfig(config)
	expect(result.valid).toBeTruthy()
	expect(result.errors.length).toBe(0)
})

test('validateConfig rejects negative cooldownSeconds', () => {
	const config: Partial<GuildConfig> = {
		cooldownSeconds: -10
	}
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('cooldownSeconds'))).toBeTruthy()
})

test('validateConfig rejects zero xpRate', () => {
	const config: Partial<GuildConfig> = {
		xpRate: 0
	}
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('xpRate'))).toBeTruthy()
})

test('validateConfig rejects negative xpRate', () => {
	const config: Partial<GuildConfig> = {
		xpRate: -1.5
	}
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('xpRate'))).toBeTruthy()
})

test('validateConfig rejects invalid Discord snowflakes in noXpRoleIds', () => {
	const config: Partial<GuildConfig> = {
		noXpRoleIds: ['123', 'not-a-snowflake', '234567890123456789']
	}
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('invalid Discord snowflakes'))).toBeTruthy()
})

test('validateConfig rejects duplicate role IDs in noXpRoleIds', () => {
	const config: Partial<GuildConfig> = {
		noXpRoleIds: ['123456789012345678', '123456789012345678']
	}
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('duplicate'))).toBeTruthy()
})

test('validateConfig rejects duplicate channel IDs in noXpChannelIds', () => {
	const config: Partial<GuildConfig> = {
		noXpChannelIds: ['123456789012345678', '123456789012345678']
	}
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('duplicate'))).toBeTruthy()
})

test('validateConfig rejects invalid rewardsMode', () => {
	const config = {
		rewardsMode: 'invalid' as unknown as GuildConfig['rewardsMode']
	} as Partial<GuildConfig>
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('rewardsMode'))).toBeTruthy()
})

test('validateConfig accepts both stack and replace modes', () => {
	const stackConfig: Partial<GuildConfig> = { rewardsMode: 'stack' }
	const replaceConfig: Partial<GuildConfig> = { rewardsMode: 'replace' }

	const stackResult = validateConfig(stackConfig)
	const replaceResult = validateConfig(replaceConfig)

	expect(stackResult.valid).toBeTruthy()
	expect(replaceResult.valid).toBeTruthy()
})

test('validateConfig rejects non-boolean removeRewardOnXpLoss', () => {
	const config = {
		removeRewardOnXpLoss: 'true' as unknown as boolean
	} as Partial<GuildConfig>
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('removeRewardOnXpLoss'))).toBeTruthy()
})

test('validateConfig rejects invalid leaderboard object', () => {
	const config = {
		leaderboard: 'invalid'
	} as unknown as Partial<GuildConfig>
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('leaderboard'))).toBeTruthy()
})

test('validateConfig rejects non-boolean leaderboard.public', () => {
	const config = {
		leaderboard: { public: 'true' }
	} as unknown as Partial<GuildConfig>
	const result = validateConfig(config)
	expect(result.valid).toBeFalsy()
	expect(result.errors.some((e) => e.includes('leaderboard.public'))).toBeTruthy()
})

// ============================================================================
// Test Suite: Role Rewards Validation
// ============================================================================

test('validateRoleRewards accepts empty array', () => {
	const errors = validateRoleRewards([])
	expect(errors.length).toBe(0)
})

test('validateRoleRewards accepts valid rewards with unique levels', () => {
	const rewards = [
		{ level: 5, roleId: '123456789012345678' },
		{ level: 10, roleId: '234567890123456789' }
	]
	const errors = validateRoleRewards(rewards)
	expect(errors.length).toBe(0)
})

test('validateRoleRewards rejects duplicate levels', () => {
	const rewards = [
		{ level: 5, roleId: '123456789012345678' },
		{ level: 5, roleId: '234567890123456789' }
	]
	const errors = validateRoleRewards(rewards)
	expect(errors.some((e) => e.includes('duplicate levels'))).toBeTruthy()
})

test('validateRoleRewards rejects negative levels', () => {
	const rewards = [{ level: -1, roleId: '123456789012345678' }]
	const errors = validateRoleRewards(rewards)
	expect(errors.some((e) => e.includes('non-negative'))).toBeTruthy()
})

test('validateRoleRewards rejects invalid roleIds', () => {
	const rewards = [
		{ level: 5, roleId: 'invalid' },
		{ level: 10, roleId: '123' }
	]
	const errors = validateRoleRewards(rewards)
	expect(errors.some((e) => e.includes('not a valid Discord snowflake'))).toBeTruthy()
})

test('validateRoleRewards accepts rewards in any order', () => {
	const rewards = [
		{ level: 10, roleId: '123456789012345678' },
		{ level: 5, roleId: '234567890123456789' },
		{ level: 15, roleId: '345678901234567890' }
	]
	const errors = validateRoleRewards(rewards)
	expect(errors.length).toBe(0)
})

// ============================================================================
// Test Suite: Multipliers Validation
// ============================================================================

test('validateMultipliers accepts undefined', () => {
	const errors = validateMultipliers(undefined)
	expect(errors.length).toBe(0)
})

test('validateMultipliers accepts valid server multiplier', () => {
	const multipliers = { server: 2.0 }
	const errors = validateMultipliers(multipliers)
	expect(errors.length).toBe(0)
})

test('validateMultipliers accepts valid role multipliers', () => {
	const multipliers = {
		role: {
			'123456789012345678': 1.5,
			'234567890123456789': 2.0
		}
	}
	const errors = validateMultipliers(multipliers)
	expect(errors.length).toBe(0)
})

test('validateMultipliers accepts valid user multipliers', () => {
	const multipliers = {
		user: {
			'123456789012345678': 0.5,
			'234567890123456789': 3.0
		}
	}
	const errors = validateMultipliers(multipliers)
	expect(errors.length).toBe(0)
})

test('validateMultipliers rejects zero server multiplier', () => {
	const multipliers = { server: 0 }
	const errors = validateMultipliers(multipliers)
	expect(errors.some((e) => e.includes('server'))).toBeTruthy()
})

test('validateMultipliers rejects negative multipliers', () => {
	const multipliers = {
		server: -1.5,
		role: { '123456789012345678': -2.0 },
		user: { '234567890123456789': -0.5 }
	}
	const errors = validateMultipliers(multipliers)
	expect(errors.length).toBeGreaterThanOrEqual(3) // All three should error
})

test('validateMultipliers accepts multipliers > 1 (boosts)', () => {
	const multipliers = {
		server: 3.0,
		role: { '123456789012345678': 5.0 }
	}
	const errors = validateMultipliers(multipliers)
	expect(errors.length).toBe(0)
})

test('validateMultipliers accepts multipliers < 1 (penalties)', () => {
	const multipliers = {
		server: 0.5,
		role: { '123456789012345678': 0.1 },
		user: { '234567890123456789': 0.01 }
	}
	const errors = validateMultipliers(multipliers)
	expect(errors.length).toBe(0)
})

test('validateMultipliers rejects non-object input', () => {
	const errors = validateMultipliers('invalid' as unknown as GuildConfig['multipliers'])
	expect(errors.some((e) => e.includes('must be object'))).toBeTruthy()
})

// ============================================================================
// Test Suite: Config Merging
// ============================================================================

test('mergeWithGlobal with empty global returns guild config with defaults', () => {
	const guild: Partial<GuildConfig> = { cooldownSeconds: 90 }
	const global: GlobalConfig = {}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.cooldownSeconds).toBe(90)
	expect(merged.xpRate).toBe(DEFAULT_XP_RATE)
	expect(merged.rewardsMode).toBe(DEFAULT_REWARDS_MODE)
})

test('mergeWithGlobal with global override applies to guild', () => {
	const guild: Partial<GuildConfig> = {}
	const global: GlobalConfig = { cooldownSeconds: 120 }

	const merged = mergeWithGlobal(guild, global)

	expect(merged.cooldownSeconds).toBe(120)
})

test('mergeWithGlobal guild override takes precedence over global', () => {
	const guild: Partial<GuildConfig> = { cooldownSeconds: 90 }
	const global: GlobalConfig = { cooldownSeconds: 120 }

	const merged = mergeWithGlobal(guild, global)

	expect(merged.cooldownSeconds).toBe(90)
})

test('mergeWithGlobal deep merges multipliers', () => {
	const guild: Partial<GuildConfig> = {
		multipliers: {
			role: { '123456789012345678': 2.0 }
		}
	}
	const global: GlobalConfig = {
		multipliers: {
			server: 1.5
		}
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.multipliers?.server).toBe(1.5)
	expect(merged.multipliers?.role?.['123456789012345678']).toBe(2.0)
})

test('mergeWithGlobal with guild role multiplier and global server multiplier keeps both', () => {
	const guild: Partial<GuildConfig> = {
		multipliers: {
			role: { '123456789012345678': 2.0 }
		}
	}
	const global: GlobalConfig = {
		multipliers: {
			server: 1.8,
			user: { '234567890123456789': 0.5 }
		}
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.multipliers?.server).toBe(1.8)
	expect(merged.multipliers?.role?.['123456789012345678']).toBe(2.0)
	expect(merged.multipliers?.user?.['234567890123456789']).toBe(0.5)
})

test('mergeWithGlobal with overlapping role multipliers prefers guild values', () => {
	const guild: Partial<GuildConfig> = {
		multipliers: {
			role: { '123456789012345678': 3.0 }
		}
	}
	const global: GlobalConfig = {
		multipliers: {
			role: { '123456789012345678': 2.0 }
		}
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.multipliers?.role?.['123456789012345678']).toBe(3.0)
})

test('mergeWithGlobal preserves arrays (does not concatenate)', () => {
	const guild: Partial<GuildConfig> = {
		noXpRoleIds: ['123456789012345678']
	}
	const global: GlobalConfig = {
		noXpRoleIds: ['234567890123456789']
	}

	const merged = mergeWithGlobal(guild, global)

	// Guild array should take precedence, not concatenate
	expect(merged.noXpRoleIds.length).toBe(1)
	expect(merged.noXpRoleIds[0]).toBe('123456789012345678')
})

test('mergeWithGlobal global arrays apply when guild has none', () => {
	const guild: Partial<GuildConfig> = {}
	const global: GlobalConfig = {
		noXpRoleIds: ['234567890123456789']
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.noXpRoleIds.length).toBe(1)
	expect(merged.noXpRoleIds[0]).toBe('234567890123456789')
})

// ============================================================================
// Test Suite: Global Defaults Applied to Existing Guilds
// ============================================================================

test('mergeWithGlobal applies global cooldown to existing guild with no override', () => {
	const guild: Partial<GuildConfig> = {
		xpRate: 1.5
	}
	const global: GlobalConfig = {
		cooldownSeconds: 120
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.cooldownSeconds).toBe(120)
	expect(merged.xpRate).toBe(1.5)
})

test('mergeWithGlobal applies global xpRate to existing guild with no override', () => {
	const guild: Partial<GuildConfig> = {
		cooldownSeconds: 90
	}
	const global: GlobalConfig = {
		xpRate: 2.0
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.cooldownSeconds).toBe(90)
	expect(merged.xpRate).toBe(2.0)
})

test('mergeWithGlobal applies multiple global defaults to existing guild', () => {
	const guild: Partial<GuildConfig> = {
		noXpRoleIds: ['111111111111111111']
	}
	const global: GlobalConfig = {
		cooldownSeconds: 120,
		xpRate: 1.8,
		rewardsMode: 'replace'
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.cooldownSeconds).toBe(120)
	expect(merged.xpRate).toBe(1.8)
	expect(merged.rewardsMode).toBe('replace')
	expect(merged.noXpRoleIds.length).toBe(1)
	expect(merged.noXpRoleIds[0]).toBe('111111111111111111')
})

test('mergeWithGlobal guild override takes precedence over global for existing guild', () => {
	const guild: Partial<GuildConfig> = {
		cooldownSeconds: 60,
		xpRate: 1.0
	}
	const global: GlobalConfig = {
		cooldownSeconds: 120,
		xpRate: 2.0
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.cooldownSeconds).toBe(60)
	expect(merged.xpRate).toBe(1.0)
})

test('mergeWithGlobal applies global multipliers to existing guild', () => {
	const guild: Partial<GuildConfig> = {
		cooldownSeconds: 90
	}
	const global: GlobalConfig = {
		multipliers: {
			server: 1.5
		}
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.cooldownSeconds).toBe(90)
	expect(merged.multipliers?.server).toBe(1.5)
})

test('mergeWithGlobal guild multipliers override global for existing guild', () => {
	const guild: Partial<GuildConfig> = {
		multipliers: {
			server: 2.0
		}
	}
	const global: GlobalConfig = {
		multipliers: {
			server: 1.5
		}
	}

	const merged = mergeWithGlobal(guild, global)

	expect(merged.multipliers?.server).toBe(2.0)
})
