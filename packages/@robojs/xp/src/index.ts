/**
 * @robojs/xp - XP and Leveling System for Discord Bots
 *
 * A comprehensive XP and leveling system plugin for Robo.js with standard defaults.
 * Provides XP manipulation APIs, configuration management, level curve mathematics,
 * role rewards, event system, and admin commands for Discord servers.
 *
 * ## Features
 *
 * - **Default Configuration**: Formula `XP = 5 * level^2 + 50 * level + 100` with standard settings
 * - **Role Rewards**: Automatic role assignment on level-up with stack/replace modes
 * - **XP Multipliers**: Per-user and per-role multipliers (premium features)
 * - **Event-Driven**: Type-safe events for levelUp, levelDown, xpChange
 * - **No-XP Zones**: Configure channels/roles to exclude from XP gains
 * - **Fully Typed**: Comprehensive TypeScript support with result types
 *
 * ## Installation
 *
 * ```bash
 * npm install @robojs/xp
 * ```
 *
 * ## Quick Start
 *
 * ### Basic XP Manipulation
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 *
 * // Award XP to a user
 * const result = await xp.add('guildId', 'userId', 100, { reason: 'contest_winner' })
 * if (result.leveledUp) {
 *   console.log(`User leveled up to ${result.newLevel}!`)
 * }
 *
 * // Remove XP for moderation
 * await xp.remove('guildId', 'userId', 50, { reason: 'spam_penalty' })
 *
 * // Set absolute XP value
 * await xp.set('guildId', 'userId', 5000)
 * ```
 *
 * ### Event Listening
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 * import type { LevelUpEvent } from '@robojs/xp'
 *
 * // Type-safe level-up listener
 * events.on('levelUp', (event: LevelUpEvent) => {
 *   console.log(`User ${event.userId} reached level ${event.newLevel}!`)
 *   // Role rewards applied automatically via internal listeners
 * })
 *
 * // Track all XP changes
 * events.on('xpChange', (event) => {
 *   console.log(`User ${event.userId} gained ${event.delta} XP (${event.reason})`)
 * })
 * ```
 *
 * ### Configuration Management
 *
 * ```typescript
 * import { config } from '@robojs/xp'
 *
 * // Get guild config (creates with defaults if needed)
 * const guildConfig = await config.get('123456789012345678')
 *
 * // Configure role rewards
 * await config.set('123456789012345678', {
 *   roleRewards: [
 *     { level: 5, roleId: '234567890123456789' },
 *     { level: 10, roleId: '345678901234567890' }
 *   ],
 *   rewardsMode: 'stack' // Users keep all qualifying roles
 * })
 *
 * // Set up XP multipliers (premium features)
 * await config.set('123456789012345678', {
 *   multipliers: {
 *     user: {
 *       'premiumUserId': 1.5 // +50% XP boost
 *     }
 *   }
 * })
 * ```
 *
 * ### Leaderboard Queries
 *
 * ```typescript
 * import { leaderboard } from '@robojs/xp'
 *
 * // Get top 10 users
 * const top10 = await leaderboard.get('guildId', 0, 10)
 * top10.forEach(entry => {
 *   console.log(`#${entry.rank}: ${entry.userId} - Level ${entry.level} (${entry.xp} XP)`)
 * })
 *
 * // Get user's rank position
 * const rankInfo = await leaderboard.getRank('guildId', 'userId')
 * if (rankInfo) {
 *   console.log(`You are rank ${rankInfo.rank} out of ${rankInfo.total}`)
 * }
 * ```
 *
 * ### Multi-Store Usage
 *
 * ```typescript
 * import { xp, leaderboard } from '@robojs/xp'
 *
 * // Default store (implicit - used by built-in commands)
 * await xp.add('guildId', 'userId', 100)
 * const defaultXP = await xp.get('guildId', 'userId')
 * const defaultLeaderboard = await leaderboard.get('guildId', 0, 10)
 *
 * // Custom reputation store
 * await xp.add('guildId', 'userId', 50, { storeId: 'reputation' })
 * const repXP = await xp.get('guildId', 'userId', { storeId: 'reputation' })
 * const repLeaderboard = await leaderboard.get('guildId', 0, 10, { storeId: 'reputation' })
 *
 * // Custom credits store
 * await xp.add('guildId', 'userId', 200, { storeId: 'credits' })
 * const creditsXP = await xp.get('guildId', 'userId', { storeId: 'credits' })
 *
 * // Built-in commands only use default store
 * // Custom stores require imperative API calls
 * ```
 *
 * **Use Cases:**
 * - **Leveling + Currencies**: Default store for XP/levels, custom stores for 'coins', 'gems', 'tokens'
 * - **Multi-Dimensional Reputation**: Separate stores for 'helpfulness', 'creativity', 'activity'
 * - **Seasonal Systems**: Isolated stores for 'season1', 'season2', 'season3'
 *
 * ## Integration Examples
 *
 * ### Contest Plugin Integration
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 *
 * // Award bonus XP to contest winners
 * const result = await xp.add(guildId, winnerId, 500, { reason: 'contest_winner' })
 * if (result.leveledUp) {
 *   await channel.send(`Congrats <@${winnerId}>! You leveled up to ${result.newLevel}!`)
 * }
 * ```
 *
 * ### Moderation Plugin Integration
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 *
 * // Remove XP for rule violations
 * try {
 *   await xp.remove(guildId, userId, 100, { reason: 'spam_violation' })
 * } catch (error) {
 *   logger.warn('User has no XP to remove')
 * }
 * ```
 *
 * ### Analytics Plugin Integration
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 *
 * // Track XP changes for analytics
 * events.on('xpChange', (event) => {
 *   analytics.track('xp_change', {
 *     guildId: event.guildId,
 *     userId: event.userId,
 *     delta: event.delta,
 *     reason: event.reason
 *   })
 * })
 * ```
 *
 * ### Announcement Plugin Integration
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 *
 * // Send level-up announcements
 * events.on('levelUp', async (event) => {
 *   const channel = await getAnnouncementChannel(event.guildId)
 *   await channel.send(`<@${event.userId}> reached level ${event.newLevel}!`)
 * })
 * ```
 *
 * ### Multi-Currency Economy Integration
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 *
 * // Default store for XP/leveling (includes role rewards)
 * await xp.add(guildId, userId, 20, { reason: 'message', storeId: 'default' })
 *
 * // Custom coins store for server currency
 * await xp.add(guildId, userId, 10, { reason: 'daily_bonus', storeId: 'coins' })
 *
 * // Custom tokens store for premium currency
 * await xp.add(guildId, userId, 5, { reason: 'purchase', storeId: 'tokens' })
 *
 * // Build custom commands for each store
 * // /balance - Show coins and tokens
 * // /rank - Show XP and level (default store)
 * ```
 *
 * ### Reputation System Integration
 *
 * ```typescript
 * import { xp, events } from '@robojs/xp'
 *
 * // Track different types of reputation
 * async function awardHelpfulnessRep(guildId: string, userId: string) {
 *   await xp.add(guildId, userId, 25, { reason: 'helped_member', storeId: 'helpfulness' })
 * }
 *
 * async function awardCreativityRep(guildId: string, userId: string) {
 *   await xp.add(guildId, userId, 50, { reason: 'created_content', storeId: 'creativity' })
 * }
 *
 * // Event listener filtering by store
 * events.on('levelUp', (event) => {
 *   if (event.storeId === 'helpfulness') {
 *     console.log(`${event.userId} leveled up in helpfulness!`)
 *   } else if (event.storeId === 'creativity') {
 *     console.log(`${event.userId} leveled up in creativity!`)
 *   }
 * })
 * ```
 *
 * ## Remarks
 *
 * ### Multi-Store Architecture
 *
 * The XP plugin supports multiple isolated data stores. Each store has:
 * - Independent user XP data and levels
 * - Independent guild configuration
 * - Independent leaderboard rankings and cache
 * - Independent event stream (events include `storeId` field)
 *
 * **Default Store ('default'):**
 * - Used by all built-in commands (/rank, /leaderboard, /xp)
 * - Role rewards only trigger for this store
 * - Automatic event processing
 *
 * **Custom Stores:**
 * - Accessed imperatively via API
 * - No automatic role rewards (prevents conflicts)
 * - Events include `storeId` for filtering
 *
 * **Flashcore Namespace Structure:**
 * - Default store: `['xp', 'default', guildId, 'users', userId]`
 * - Custom store: `['xp', 'reputation', guildId, 'users', userId]`
 * - Config: `['xp', storeId, guildId]` → `{ config, members, schema }`
 *
 * **Performance:**
 * - Each store maintains independent leaderboard cache (top 100, 60s TTL)
 * - Cache invalidation is per-store (XP changes in one store don't affect others)
 *
 * ### Event-Driven Architecture
 *
 * All XP mutations emit events after Flashcore persistence. Role rewards reconcile
 * automatically via event listeners. Events guarantee consistency (emitted only after
 * successful persistence).
 *
 * **Events include `storeId` field:**
 * - Allows event listeners to filter by store
 * - Role rewards only process default store events
 * - Leaderboard cache invalidation is per-store
 *
 * **Example:**
 * ```typescript
 * events.on('levelUp', (event) => {
 *   if (event.storeId === 'reputation') {
 *     // Handle reputation level-up
 *   }
 * })
 * ```
 *
 * ### Default Configuration
 *
 * - **Level curve formula**: `5*l² + 50*l + 100`
 * - **Default settings**: Standard XP system configuration
 * - **XP per message**: 15-25 XP with 60s cooldown
 * - **Role rewards**: Stack vs replace modes
 * - **Multipliers**: Premium features for advanced customization
 *
 * ### Performance Characteristics
 *
 * - **Leaderboard caching**: Top 100 users per guild, 60s TTL
 * - **Automatic cache invalidation**: On XP changes
 * - **Math operations**: All O(1) or O(log n)
 *
 * ### Persistence & Consistency
 *
 * - **Storage**: All data in Flashcore under 'xp' namespace
 * - **Guild-scoped data with stores**: `['xp', storeId, guildId, ...]`
 * - **Default store example**: `['xp', 'default', guildId, 'users', userId]`
 * - **Custom store example**: `['xp', 'reputation', guildId, 'users', userId]`
 * - **Config per store**: `['xp', storeId, guildId]` → `{ config, members, schema }`
 * - **Global config**: `['xp', 'global', 'config']`
 * - **Event timing**: Emitted only after successful persistence
 *
 * ### Type Safety
 *
 * - **Full TypeScript support**: Comprehensive types for all APIs
 * - **Event payloads**: Strongly typed via discriminated unions
 * - **Result types**: For all XP mutations (XPChangeResult, etc.)
 * - **Config validation**: Detailed error messages
 *
 * ### Extensibility
 *
 * - **Event system**: Custom integrations via typed event listeners
 * - **Config**: Custom multipliers per role/user
 * - **Theme support**: Custom embed colors
 * - **Manual reconciliation**: Advanced API for edge cases
 *
 * ## Documentation
 *
 * For full documentation, visit: https://docs.robojs.dev/plugins/xp
 *
 * @packageDocumentation
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
	UserXP,
	GuildConfig,
	GlobalConfig,
	RewardsMode,
	RoleReward,
	LevelUpEvent,
	LevelDownEvent,
	XPChangeEvent,
	LevelProgress,
	AddXPOptions,
	LeaderboardEntry,
	PluginOptions,
	StoreOptions,
	GetXPOptions,
	RecalcOptions,
	FlashcoreOptions
} from './types.js'

import type { LevelUpEvent, LevelDownEvent, XPChangeEvent } from './types.js'

/**
 * Result types for XP manipulation operations
 *
 * These types are returned by XP mutation functions to provide detailed
 * information about the operation's outcome:
 *
 * - **XPChangeResult**: Returned by `xp.add()` with `leveledUp` flag
 * - **XPRemoveResult**: Returned by `xp.remove()` with `leveledDown` flag
 * - **XPSetResult**: Returned by `xp.set()` with old/new values
 * - **RecalcResult**: Returned by `xp.recalc()` with reconciliation status
 *
 * @example
 * ```typescript
 * import { xp } from '@robojs/xp'
 * import type { XPChangeResult } from '@robojs/xp'
 *
 * const result: XPChangeResult = await xp.add(guildId, userId, 100)
 * if (result.leveledUp) {
 *   console.log(`Leveled up from ${result.oldLevel} to ${result.newLevel}!`)
 * }
 * ```
 */
export type { XPChangeResult, XPRemoveResult, XPSetResult, RecalcResult } from './core/xp.js'

// ============================================================================
// Math Utilities
// ============================================================================

import {
	xpNeededForLevel,
	totalXpForLevel,
	computeLevelFromTotalXp,
	progressInLevel,
	xpDeltaForLevelRange,
	isValidLevel,
	isValidXp,
	DEFAULT_CURVE_A,
	DEFAULT_CURVE_B,
	DEFAULT_CURVE_C
} from './math/curve.js'

/**
 * Standard level curve mathematics
 *
 * Provides pure, deterministic functions for XP calculations using the default
 * formula: `XP = 5 * level² + 50 * level + 100`
 *
 * **Features:**
 * - Calculate XP requirements for levels
 * - Compute level from total XP
 * - Calculate progress within a level
 * - Validate XP and level values
 * - Compute XP differences between level ranges
 *
 * **Performance:** All operations are O(1) or O(log n) - suitable for real-time use.
 *
 * **Formula Coefficients:**
 * - DEFAULT_CURVE_A (5): Quadratic coefficient - controls exponential growth
 * - DEFAULT_CURVE_B (50): Linear coefficient - controls linear growth
 * - DEFAULT_CURVE_C (100): Constant - base XP for level 1
 *
 * @example
 * ### Basic Level Calculations
 *
 * ```typescript
 * import { math } from '@robojs/xp'
 *
 * // Calculate XP needed to reach level 10 from level 0
 * const xpNeeded = math.xpNeededForLevel(10) // 1100
 *
 * // Calculate cumulative XP needed to reach level 50
 * const totalXp = math.totalXpForLevel(50) // 137600
 *
 * // Calculate XP difference between levels 10 and 20
 * const delta = math.xpDeltaForLevelRange(10, 20) // 2500
 * ```
 *
 * @example
 * ### Computing Level from XP
 *
 * ```typescript
 * import { math } from '@robojs/xp'
 *
 * // Get current level and progress from total XP
 * const progress = math.computeLevelFromTotalXp(1500)
 * console.log(`Level ${progress.level}`) // Level 10
 * console.log(`Progress: ${progress.inLevel}/${progress.toNext}`) // Progress: 400/1200
 * ```
 *
 * @example
 * ### Building Progress Bars
 *
 * ```typescript
 * import { math } from '@robojs/xp'
 *
 * // Calculate progress for UI display
 * const { percentage, inLevel, toNext } = math.progressInLevel(1500)
 * console.log(`${percentage.toFixed(1)}% to next level`) // 33.3% to next level
 *
 * // Build a progress bar
 * const barLength = 20
 * const filled = Math.floor((inLevel / (inLevel + toNext)) * barLength)
 * const bar = '▰'.repeat(filled) + '▱'.repeat(barLength - filled)
 * console.log(`[${bar}] ${inLevel}/${inLevel + toNext} XP`)
 * ```
 *
 * @example
 * ### Validating User Input
 *
 * ```typescript
 * import { math } from '@robojs/xp'
 *
 * // Validate user input before setting XP
 * const userInput = parseInt(input)
 * if (!math.isValidXp(userInput)) {
 *   throw new Error('XP must be a non-negative number')
 * }
 *
 * // Validate level before calculations
 * if (!math.isValidLevel(targetLevel)) {
 *   throw new Error('Level must be a non-negative number')
 * }
 * ```
 *
 * @example
 * ### Reward Planning
 *
 * ```typescript
 * import { math, constants } from '@robojs/xp'
 *
 * // Calculate XP rewards for reaching milestones
 * const xpFor50 = math.totalXpForLevel(50)
 * const xpFor100 = math.totalXpForLevel(100)
 * const reward = Math.floor((xpFor100 - xpFor50) * 0.1) // 10% of XP difference
 *
 * console.log(`Reward for level 100: ${reward} XP`)
 *
 * // Use formula coefficients for custom calculations
 * const { DEFAULT_CURVE_A, DEFAULT_CURVE_B, DEFAULT_CURVE_C } = constants
 * const customXp = (level: number) => DEFAULT_CURVE_A * level ** 2 + DEFAULT_CURVE_B * level + DEFAULT_CURVE_C
 * ```
 *
 * @remarks
 * All math functions are pure and deterministic - same inputs always produce
 * same outputs. No side effects or external dependencies. Safe for concurrent use.
 */
export const math = {
	/** Calculate XP required to reach a specific level from level 0 */
	xpNeededForLevel,

	/** Calculate cumulative XP needed to reach a level */
	totalXpForLevel,

	/** Compute current level and progress from total XP */
	computeLevelFromTotalXp,

	/** Calculate progress within current level (absolute and percentage) */
	progressInLevel,

	/** Calculate XP difference between two levels */
	xpDeltaForLevelRange,

	/** Validate if a level is valid (non-negative) */
	isValidLevel,

	/** Validate if XP amount is valid (non-negative) */
	isValidXp
}

// ============================================================================
// Configuration Management
// ============================================================================

import {
	getConfig,
	setConfig,
	getGlobalConfig,
	setGlobalConfig,
	validateConfig,
	getDefaultConfig,
	DEFAULT_COOLDOWN,
	DEFAULT_XP_RATE,
	DEFAULT_REWARDS_MODE,
	DEFAULT_REMOVE_ON_LOSS,
	DEFAULT_LEADERBOARD_PUBLIC
} from './config.js'

/**
 * Configuration management for XP system
 *
 * Provides comprehensive configuration management with validation, defaults,
 * and guild-specific overrides. All configuration changes are persisted to
 * Flashcore immediately.
 *
 * **Features:**
 * - Guild-specific and global configuration
 * - Automatic validation with detailed error messages
 * - Standard defaults for easy setup
 * - Role rewards, multipliers, and No-XP zones
 * - Cache invalidation when using setGlobal
 *
 * **Config Precedence** (highest to lowest):
 * 1. Guild-specific config (via `config.set()`)
 * 2. Global config defaults (via `config.setGlobal()`)
 * 3. System defaults
 *
 * @example
 * ### Basic Configuration
 *
 * ```typescript
 * import { config } from '@robojs/xp'
 *
 * // Get guild config (creates with defaults if not found)
 * const guildConfig = await config.get('123456789012345678')
 * console.log(`Cooldown: ${guildConfig.cooldownSeconds}s`)
 *
 * // Update guild config
 * await config.set('123456789012345678', {
 *   cooldownSeconds: 120, // 2 minutes between XP awards
 *   xpRate: 1.5 // +50% XP boost for entire guild
 * })
 * ```
 *
 * @example
 * ### Role Rewards Configuration
 *
 * ```typescript
 * import { config } from '@robojs/xp'
 *
 * // Configure role rewards with stack mode (users keep all qualifying roles)
 * await config.set('123456789012345678', {
 *   roleRewards: [
 *     { level: 5, roleId: '234567890123456789' },
 *     { level: 10, roleId: '345678901234567890' },
 *     { level: 25, roleId: '456789012345678901' }
 *   ],
 *   rewardsMode: 'stack', // Users accumulate all roles
 *   removeRewardsOnLoss: false // Keep roles even if user loses XP
 * })
 *
 * // Configure with replace mode (only highest level role)
 * await config.set('123456789012345678', {
 *   rewardsMode: 'replace' // Users get only their highest qualifying role
 * })
 * ```
 *
 * @example
 * ### XP Multipliers (Premium Features)
 *
 * ```typescript
 * import { config } from '@robojs/xp'
 *
 * // Set up multipliers for premium users
 * await config.set('123456789012345678', {
 *   multipliers: {
 *     user: {
 *       'premiumUserId1': 1.5, // +50% XP boost
 *       'vipUserId2': 2.0 // +100% XP boost (double XP)
 *     },
 *     role: {
 *       'boosterRoleId': 1.2, // +20% for server boosters
 *       'donorRoleId': 1.3 // +30% for donors
 *     }
 *   }
 * })
 *
 * // Multipliers stack: user with both roles gets 1.2 * 1.3 = 1.56x total
 * ```
 *
 * @example
 * ### No-XP Zones Configuration
 *
 * ```typescript
 * import { config } from '@robojs/xp'
 *
 * // Configure roles and channels to exclude from XP gains
 * await config.set('123456789012345678', {
 *   noXpRoles: [
 *     'mutedRoleId', // Muted users don't gain XP
 *     'botRoleId' // Bots don't gain XP
 *   ],
 *   noXpChannels: [
 *     'spamChannelId', // Spam channels don't award XP
 *     'botCommandsChannelId' // Command channels excluded
 *   ]
 * })
 * ```
 *
 * @example
 * ### Validation Before Updates
 *
 * ```typescript
 * import { config } from '@robojs/xp'
 *
 * // Validate config before applying
 * const userConfig = {
 *   cooldownSeconds: -10, // Invalid: negative value
 *   xpRate: 'invalid' // Invalid: not a number
 * }
 *
 * const validation = config.validate(userConfig)
 * if (!validation.valid) {
 *   console.error('Config validation failed:', validation.errors)
 *   // Errors: ['cooldownSeconds must be non-negative', 'xpRate must be a number']
 * } else {
 *   await config.set(guildId, userConfig)
 * }
 * ```
 *
 * @example
 * ### Global Defaults for Bot Networks
 *
 * ```typescript
 * import { config } from '@robojs/xp'
 *
 * // Set global defaults for all guilds
 * await config.setGlobal({
 *   cooldownSeconds: 90, // Default 90s cooldown for all guilds
 *   xpRate: 1.0,
 *   rewardsMode: 'stack'
 * })
 *
 * // Individual guilds can still override
 * await config.set('specificGuildId', {
 *   cooldownSeconds: 60 // This guild uses 60s instead of global 90s
 * })
 * ```
 *
 * @example
 * ### Default Configuration Setup
 *
 * ```typescript
 * import { config } from '@robojs/xp'
 *
 * // Default config uses standard settings - no setup needed!
 * const defaultConfig = config.getDefault()
 * console.log(defaultConfig)
 * // {
 * //   cooldownSeconds: 60,
 * //   xpRate: 1.0,
 * //   rewardsMode: 'stack',
 * //   removeRewardsOnLoss: false,
 * //   ...
 * // }
 *
 * // Get guild config with defaults applied
 * const guildConfig = await config.get('123456789012345678')
 * // Returns default configuration if not customized
 * ```
 *
 * @remarks
 * - Config changes are validated before persistence
 * - Global config updates invalidate caches for consistency
 * - Default settings: 60s cooldown, 15-25 XP/msg, stack mode
 * - Multipliers stack multiplicatively (user * role * guild)
 */
export const config = {
	/** Get guild configuration with all defaults applied */
	get: getConfig,

	/** Update guild configuration with validation */
	set: setConfig,

	/** Get global configuration defaults */
	getGlobal: getGlobalConfig,

	/** Set global configuration defaults */
	setGlobal: setGlobalConfig,

	/** Validate configuration object */
	validate: validateConfig,

	/** Get default configuration */
	getDefault: getDefaultConfig
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration constants
 *
 * These values represent the standard default configuration. Reference these
 * constants when:
 * - Building documentation or UI that references defaults
 * - Implementing custom XP calculations using the default formula
 * - Validating user input against default values
 * - Creating custom configurations that extend defaults
 *
 * **Default Formula Coefficients:**
 * - **DEFAULT_CURVE_A (5)**: Quadratic coefficient - controls exponential growth rate
 * - **DEFAULT_CURVE_B (50)**: Linear coefficient - controls linear growth component
 * - **DEFAULT_CURVE_C (100)**: Constant term - base XP requirement for level 1
 * - **Formula**: `XP = 5*level² + 50*level + 100`
 *
 * @example
 * ### Reference Defaults in Documentation
 *
 * ```typescript
 * import { constants } from '@robojs/xp'
 *
 * console.log(`Default cooldown: ${constants.DEFAULT_COOLDOWN}s`)
 * console.log(`Default XP rate: ${constants.DEFAULT_XP_RATE}x`)
 * console.log(`Default rewards mode: ${constants.DEFAULT_REWARDS_MODE}`)
 * ```
 *
 * @example
 * ### Use Formula Coefficients for Custom Calculations
 *
 * ```typescript
 * import { constants } from '@robojs/xp'
 *
 * const { DEFAULT_CURVE_A, DEFAULT_CURVE_B, DEFAULT_CURVE_C } = constants
 *
 * // Implement custom XP calculation
 * function calculateXpForLevel(level: number): number {
 *   return DEFAULT_CURVE_A * level ** 2 + DEFAULT_CURVE_B * level + DEFAULT_CURVE_C
 * }
 *
 * // Calculate XP needed for level 50
 * const xpNeeded = calculateXpForLevel(50) // 15100
 * ```
 *
 * @example
 * ### Validate Against Defaults
 *
 * ```typescript
 * import { constants } from '@robojs/xp'
 *
 * // Check if user config matches defaults
 * if (userConfig.cooldownSeconds === constants.DEFAULT_COOLDOWN) {
 *   console.log('Using default cooldown (60s)')
 * }
 *
 * // Determine if custom XP rate is applied
 * const isCustomRate = guildConfig.xpRate !== constants.DEFAULT_XP_RATE
 * console.log(`Custom XP rate: ${isCustomRate ? 'Yes' : 'No'}`)
 * ```
 *
 * @example
 * ### Build Custom Config with Selective Overrides
 *
 * ```typescript
 * import { constants } from '@robojs/xp'
 *
 * // Start with defaults, override specific values
 * const customConfig = {
 *   cooldownSeconds: constants.DEFAULT_COOLDOWN, // Keep default 60s
 *   xpRate: 1.5, // Override: +50% XP boost
 *   rewardsMode: constants.DEFAULT_REWARDS_MODE, // Keep default 'stack'
 *   removeRewardsOnLoss: false // Keep default behavior
 * }
 * ```
 */
export const constants = {
	/** Default cooldown between XP awards (60 seconds) */
	DEFAULT_COOLDOWN,

	/** Default XP rate multiplier (1.0 = no modification) */
	DEFAULT_XP_RATE,

	/** Default rewards mode ('stack' = keep all role rewards) */
	DEFAULT_REWARDS_MODE,

	/** Default remove rewards on XP loss (false = keep rewards) */
	DEFAULT_REMOVE_ON_LOSS,

	/** Default leaderboard visibility (false = restricted) */
	DEFAULT_LEADERBOARD_PUBLIC,

	/** Default level curve formula coefficient A (quadratic term: 5) */
	DEFAULT_CURVE_A,

	/** Default level curve formula coefficient B (linear term: 50) */
	DEFAULT_CURVE_B,

	/** Default level curve formula coefficient C (constant term: 100) */
	DEFAULT_CURVE_C
}

// Export curve constants as named exports
export { DEFAULT_CURVE_A, DEFAULT_CURVE_B, DEFAULT_CURVE_C }

// ============================================================================
// Event System
// ============================================================================

import { on, once, off } from './runtime/events.js'

// Initialize role rewards system (registers event listeners)
import './runtime/rewards.js'

/**
 * Event system for XP changes and level progression
 *
 * Type-safe event system for subscribing to XP-related events. All events are
 * emitted **after** Flashcore persistence, guaranteeing consistency.
 *
 * **Available Events:**
 * - `'levelUp'`: Emitted when a user gains a level (typed as `LevelUpEvent`)
 * - `'levelDown'`: Emitted when a user loses a level (typed as `LevelDownEvent`)
 * - `'xpChange'`: Emitted on any XP change (typed as `XPChangeEvent`)
 *
 * **All events include `storeId` field:**
 * - Identifies which data store triggered the event
 * - Allows event listeners to filter events by store
 * - Role rewards only process default store events
 * - Leaderboard cache invalidation uses this for per-store invalidation
 *
 * **Convenience Methods** (delegates to `on()`):
 * - `onLevelUp(handler)`: Shorthand for `on('levelUp', handler)`
 * - `onLevelDown(handler)`: Shorthand for `on('levelDown', handler)`
 * - `onXPChange(handler)`: Shorthand for `on('xpChange', handler)`
 *
 * **Features:**
 * - Strongly typed event payloads via discriminated unions
 * - Events emitted synchronously after persistence
 * - Automatic role reconciliation via internal event listeners
 * - One-time listeners via `once()`
 * - Listener removal via `off()`
 * - Convenience methods for common event types
 *
 * @example
 * ### Type-Safe Level-Up Listener (with convenience method)
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 * import type { LevelUpEvent } from '@robojs/xp'
 *
 * // Using convenience method
 * events.onLevelUp((event: LevelUpEvent) => {
 *   console.log(`User ${event.userId} leveled up to level ${event.newLevel}!`)
 * })
 *
 * // Or using generic on() method
 * events.on('levelUp', (event: LevelUpEvent) => {
 *   console.log(`User ${event.userId} leveled up to level ${event.newLevel}!`)
 * })
 * ```
 *
 * @example
 * ### Level-Down Listener (XP Removal)
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 * import type { LevelDownEvent } from '@robojs/xp'
 *
 * // Using convenience method
 * events.onLevelDown((event: LevelDownEvent) => {
 *   console.log(`User ${event.userId} dropped to level ${event.newLevel}`)
 * })
 *
 * // Or using generic on() method
 * events.on('levelDown', (event: LevelDownEvent) => {
 *   console.log(`User ${event.userId} dropped to level ${event.newLevel}`)
 *   // Role rewards removed automatically if removeRewardsOnLoss is true
 * })
 * ```
 *
 * @example
 * ### Track All XP Changes (with convenience method)
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 * import type { XPChangeEvent } from '@robojs/xp'
 *
 * // Using convenience method
 * events.onXPChange((event: XPChangeEvent) => {
 *   console.log(`Store ${event.storeId}: User ${event.userId} XP changed by ${event.delta}`)
 * })
 *
 * // Or using generic on() method
 * events.on('xpChange', (event: XPChangeEvent) => {
 *   console.log(`User ${event.userId} XP changed by ${event.delta}`)
 *   console.log(`Store: ${event.storeId}`)
 *   console.log(`Reason: ${event.reason || 'message'}`)
 *   console.log(`Old XP: ${event.oldXp}, New XP: ${event.newXp}`)
 * })
 * ```
 *
 * @example
 * ### Level-Down Listener (XP Removal)
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 * import type { LevelDownEvent } from '@robojs/xp'
 *
 * // Handle level-down events (e.g., from moderation)
 * events.on('levelDown', (event: LevelDownEvent) => {
 *   console.log(`User ${event.userId} dropped to level ${event.newLevel}`)
 *   console.log(`Lost ${event.oldLevel - event.newLevel} levels`)
 *   // Role rewards removed automatically if removeRewardsOnLoss is true
 * })
 * ```
 *
 * @example
 * ### Track All XP Changes
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 * import type { XPChangeEvent } from '@robojs/xp'
 *
 * // Listen for any XP change (level-up, level-down, or same level)
 * events.on('xpChange', (event: XPChangeEvent) => {
 *   console.log(`User ${event.userId} XP changed by ${event.delta}`)
 *   console.log(`Reason: ${event.reason || 'message'}`)
 *   console.log(`Old XP: ${event.oldXp}, New XP: ${event.newXp}`)
 *   console.log(`Old Level: ${event.oldLevel}, New Level: ${event.newLevel}`)
 * })
 * ```
 *
 * @example
 * ### One-Time Listener
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 *
 * // Listen for first level-up only
 * events.once('levelUp', (event) => {
 *   console.log('First level up detected!')
 *   console.log(`User ${event.userId} reached level ${event.newLevel}`)
 *   // Listener automatically removed after first trigger
 * })
 * ```
 *
 * @example
 * ### Remove Listener
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 * import type { XPChangeEvent } from '@robojs/xp'
 *
 * // Create a named listener function
 * const trackXpChanges = (event: XPChangeEvent) => {
 *   console.log(`XP changed: ${event.delta}`)
 * }
 *
 * // Register listener
 * events.on('xpChange', trackXpChanges)
 *
 * // Later, remove listener
 * events.off('xpChange', trackXpChanges)
 * ```
 *
 * @example
 * ### Build Level-Up Announcement System
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 * import { client } from 'robo.js'
 *
 * events.on('levelUp', async (event) => {
 *   // Get guild and user
 *   const guild = await client.guilds.fetch(event.guildId)
 *   const member = await guild.members.fetch(event.userId)
 *
 *   // Send announcement to system channel
 *   const channel = guild.systemChannel
 *   if (channel) {
 *     await channel.send({
 *       content: `Congratulations <@${event.userId}>! You reached level ${event.newLevel}!`,
 *       allowedMentions: { users: [event.userId] }
 *     })
 *   }
 * })
 * ```
 *
 * @example
 * ### Track XP for Analytics (with multi-store support)
 *
 * ```typescript
 * import { events } from '@robojs/xp'
 *
 * events.on('xpChange', (event) => {
 *   // Send to analytics service
 *   analytics.track('xp_change', {
 *     guildId: event.guildId,
 *     userId: event.userId,
 *     storeId: event.storeId,
 *     delta: event.delta,
 *     reason: event.reason,
 *     timestamp: Date.now()
 *   })
 * })
 *
 * // Filter by store for specific tracking
 * events.on('levelUp', (event) => {
 *   if (event.storeId === 'reputation') {
 *     analytics.track('reputation_level_up', {
 *       guildId: event.guildId,
 *       userId: event.userId,
 *       newLevel: event.newLevel
 *     })
 *   }
 * })
 * ```
 *
 * @remarks
 * - Events are emitted **after** successful Flashcore persistence
 * - Role rewards reconcile automatically via internal event listeners
 * - Event names are string literals: `'levelUp'`, `'levelDown'`, `'xpChange'`
 * - TypeScript provides type safety for event payloads via discriminated unions
 * - Events are emitted synchronously - listeners run immediately
 * - Internal listeners for role rewards are registered in `runtime/rewards.ts`
 */
export const events = {
	/** Register a persistent event listener */
	on,

	/** Register a one-time event listener */
	once,

	/** Remove an event listener */
	off,

	/** Convenience method: Register a listener for level-up events */
	onLevelUp: (handler: (event: LevelUpEvent) => void) => on('levelUp', handler),

	/** Convenience method: Register a listener for level-down events */
	onLevelDown: (handler: (event: LevelDownEvent) => void) => on('levelDown', handler),

	/** Convenience method: Register a listener for XP change events */
	onXPChange: (handler: (event: XPChangeEvent) => void) => on('xpChange', handler)
}

// ============================================================================
// XP Manipulation API
// ============================================================================

import {
	addXP as addXPCore,
	removeXP as removeXPCore,
	setXP as setXPCore,
	recalcLevel as recalcLevelCore,
	getXP as getXPCore,
	getLevel as getLevelCore,
	getUserData as getUserDataCore
} from './core/xp.js'

/**
 * XP manipulation API for programmatic XP management
 *
 * Core API for adding, removing, setting, and querying user XP. All XP mutations
 * are transactional and automatically trigger events and role reconciliation.
 *
 * **Features:**
 * - Add/remove/set XP values with type-safe result objects
 * - Automatic level calculation based on default curve
 * - Event emission (levelUp, levelDown, xpChange) after persistence
 * - Automatic role reward reconciliation via event listeners
 * - Flashcore persistence with consistency guarantees
 * - Error handling for invalid inputs and missing users
 *
 * **Method Aliases:**
 * - `add()` or `addXP()` - Award XP to a user
 * - `remove()` or `removeXP()` - Remove XP from a user
 * - `set()` or `setXP()` - Set absolute XP value
 * - `get()` or `getXP()` - Get user's total XP
 *
 * **All XP Mutations Automatically:**
 * 1. Validate inputs (non-negative amounts, valid IDs)
 * 2. Load or create user record
 * 3. Calculate new level using default formula
 * 4. Persist to Flashcore
 * 5. Emit events (after successful persistence)
 * 6. Trigger role reconciliation (via event listeners)
 *
 * @example
 * ### Award XP with Level-Up Detection (using addXP)
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 * import type { XPChangeResult } from '@robojs/xp'
 *
 * // Award XP to a user (default store)
 * const result: XPChangeResult = await xp.addXP('guildId', 'userId', 100, {
 *   reason: 'contest_winner'
 * })
 *
 * console.log(`Old XP: ${result.oldXp}, New XP: ${result.newXp}`)
 * console.log(`Old Level: ${result.oldLevel}, New Level: ${result.newLevel}`)
 *
 * if (result.leveledUp) {
 *   console.log(`User leveled up to ${result.newLevel}!`)
 *   // Role rewards already applied automatically via event listeners
 * }
 *
 * // Award XP to custom store (parallel progression)
 * await xp.add('guildId', 'userId', 50, { reason: 'helped_user', storeId: 'reputation' })
 * ```
 *
 * @example
 * ### Remove XP with Error Handling (using removeXP)
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 * import type { XPRemoveResult } from '@robojs/xp'
 *
 * // Remove XP for moderation - using removeXP alias
 * try {
 *   const result: XPRemoveResult = await xp.removeXP('guildId', 'userId', 100, {
 *     reason: 'spam_violation'
 *   })
 *
 *   if (result.leveledDown) {
 *     console.log(`User dropped from level ${result.oldLevel} to ${result.newLevel}`)
 *     // Roles removed automatically if removeRewardsOnLoss is true
 *   }
 * } catch (error) {
 *   console.error('Failed to remove XP:', error.message)
 *   // Handle user not found or other errors
 * }
 *
 * // Or use the shorthand remove() method (equivalent)
 * const result2 = await xp.remove('guildId', 'userId', 100, { reason: 'spam_violation' })
 * ```
 *
 * @example
 * ### Set Absolute XP Value (using setXP)
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 * import type { XPSetResult } from '@robojs/xp'
 *
 * // Set absolute XP value (admin tool) - using setXP alias
 * const result: XPSetResult = await xp.setXP('guildId', 'userId', 10000)
 *
 * console.log(`XP changed from ${result.oldXp} to ${result.newXp}`)
 * console.log(`Level changed from ${result.oldLevel} to ${result.newLevel}`)
 *
 * // Events emitted based on level change:
 * // - If newLevel > oldLevel: 'levelUp' event
 * // - If newLevel < oldLevel: 'levelDown' event
 * // - Always: 'xpChange' event
 *
 * // Or use the shorthand set() method (equivalent)
 * const result2 = await xp.set('guildId', 'userId', 10000)
 * ```
 *
 * @example
 * ### Query User XP Data (using getXP)
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 *
 * // Get user's total XP - using getXP alias
 * const totalXp = await xp.getXP('guildId', 'userId')
 * console.log(`User has ${totalXp} XP`) // Returns 0 if not found
 *
 * // Or use the shorthand get() method (equivalent)
 * const totalXp2 = await xp.get('guildId', 'userId')
 *
 * // Get user's level
 * const level = await xp.getLevel('guildId', 'userId')
 * console.log(`User is level ${level}`) // Returns 0 if not found
 *
 * // Get full user XP record
 * const user = await xp.getUser('guildId', 'userId')
 * if (user) {
 *   console.log(`XP: ${user.xp}, Level: ${user.level}`)
 *   console.log(`Messages: ${user.messages}`)
 *   console.log(`Last awarded: ${new Date(user.lastAwardedAt)}`)
 * } else {
 *   console.log('User has no XP record')
 * }
 * ```
 *
 * @example
 * ### Remove XP with Error Handling
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 * import type { XPRemoveResult } from '@robojs/xp'
 *
 * // Remove XP for moderation (with error handling)
 * try {
 *   const result: XPRemoveResult = await xp.remove('guildId', 'userId', 100, {
 *     reason: 'spam_violation'
 *   })
 *
 *   if (result.leveledDown) {
 *     console.log(`User dropped from level ${result.oldLevel} to ${result.newLevel}`)
 *     // Roles removed automatically if removeRewardsOnLoss is true
 *   }
 * } catch (error) {
 *   console.error('Failed to remove XP:', error.message)
 *   // Handle user not found or other errors
 * }
 * ```
 *
 * @example
 * ### Set Absolute XP Value
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 * import type { XPSetResult } from '@robojs/xp'
 *
 * // Set absolute XP value (admin tool)
 * const result: XPSetResult = await xp.set('guildId', 'userId', 10000)
 *
 * console.log(`XP changed from ${result.oldXp} to ${result.newXp}`)
 * console.log(`Level changed from ${result.oldLevel} to ${result.newLevel}`)
 *
 * // Events emitted based on level change:
 * // - If newLevel > oldLevel: 'levelUp' event
 * // - If newLevel < oldLevel: 'levelDown' event
 * // - Always: 'xpChange' event
 * ```
 *
 * @example
 * ### Query User XP Data
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 *
 * // Get user's total XP
 * const totalXp = await xp.get('guildId', 'userId')
 * console.log(`User has ${totalXp} XP`) // Returns 0 if not found
 *
 * // Get user's level
 * const level = await xp.getLevel('guildId', 'userId')
 * console.log(`User is level ${level}`) // Returns 0 if not found
 *
 * // Get full user XP record
 * const user = await xp.getUser('guildId', 'userId')
 * if (user) {
 *   console.log(`XP: ${user.xp}, Level: ${user.level}`)
 *   console.log(`Messages: ${user.messages}`)
 *   console.log(`Last awarded: ${new Date(user.lastAwardedAt)}`)
 * } else {
 *   console.log('User has no XP record')
 * }
 * ```
 *
 * @example
 * ### Recalculate Level After Config Changes
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 * import type { RecalcResult } from '@robojs/xp'
 *
 * // Recalculate level from total XP (useful after config changes)
 * const result: RecalcResult = await xp.recalc('guildId', 'userId')
 *
 * if (result.reconciled) {
 *   console.log(`Level corrected: ${result.oldLevel} → ${result.newLevel}`)
 *   console.log(`Total XP: ${result.totalXp}`)
 *   // Role rewards reconciled automatically
 * } else {
 *   console.log('Level was already correct')
 * }
 * ```
 *
 * @example
 * ### Contest Plugin Integration
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 *
 * // Award bonus XP to contest winners
 * async function awardContestPrize(guildId: string, winners: string[]) {
 *   const prizes = [500, 300, 100] // 1st, 2nd, 3rd place
 *
 *   for (let i = 0; i < winners.length; i++) {
 *     const result = await xp.add(guildId, winners[i], prizes[i], {
 *       reason: `contest_place_${i + 1}`
 *     })
 *
 *     if (result.leveledUp) {
 *       await announceWinner(winners[i], result.newLevel, prizes[i])
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * ### Moderation Plugin Integration
 *
 * ```typescript
 * import { xp } from '@robojs/xp'
 *
 * // Remove XP for rule violations
 * async function penalizeUser(guildId: string, userId: string, severity: 'minor' | 'major') {
 *   const penalty = severity === 'major' ? 500 : 100
 *
 *   try {
 *     const result = await xp.remove(guildId, userId, penalty, {
 *       reason: `${severity}_violation`
 *     })
 *
 *     if (result.leveledDown) {
 *       logger.info(`User ${userId} penalized: level ${result.oldLevel} → ${result.newLevel}`)
 *     }
 *   } catch (error) {
 *     logger.warn(`Failed to penalize user ${userId}: ${error.message}`)
 *   }
 * }
 * ```
 *
 * @remarks
 * - All mutations validate inputs before execution (non-negative amounts, valid IDs)
 * - Events are emitted **after** successful Flashcore persistence
 * - Role rewards reconcile automatically via internal event listeners
 * - `get()` and `getLevel()` return 0 for users with no XP record
 * - `getUser()` returns `null` for users with no XP record
 * - `add()` and `remove()` create user records if they don't exist
 * - `recalc()` is idempotent - safe to call multiple times
 */
export const XP = {
	/** Add XP to a user (emits events, triggers role reconciliation) */
	add: addXPCore,

	/** Add XP to a user - alias for add() */
	addXP: addXPCore,

	/** Remove XP from a user (emits events, triggers role reconciliation) */
	remove: removeXPCore,

	/** Remove XP from a user - alias for remove() */
	removeXP: removeXPCore,

	/** Set absolute XP value for a user (emits events, triggers role reconciliation) */
	set: setXPCore,

	/** Set absolute XP value for a user - alias for set() */
	setXP: setXPCore,

	/** Recalculate level from total XP and reconcile roles */
	recalc: recalcLevelCore,

	/** Get user's total XP (returns 0 if not found) */
	get: getXPCore,

	/** Get user's total XP - alias for get() */
	getXP: getXPCore,

	/** Get user's level (returns 0 if not found) */
	getLevel: getLevelCore,

	/** Get full user XP record (returns null if not found) */
	getUser: getUserDataCore
}
export const xp = XP

// ============================================================================
// Leaderboard API
// ============================================================================

import {
	getLeaderboard as getLeaderboardCore,
	getUserRank as getUserRankCore,
	invalidateCache as invalidateCacheCore
} from './runtime/service.js'

/**
 * Leaderboard API for ranking and leaderboard operations
 *
 * High-performance leaderboard system with intelligent caching for fast queries
 * on large servers. Designed to handle 10k+ users with under 200ms response times.
 *
 * **Features:**
 * - In-memory caching of top 100 users per guild
 * - Automatic cache invalidation on XP changes
 * - Paginated leaderboard retrieval
 * - Efficient rank position lookup
 * - Stable sort (XP desc, userId asc)
 * - Cache warming on first query
 *
 * **Caching Behavior:**
 * - **Cache TTL**: 60 seconds (auto-refresh on expiry)
 * - **Cache size**: Top 100 users per guild (ranked 1-100)
 * - **Invalidation**: Automatic on xpChange, levelUp, levelDown events
 * - **Cold start**: First query builds cache (O(n log n))
 * - **Warm cache**: Subsequent queries are O(1)
 *
 * @example
 * ### Get Top Users (Paginated)
 *
 * ```typescript
 * import { leaderboard } from '@robojs/xp'
 *
 * // Get top 10 users from default store
 * const top10 = await leaderboard.get('guildId', 0, 10)
 * top10.entries.forEach(entry => {
 *   console.log(`#${entry.rank}: ${entry.userId} - Level ${entry.level} (${entry.xp} XP)`)
 * })
 *
 * // Get top 10 users from custom reputation store
 * const repTop10 = await leaderboard.get('guildId', 0, 10, { storeId: 'reputation' })
 * repTop10.entries.forEach(entry => {
 *   console.log(`#${entry.rank}: ${entry.userId} - Rep Level ${entry.level}`)
 * })
 * ```
 *
 * @example
 * ### Build Leaderboard Command
 *
 * ```typescript
 * import { leaderboard } from '@robojs/xp'
 * import { CommandInteraction } from 'discord.js'
 *
 * async function handleLeaderboardCommand(interaction: CommandInteraction) {
 *   const page = interaction.options.getInteger('page') ?? 1
 *   const pageSize = 10
 *   const offset = (page - 1) * pageSize
 *
 *   // Get leaderboard entries for this page
 *   const entries = await leaderboard.get(interaction.guildId, offset, pageSize)
 *
 *   if (entries.length === 0) {
 *     await interaction.reply('No users on this page!')
 *     return
 *   }
 *
 *   // Build leaderboard embed
 *   const description = entries
 *     .map(entry => `#${entry.rank}: <@${entry.userId}> - Level ${entry.level} (${entry.xp} XP)`)
 *     .join('\n')
 *
 *   await interaction.reply({
 *     embeds: [{
 *       title: `Leaderboard - Page ${page}`,
 *       description
 *     }]
 *   })
 * }
 * ```
 *
 * @example
 * ### Get User's Rank Position (multi-store)
 *
 * ```typescript
 * import { leaderboard } from '@robojs/xp'
 *
 * // Get user's rank in default store
 * const defaultRank = await leaderboard.getRank('guildId', 'userId')
 * if (defaultRank) {
 *   console.log(`Default rank: #${defaultRank.rank} out of ${defaultRank.total}`)
 * }
 *
 * // Get user's rank in custom reputation store
 * const repRank = await leaderboard.getRank('guildId', 'userId', { storeId: 'reputation' })
 * if (repRank) {
 *   console.log(`Reputation rank: #${repRank.rank} out of ${repRank.total}`)
 * }
 * ```
 *
 * @example
 * ### Build Rank Command
 *
 * ```typescript
 * import { leaderboard } from '@robojs/xp'
 * import { CommandInteraction } from 'discord.js'
 *
 * async function handleRankCommand(interaction: CommandInteraction) {
 *   const userId = interaction.options.getUser('user')?.id ?? interaction.user.id
 *
 *   const rankInfo = await leaderboard.getRank(interaction.guildId, userId)
 *
 *   if (!rankInfo) {
 *     await interaction.reply('This user has no XP yet!')
 *     return
 *   }
 *
 *   await interaction.reply({
 *     embeds: [{
 *       title: `Rank for <@${userId}>`,
 *       fields: [
 *         { name: 'Rank', value: `#${rankInfo.rank}`, inline: true },
 *         { name: 'Level', value: `${rankInfo.level}`, inline: true },
 *         { name: 'XP', value: `${rankInfo.xp}`, inline: true }
 *       ],
 *       footer: { text: `Out of ${rankInfo.total} users` }
 *     }]
 *   })
 * }
 * ```
 *
 * @example
 * ### Manual Cache Invalidation (Advanced)
 *
 * ```typescript
 * import { leaderboard } from '@robojs/xp'
 *
 * // Usually automatic, but can be manually triggered
 * leaderboard.invalidateCache('guildId')
 *
 * // Next leaderboard.get() call will rebuild cache from Flashcore
 * const fresh = await leaderboard.get('guildId', 0, 10)
 * ```
 *
 * @remarks
 * - Cache is automatically invalidated on XP changes (via event listeners)
 * - First query after invalidation rebuilds cache (O(n log n))
 * - Subsequent queries use cached data (O(1) for top 100)
 * - Leaderboard entries are sorted: XP desc, userId asc (stable sort)
 * - Rank positions are 1-indexed (rank 1 = top user)
 * - `getRank()` returns `null` for users with no XP record
 * - Cache TTL is 60 seconds - auto-refreshes on expiry
 * - Manual invalidation is rarely needed (automatic via events)
 */
export const leaderboard = {
	/** Get paginated leaderboard entries (offset, limit) */
	get: getLeaderboardCore,

	/** Get user's rank position (1-indexed) */
	getRank: getUserRankCore,

	/**
	 * Manually invalidate cache for a guild (usually automatic)
	 *
	 * Supports two modes:
	 * - Specific store: Pass `{ storeId: 'name' }` to invalidate only that store
	 * - All stores: Pass `{ all: true }` to invalidate all stores for the guild
	 *
	 * @param guildId - Guild ID
	 * @param options - Optional Flashcore options or `{ all: true }` to invalidate all stores
	 */
	invalidateCache: invalidateCacheCore
}

// ============================================================================
// Role Rewards API
// ============================================================================

import { reconcileRoleRewards } from './runtime/rewards.js'

/**
 * Role rewards reconciliation API
 *
 * Provides manual control over role reward reconciliation. In most cases,
 * role rewards are automatically reconciled when users level up/down via
 * internal event listeners registered in `runtime/rewards.ts`.
 *
 * **When to Use This API:**
 * - Fixing role inconsistencies after manual database edits
 * - Forcing reconciliation after guild config changes
 * - Building custom role reward logic outside standard flow
 * - Debugging role reward issues
 *
 * **When NOT to Use:**
 * - Normal level-up/down operations (automatic via events)
 * - After calling `xp.add()`, `xp.remove()`, `xp.set()` (automatic)
 * - Regular XP gains from messages (automatic)
 *
 * @example
 * ### Manual Role Reconciliation After Config Change
 *
 * ```typescript
 * import { reconcileRewards, config, xp } from '@robojs/xp'
 *
 * // After changing role rewards config, reconcile all affected users
 * const guildConfig = await config.get('guildId')
 * const userLevel = await xp.getLevel('guildId', 'userId')
 *
 * // Manually reconcile roles for this user
 * await reconcileRewards('guildId', 'userId', userLevel, guildConfig)
 * ```
 *
 * @example
 * ### Fix Role Inconsistencies
 *
 * ```typescript
 * import { reconcileRewards, config, xp } from '@robojs/xp'
 *
 * // If roles are out of sync (e.g., after manual role changes)
 * async function fixUserRoles(guildId: string, userId: string) {
 *   const guildConfig = await config.get(guildId)
 *   const userLevel = await xp.getLevel(guildId, userId)
 *
 *   // Force reconciliation to correct state
 *   await reconcileRewards(guildId, userId, userLevel, guildConfig)
 *   console.log(`Reconciled roles for user ${userId} at level ${userLevel}`)
 * }
 * ```
 *
 * @example
 * ### Bulk Reconciliation After Major Config Change
 *
 * ```typescript
 * import { reconcileRewards, config, xp } from '@robojs/xp'
 * import { getAllUsers } from '@robojs/xp/store'
 *
 * // After major config change, reconcile all users
 * async function reconcileAllUsers(guildId: string) {
 *   const guildConfig = await config.get(guildId)
 *   const allUsers = await getAllUsers(guildId)
 *
 *   for (const user of allUsers) {
 *     await reconcileRewards(guildId, user.userId, user.level, guildConfig)
 *   }
 *
 *   console.log(`Reconciled ${allUsers.length} users`)
 * }
 * ```
 *
 * @remarks
 * - **Automatic reconciliation** happens via event listeners in `runtime/rewards.ts`
 * - Events trigger reconciliation: `levelUp`, `levelDown` (from `core/xp.ts`)
 * - Manual reconciliation is **idempotent** - safe to call multiple times
 * - This is an **advanced API** - most users won't need it
 * - Role rewards follow `rewardsMode` config: 'stack' or 'replace'
 * - Bot must have `MANAGE_ROLES` permission and higher role position
 * - Reconciliation respects `removeRewardsOnLoss` config setting
 */
export const rewards = {
	/**
	 * Manually reconcile role rewards for a user at a specific level.
	 *
	 * This function applies the appropriate role rewards based on the user's
	 * level and the guild's configuration. It handles both 'stack' and 'replace'
	 * modes, and respects role position hierarchy.
	 *
	 * @param guildId - Guild snowflake ID
	 * @param userId - User snowflake ID
	 * @param userLevel - User's current level
	 * @param guildConfig - Guild configuration with role rewards settings
	 *
	 * @example
	 * ```typescript
	 * import { rewards, config, xp } from '@robojs/xp'
	 *
	 * const guildConfig = await config.get('guildId')
	 * const userLevel = await xp.getLevel('guildId', 'userId')
	 * await rewards.reconcile('guildId', 'userId', userLevel, guildConfig)
	 * ```
	 */
	reconcile: reconcileRoleRewards,

	/**
	 * Alias for reconcile() - manually reconcile role rewards for a user.
	 *
	 * @param guildId - Guild snowflake ID
	 * @param userId - User snowflake ID
	 * @param userLevel - User's current level
	 * @param guildConfig - Guild configuration with role rewards settings
	 *
	 * @example
	 * ```typescript
	 * import { rewards, config, xp } from '@robojs/xp'
	 *
	 * const guildConfig = await config.get('guildId')
	 * const userLevel = await xp.getLevel('guildId', 'userId')
	 * await rewards.reconcileRewards('guildId', 'userId', userLevel, guildConfig)
	 * ```
	 */
	reconcileRewards: reconcileRoleRewards
}

/**
 * Convenience export: manually reconcile role rewards for a user at a specific level.
 *
 * This is a top-level export of `rewards.reconcile()` for ergonomics and direct import.
 * It applies the appropriate role rewards based on the user's level and the guild's
 * configuration. It handles both 'stack' and 'replace' modes, and respects role position hierarchy.
 *
 * @param guildId - Guild snowflake ID
 * @param userId - User snowflake ID
 * @param userLevel - User's current level
 * @param guildConfig - Guild configuration with role rewards settings
 *
 * @example
 * ```typescript
 * import { reconcileRewards, config, xp } from '@robojs/xp'
 *
 * const guildConfig = await config.get('guildId')
 * const userLevel = await xp.getLevel('guildId', 'userId')
 * await reconcileRewards('guildId', 'userId', userLevel, guildConfig)
 * ```
 */
export { reconcileRoleRewards as reconcileRewards }

// ============================================================================
// Formatting Utilities (Public Helpers)
// ============================================================================

/**
 * Public formatting helpers.
 *
 * These utilities are safe to import from the package root and are used in
 * README/API examples. They allow consumers to format XP values with a custom
 * label and extract the label from a guild config.
 *
 * @example
 * ```ts
 * import { config, formatXP, getXpLabel } from '@robojs/xp'
 * const cfg = await config.get(guildId)
 * const label = getXpLabel(cfg)
 * console.log(formatXP(1500, label)) // "1,500 Reputation"
 * ```
 */
export { formatXP, getXpLabel } from './core/utils.js'
