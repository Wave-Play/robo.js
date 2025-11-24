/**
 * TypeScript type definitions for @robojs/xp
 *
 * This module defines all core types for the XP system including user data,
 * configuration, events, and math results. Follows standard XP system conventions.
 *
 * ## Multi-Store Architecture
 *
 * The XP plugin supports multiple isolated data stores, each with independent:
 * - User XP data and levels
 * - Guild configuration
 * - Leaderboard rankings
 * - Event streams
 *
 * The default store ('default') is used by all built-in commands.
 * Custom stores are accessed imperatively via the API.
 *
 * Flashcore namespace structure with stores:
 * - Default store: ['xp', 'default', guildId, 'users']
 * - Custom store: ['xp', 'reputation', guildId, 'users']
 * - Config: ['xp', storeId, guildId] → { config, members, schema }
 *
 * Events include storeId field to identify which store triggered the event.
 * Event listeners can filter by storeId for store-specific processing.
 *
 * @example
 * // Default store (used by commands)
 * await XP.addXP(guildId, userId, 100)
 *
 * @example
 * // Custom reputation store
 * await XP.addXP(guildId, userId, 50, { storeId: 'reputation' })
 *
 * @example
 * // Custom currency store
 * await XP.getUserData(guildId, userId, { storeId: 'credits' })
 *
 * @example
 * // Event listener filtering by store
 * events.on('levelUp', (event) => {
 *   if (event.storeId === 'reputation') {
 *     // Handle reputation level-up
 *   }
 * })
 */

/**
 * User XP data stored per guild member
 *
 * @property xp - Total XP accumulated (determines level)
 * @property level - Current level (derived from XP using default curve)
 * @property lastAwardedAt - Unix timestamp (ms) of last XP award for cooldown tracking
 * @property messages - Total messages sent in guild text channels (increments after basic validation, before No-XP/cooldown checks)
 * @property xpMessages - Messages that awarded XP (increments only when XP is actually granted, after all checks pass)
 *
 * @example
 * {
 *   xp: 1500,
 *   level: 5,
 *   lastAwardedAt: 1704067200000,
 *   messages: 423,
 *   xpMessages: 156
 * }
 */
export interface UserXP {
	xp: number
	level: number
	lastAwardedAt: number
	messages: number
	xpMessages: number
}

/**
 * Role reward mode - determines how multiple role rewards are applied
 *
 * - 'stack': User keeps all role rewards from previous levels (default)
 * - 'replace': User only gets role for their current level, previous roles removed
 */
export type RewardsMode = 'stack' | 'replace'

/**
 * Role reward configuration
 *
 * @property level - Level at which this role is awarded (must be positive integer)
 * @property roleId - Discord role ID (18-19 digit snowflake)
 *
 * @example
 * { level: 10, roleId: '1234567890123456789' }
 */
export interface RoleReward {
	level: number
	roleId: string
}

/**
 * Per-guild XP system configuration
 *
 * All fields have sensible defaults matching standard behavior.
 *
 * @property cooldownSeconds - Minimum seconds between XP awards for same user (default: 60)
 * @property xpRate - Global XP multiplier for this guild (default: 1.0)
 * @property noXpRoleIds - Users with these roles don't gain XP (default: [])
 * @property noXpChannelIds - Messages in these channels don't award XP (default: [])
 * @property roleRewards - Roles awarded at specific levels (default: [])
 * @property rewardsMode - How role rewards stack (default: 'stack')
 * @property removeRewardOnXpLoss - Remove roles when user loses levels (default: false)
 * @property leaderboard - Leaderboard visibility settings
 * @property leaderboard.public - Whether leaderboard is publicly visible (default: false)
 * @property multipliers - Optional per-role, per-user, and server-wide multipliers
 * @property multipliers.server - Server-wide multiplier (stacks with xpRate)
 * @property multipliers.role - Per-role multipliers (roleId -> multiplier)
 * @property multipliers.user - Per-user multipliers (userId -> multiplier)
 * @property theme - Optional theme customization for rank and leaderboard embeds
 * @property theme.embedColor - Custom embed color in hex (e.g., 0x5865F2 for Discord Blurple)
 * @property theme.backgroundUrl - Reserved for future web-based rank card renderer
 * @property labels - Optional custom terminology for XP system branding
 * @property labels.xpDisplayName - Custom display name for XP (default: 'XP', max 20 chars)
 *
 * @example
 * {
 *   cooldownSeconds: 120,
 *   xpRate: 1.5,
 *   noXpRoleIds: ['123456789012345678'],
 *   noXpChannelIds: ['234567890123456789'],
 *   roleRewards: [
 *     { level: 5, roleId: '345678901234567890' },
 *     { level: 10, roleId: '456789012345678901' }
 *   ],
 *   rewardsMode: 'stack',
 *   removeRewardOnXpLoss: true,
 *   leaderboard: { public: true },
 *   multipliers: {
 *     server: 2.0,
 *     role: { '567890123456789012': 1.5 },
 *     user: { '678901234567890123': 0.5 }
 *   },
 *   theme: {
 *     embedColor: 0x5865F2,
 *     backgroundUrl: 'https://example.com/background.png'
 *   },
 *   labels: {
 *     xpDisplayName: 'Reputation'
 *   }
 * }
 *
 * @example Common terminology alternatives:
 * - 'Reputation' - For community reputation systems
 * - 'Points' - For point-based reward systems
 * - 'Karma' - For Reddit-style karma systems
 * - 'Credits' - For economy/currency systems
 * - 'Stars' - For achievement/rating systems
 */
export interface GuildConfig {
	/**
	 * Minimum seconds between XP awards for the same user
	 * @default 60
	 */
	cooldownSeconds: number

	/**
	 * Global XP multiplier applied to all XP gains
	 * @default 1.0
	 */
	xpRate: number

	/**
	 * Users with these roles don't gain XP
	 * @default []
	 */
	noXpRoleIds: string[]

	/**
	 * Messages in these channels don't award XP
	 * @default []
	 */
	noXpChannelIds: string[]

	/**
	 * Roles awarded at specific levels
	 * @default []
	 */
	roleRewards: RoleReward[]

	/**
	 * How role rewards stack when users level up
	 * - 'stack': Users keep all role rewards from previous levels
	 * - 'replace': Users only get the role for their current level
	 * @default 'stack'
	 */
	rewardsMode: RewardsMode

	/**
	 * Remove role rewards when users lose levels from XP loss
	 * @default false
	 */
	removeRewardOnXpLoss: boolean

	/**
	 * Leaderboard visibility settings
	 */
	leaderboard: {
		/**
		 * Whether the leaderboard is publicly visible
		 * @default false
		 */
		public: boolean
	}

	/**
	 * Server-wide and per-role/user XP multipliers
	 */
	multipliers?: {
		/**
		 * Server-wide multiplier applied to all users (stacks with xpRate)
		 */
		server?: number

		/**
		 * Per-role multipliers (roleId → multiplier)
		 */
		role?: Record<string, number>

		/**
		 * Per-user multipliers (userId → multiplier)
		 */
		user?: Record<string, number>
	}

	/**
	 * Custom theme for rank cards and leaderboard embeds
	 */
	theme?: {
		/**
		 * Custom embed color in hex (e.g., 0x5865F2 for Discord Blurple)
		 */
		embedColor?: number

		/**
		 * Reserved for future web-based rank card renderer
		 */
		backgroundUrl?: string
	}

	/**
	 * Custom terminology for XP system branding
	 */
	labels?: {
		/**
		 * Custom display name for XP (e.g., 'Reputation', 'Karma', 'Points')
		 * @default 'XP'
		 */
		xpDisplayName?: string
	}

	/**
	 * Level curve configuration defining how XP maps to levels
	 *
	 * Controls the progression curve for this guild/store. Supports four preset types:
	 * - 'quadratic': Smooth, accelerating growth (default)
	 * - 'linear': Constant XP per level
	 * - 'exponential': Rapid, accelerating growth (requires level cap)
	 * - 'lookup': Hand-tuned thresholds from array
	 *
	 * Each store can have a different curve (e.g., default store uses quadratic,
	 * reputation store uses linear). Configuration is stored in Flashcore and can
	 * be set via XP.config.set() or /xp config commands.
	 *
	 * @default Quadratic curve with default values (a=5, b=50, c=100)
	 *
	 * @example Linear curve with 100 XP per level
	 * {
	 *   levels: {
	 *     type: 'linear',
	 *     params: { xpPerLevel: 100 }
	 *   }
	 * }
	 *
	 * @example Lookup table with custom thresholds
	 * {
	 *   levels: {
	 *     type: 'lookup',
	 *     params: {
	 *       thresholds: [0, 100, 250, 500, 1000, 2000, 5000]
	 *     }
	 *   }
	 * }
	 *
	 * @example Exponential curve with level cap
	 * {
	 *   levels: {
	 *     type: 'exponential',
	 *     params: { base: 1.5, multiplier: 100 },
	 *     maxLevel: 50
	 *   }
	 * }
	 *
	 * @remarks
	 * Per-store configuration enables multi-dimensional progression systems:
	 * - Default store: Standard quadratic leveling
	 * - Reputation store: Linear progression (100 XP per level)
	 * - Combat store: Exponential prestige levels
	 *
	 * Configuration precedence (highest to lowest):
	 * 1. PluginOptions.levels.getCurve callback (code-based)
	 * 2. GuildConfig.levels preset (stored in Flashcore)
	 * 3. Default quadratic curve (a=5, b=50, c=100)
	 */
	levels?: LevelCurveConfig
}

/**
 * Global configuration defaults applied to all guilds
 *
 * Partial GuildConfig - only specified fields override guild defaults.
 * Used for setting system-wide defaults via setGlobalConfig.
 *
 * @example
 * {
 *   cooldownSeconds: 90,
 *   xpRate: 1.2
 * }
 */
export type GlobalConfig = Partial<GuildConfig>

/**
 * Event emitted when a user levels up
 *
 * @readonly All fields are read-only event data
 * @property guildId - Guild where level up occurred
 * @property userId - User who leveled up
 * @property storeId - Store identifier that triggered this event
 * @property oldLevel - Previous level
 * @property newLevel - New level (always > oldLevel)
 * @property totalXp - Total XP after level up
 *
 * @remarks
 * The storeId field identifies which data store triggered this event. Role rewards
 * only process events from the default store to avoid conflicts (e.g., reputation
 * store shouldn't grant Discord roles).
 *
 * @example
 * {
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
 *   storeId: 'default',
 *   oldLevel: 4,
 *   newLevel: 5,
 *   totalXp: 1550
 * }
 */
export interface LevelUpEvent {
	readonly guildId: string
	readonly userId: string
	readonly storeId: string
	readonly oldLevel: number
	readonly newLevel: number
	readonly totalXp: number
}

/**
 * Event emitted when a user levels down (XP loss)
 *
 * @readonly All fields are read-only event data
 * @property guildId - Guild where level down occurred
 * @property userId - User who leveled down
 * @property storeId - Store identifier that triggered this event
 * @property oldLevel - Previous level
 * @property newLevel - New level (always < oldLevel)
 * @property totalXp - Total XP after level down
 *
 * @remarks
 * The storeId field identifies which data store triggered this event. Role removal
 * (when removeRewardOnXpLoss is enabled) only processes events from the default store
 * to avoid conflicts.
 *
 * @example
 * {
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
 *   storeId: 'default',
 *   oldLevel: 5,
 *   newLevel: 4,
 *   totalXp: 1200
 * }
 */
export interface LevelDownEvent {
	readonly guildId: string
	readonly userId: string
	readonly storeId: string
	readonly oldLevel: number
	readonly newLevel: number
	readonly totalXp: number
}

/**
 * Event emitted when a user's XP changes (without level change)
 *
 * @readonly All fields are read-only event data
 * @property guildId - Guild where XP change occurred
 * @property userId - User whose XP changed
 * @property storeId - Store identifier that triggered this event
 * @property oldXp - Previous XP amount
 * @property newXp - New XP amount
 * @property delta - Change in XP (newXp - oldXp, can be negative)
 * @property reason - Optional reason for XP change (e.g., 'manual_adjustment', 'message')
 *
 * @remarks
 * The storeId field identifies which data store triggered this event. Leaderboard
 * cache invalidation uses this field to invalidate only the affected store.
 *
 * @example
 * {
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
 *   storeId: 'default',
 *   oldXp: 1500,
 *   newXp: 1550,
 *   delta: 50,
 *   reason: 'message'
 * }
 */
export interface XPChangeEvent {
	readonly guildId: string
	readonly userId: string
	readonly storeId: string
	readonly oldXp: number
	readonly newXp: number
	readonly delta: number
	readonly reason?: string
}

/**
 * Level progress information from computeLevelFromTotalXp
 *
 * @property level - Current level (0-based)
 * @property inLevel - XP accumulated within current level (0 to xpNeededForLevel(level+1))
 * @property toNext - XP still needed to reach next level
 *
 * @example
 * For 200 total XP (level 1 starts at 155, level 2 starts at 375):
 * {
 *   level: 1,
 *   inLevel: 45,  // 200 - 155
 *   toNext: 175   // 220 - 45
 * }
 */
export interface LevelProgress {
	level: number
	inLevel: number
	toNext: number
}

/**
 * Quadratic level curve configuration
 *
 * Uses the formula: XP = a*level² + b*level + c
 *
 * This is the default curve type, providing standard progression.
 * Provides smooth, accelerating growth that rewards consistent engagement.
 *
 * @property type - Discriminator field for type safety
 * @property params - Quadratic coefficients (optional, defaults to standard values)
 * @property params.a - Coefficient for level² term (default: 5)
 * @property params.b - Coefficient for level term (default: 50)
 * @property params.c - Constant term (default: 100)
 * @property maxLevel - Optional level cap (users cannot exceed this level)
 *
 * @remarks
 * Default values (a=5, b=50, c=100) produce the standard curve:
 * - Level 1: 155 XP
 * - Level 5: 600 XP
 * - Level 10: 1655 XP
 * - Level 20: 4155 XP
 *
 * For typical use cases, all coefficients should be positive. Negative values
 * may produce unexpected behavior (e.g., decreasing XP requirements).
 *
 * @example Default curve (params can be omitted)
 * const curve: QuadraticCurve = {
 *   type: 'quadratic'
 * }
 *
 * @example Custom steeper curve
 * const curve: QuadraticCurve = {
 *   type: 'quadratic',
 *   params: { a: 10, b: 100, c: 200 },
 *   maxLevel: 50
 * }
 */
export interface QuadraticCurve {
	type: 'quadratic'
	params?: {
		a?: number
		b?: number
		c?: number
	}
	maxLevel?: number
}

/**
 * Linear level curve configuration
 *
 * Uses the formula: XP = level * xpPerLevel
 *
 * Provides constant, predictable progression where each level requires
 * the same amount of XP. Ideal for simple systems or time-based progression.
 *
 * @property type - Discriminator field for type safety
 * @property params - Linear parameters (required)
 * @property params.xpPerLevel - XP required per level (must be positive)
 * @property maxLevel - Optional level cap (users cannot exceed this level)
 *
 * @remarks
 * The xpPerLevel value must be positive. There is no sensible default,
 * so this parameter is required.
 *
 * Example progression with xpPerLevel=100:
 * - Level 1: 100 XP
 * - Level 5: 500 XP
 * - Level 10: 1000 XP
 * - Level 20: 2000 XP
 *
 * @example Simple 100 XP per level
 * const curve: LinearCurve = {
 *   type: 'linear',
 *   params: { xpPerLevel: 100 }
 * }
 *
 * @example With level cap
 * const curve: LinearCurve = {
 *   type: 'linear',
 *   params: { xpPerLevel: 250 },
 *   maxLevel: 100
 * }
 */
export interface LinearCurve {
	type: 'linear'
	params: {
		xpPerLevel: number
	}
	maxLevel?: number
}

/**
 * Exponential level curve configuration
 *
 * Uses the formula: XP = multiplier * base^level
 *
 * Provides rapid, accelerating growth ideal for prestige systems or
 * long-term engagement. Requires careful tuning to avoid overflow.
 *
 * @property type - Discriminator field for type safety
 * @property params - Exponential parameters (required)
 * @property params.base - Base for exponentiation (must be greater than 1 for monotonic growth)
 * @property params.multiplier - Scaling multiplier (must be positive)
 * @property maxLevel - Optional level cap (strongly recommended for exponential curves)
 *
 * @remarks
 * The base must be greater than 1 to ensure strictly increasing XP thresholds
 * and a valid inverse function. The multiplier must be positive. There are no
 * sensible defaults, so these parameters are required.
 *
 * IMPORTANT: Exponential curves grow very rapidly. Always set a maxLevel to
 * prevent integer overflow and performance issues. Test thoroughly with
 * realistic player engagement patterns.
 *
 * Example progression with base=2, multiplier=100:
 * - Level 1: 200 XP (100 * 2^1)
 * - Level 5: 3,200 XP (100 * 2^5)
 * - Level 10: 102,400 XP (100 * 2^10)
 * - Level 20: 104,857,600 XP (100 * 2^20)
 *
 * @example Doubling progression
 * const curve: ExponentialCurve = {
 *   type: 'exponential',
 *   params: { base: 2, multiplier: 100 },
 *   maxLevel: 30
 * }
 *
 * @example Slower exponential growth
 * const curve: ExponentialCurve = {
 *   type: 'exponential',
 *   params: { base: 1.5, multiplier: 50 },
 *   maxLevel: 50
 * }
 */
export interface ExponentialCurve {
	type: 'exponential'
	params: {
		base: number
		multiplier: number
	}
	maxLevel?: number
}

/**
 * Lookup table level curve configuration
 *
 * Uses explicit XP thresholds for each level from a predefined array.
 *
 * Provides complete control over progression with arbitrary, hand-tuned
 * values. Ideal for unique progression patterns or custom curves.
 *
 * @property type - Discriminator field for type safety
 * @property params - Lookup table parameters (required)
 * @property params.thresholds - Array of total XP required per level (must be non-empty, sorted ascending)
 * @property maxLevel - Optional level cap (defaults to thresholds.length - 1)
 *
 * @remarks
 * The thresholds array maps level numbers to total XP required:
 * - thresholds[0] = XP for level 0 (typically 0)
 * - thresholds[1] = XP for level 1
 * - thresholds[N] = XP for level N
 *
 * Array must be:
 * - Non-empty
 * - Sorted in ascending order
 * - All values non-negative
 *
 * If maxLevel is omitted, it defaults to thresholds.length - 1 (the highest
 * level defined in the table). Users cannot exceed the highest defined level.
 *
 * @example Custom 6-level progression
 * const curve: LookupCurve = {
 *   type: 'lookup',
 *   params: {
 *     thresholds: [0, 100, 250, 500, 1000, 2000]
 *   }
 * }
 * // Level 0: 0 XP, Level 1: 100 XP, Level 2: 250 XP, etc.
 *
 * @example Custom lookup curve
 * const curve: LookupCurve = {
 *   type: 'lookup',
 *   params: {
 *     thresholds: [0, 155, 220, 295, 380, 475, 580, 695, 820, 955, 1100]
 *   }
 * }
 */
export interface LookupCurve {
	type: 'lookup'
	params: {
		thresholds: number[]
	}
	maxLevel?: number
}

/**
 * Level curve configuration union type
 *
 * Discriminated union of all supported curve types. TypeScript automatically
 * narrows the `params` type based on the `type` discriminator field.
 *
 * Used for storing curve presets in guild configuration (Flashcore).
 * The runtime system converts these serializable configs into LevelCurve
 * instances with executable functions.
 *
 * @remarks
 * This is a discriminated union, which means TypeScript provides excellent
 * type safety and IntelliSense. When you set `type`, TypeScript knows exactly
 * what shape `params` must have.
 *
 * @example Type narrowing with discriminated unions
 * const curve: LevelCurveConfig = { type: 'linear', params: { xpPerLevel: 100 } }
 *
 * if (curve.type === 'linear') {
 *   // TypeScript knows curve.params has xpPerLevel
 *   console.log(curve.params.xpPerLevel)
 * }
 *
 * @example Each curve type enforces its own params
 * const quadratic: LevelCurveConfig = {
 *   type: 'quadratic',
 *   params: { a: 10, b: 100, c: 200 }
 * }
 *
 * const linear: LevelCurveConfig = {
 *   type: 'linear',
 *   params: { xpPerLevel: 100 } // Different params!
 * }
 */
export type LevelCurveConfig = QuadraticCurve | LinearCurve | ExponentialCurve | LookupCurve

/**
 * Reusable type alias for curve type discriminator strings
 *
 * Extracts the literal type union from LevelCurveConfig['type'].
 * Useful for avoiding magic strings in curve validation, switching, and config builders.
 *
 * @example Type-safe curve type checks
 * const curveType: CurveType = 'quadratic' // ✅ Valid
 * const invalid: CurveType = 'custom' // ❌ Type error
 *
 * @example Switch statements with exhaustiveness checking
 * function validateCurve(type: CurveType) {
 *   switch (type) {
 *     case 'quadratic':
 *     case 'linear':
 *     case 'exponential':
 *     case 'lookup':
 *       return true
 *     default:
 *       // TypeScript ensures all cases are handled
 *       const _exhaustive: never = type
 *       return false
 *   }
 * }
 */
export type CurveType = LevelCurveConfig['type']


/**
 * Runtime level curve interface with executable functions
 *
 * Represents a level curve at runtime with functions for XP calculations.
 * Built from LevelCurveConfig presets by curve builder functions (implemented
 * in subsequent phases).
 *
 * Unlike LevelCurveConfig (serializable configuration), this interface contains
 * functions and cannot be stored in Flashcore. Used internally by XP calculation
 * functions and the core math system.
 *
 * @property xpForLevel - Calculate total XP required to reach a level
 * @property levelFromXp - Calculate level from total XP (inverse function)
 * @property maxLevel - Optional level cap (inherited from config)
 *
 * @remarks
 * Functions should handle edge cases gracefully:
 * - xpForLevel(level > maxLevel) should return Infinity
 * - levelFromXp should never return levels > maxLevel
 * - Both functions should handle negative inputs reasonably (typically return 0)
 *
 * This interface is used by:
 * - Core XP calculation functions (computeLevelFromTotalXp, etc.)
 * - Level progression validators
 * - XP preview/calculation utilities
 *
 * @example Function signatures
 * const curve: LevelCurve = {
 *   xpForLevel: (level: number) => {
 *     if (level > curve.maxLevel) return Infinity
 *     return 5 * level * level + 50 * level + 100
 *   },
 *   levelFromXp: (totalXp: number) => {
 *     // Inverse quadratic formula implementation
 *     const level = Math.floor((-50 + Math.sqrt(2500 + 20 * (totalXp - 100))) / 10)
 *     return Math.min(level, curve.maxLevel ?? Infinity)
 *   },
 *   maxLevel: 50
 * }
 *
 * @example Usage in XP calculations
 * const xpNeeded = curve.xpForLevel(10) // Total XP for level 10
 * const currentLevel = curve.levelFromXp(1500) // Level from 1500 total XP
 */
export interface LevelCurve {
	/**
	 * Calculate total XP required to reach a specific level
	 * @param level - Target level (0-based)
	 * @returns Total XP required (Infinity if level > maxLevel)
	 */
	xpForLevel: (level: number) => number

	/**
	 * Calculate level from total XP (inverse of xpForLevel)
	 * @param totalXp - Total XP accumulated
	 * @returns Current level (capped at maxLevel if defined)
	 */
	levelFromXp: (totalXp: number) => number

	/**
	 * Optional level cap (users cannot exceed this level)
	 */
	maxLevel?: number
}

/**
 * Options for specifying which data store to use
 *
 * The XP plugin supports multiple isolated data stores, each with independent:
 * - User XP data and levels
 * - Guild configuration
 * - Leaderboard rankings
 * - Event streams
 *
 * The default store ('default') is used by all built-in commands (/rank, /leaderboard, etc.)
 * Custom stores are accessed imperatively for building parallel systems.
 *
 * @property storeId - Store identifier (defaults to 'default')
 *
 * @example
 * // Default store (used by commands)
 * await XP.addXP(guildId, userId, 100) // Uses 'default'
 *
 * @example
 * // Custom reputation store
 * await XP.addXP(guildId, userId, 50, { storeId: 'reputation' })
 *
 * @example
 * // Custom currency store
 * await XP.addXP(guildId, userId, 200, { reason: 'quest', storeId: 'credits' })
 *
 * @example Use cases:
 * - Leveling + multiple currencies (e.g., 'default', 'gold', 'gems')
 * - Multi-dimensional reputation (e.g., 'combat', 'crafting', 'trading')
 * - Seasonal systems (e.g., 'season1', 'season2', 'season3')
 */
export interface StoreOptions {
	/**
	 * Store identifier for isolating XP data
	 * @default 'default'
	 */
	storeId?: string
}

/**
 * Options for Flashcore storage layer operations
 *
 * Used by low-level storage functions to specify which store to operate on.
 *
 * @example
 * // Default store
 * await store.getUser(guildId, userId) // Uses 'default'
 *
 * @example
 * // Custom store
 * await store.getUser(guildId, userId, { storeId: 'reputation' })
 */
export interface FlashcoreOptions extends StoreOptions {}

/**
 * Options for retrieving XP data
 *
 * @example
 * // Default store
 * await XP.getXP(guildId, userId) // Uses 'default'
 *
 * @example
 * // Custom store
 * await XP.getXP(guildId, userId, { storeId: 'reputation' })
 */
export interface GetXPOptions extends StoreOptions {}

/**
 * Options for recalculating user levels
 *
 * @example
 * // Default store
 * await XP.recalcLevel(guildId, userId) // Uses 'default'
 *
 * @example
 * // Custom store
 * await XP.recalcLevel(guildId, userId, { storeId: 'reputation' })
 */
export interface RecalcOptions extends StoreOptions {}

/**
 * Options for adding XP to a user
 *
 * @property reason - Optional audit trail reason for XP change
 * @property storeId - Store identifier (defaults to 'default')
 *
 * @example
 * { reason: 'admin_bonus' }
 *
 * @example
 * // Custom store with reason
 * { reason: 'quest', storeId: 'reputation' }
 */
export interface AddXPOptions extends StoreOptions {
	reason?: string
}

/**
 * Leaderboard entry with user rank information
 *
 * Used by the leaderboard service for sorted, cached results.
 *
 * @property userId - Discord user ID
 * @property xp - Total XP for this user
 * @property level - Current level (derived from XP)
 * @property rank - 1-indexed position on the leaderboard
 *
 * @example
 * {
 *   userId: '123456789012345678',
 *   xp: 3450,
 *   level: 15,
 *   rank: 1
 * }
 */
export interface LeaderboardEntry {
	userId: string
	xp: number
	level: number
	rank: number
}

/**
 * Plugin configuration options for @robojs/xp
 *
 * Configure global defaults that apply to all guilds.
 * Individual guilds can override these via /xp config commands or the XP.config.set() API.
 *
 * @property defaults - Global XP configuration defaults (optional)
 *
 * @example
 * // config/plugins/robojs/xp.ts
 * import type { PluginOptions } from '@robojs/xp'
 *
 * export default {
 *   defaults: {
 *     cooldownSeconds: 90,
 *     xpRate: 1.5,
 *     labels: { xpDisplayName: 'Reputation' },
 *     multipliers: { server: 2.0 },
 *     roleRewards: [
 *       { level: 5, roleId: 'ROLE_ID_HERE' },
 *       { level: 10, roleId: 'ROLE_ID_HERE' }
 *     ]
 *   }
 * } satisfies PluginOptions
 */
export interface PluginOptions {
	/**
	 * Global defaults applied to all guilds
	 * Can be overridden per-guild via XP.config.set() or /xp config commands
	 */
	defaults?: Partial<GuildConfig>

	/**
	 * Advanced level curve customization
	 *
	 * Provides code-based, per-guild/per-store curve logic via the getCurve callback.
	 * This is the highest precedence configuration option, overriding both guild
	 * config presets and default quadratic curve.
	 *
	 * @property getCurve - Optional curve factory callback
	 *
	 * @remarks
	 * The getCurve callback is invoked during XP calculations to dynamically determine
	 * the level curve for a specific guild and store. This enables advanced scenarios
	 * that cannot be achieved with static configuration alone.
	 *
	 * Configuration precedence (highest to lowest):
	 * 1. getCurve callback return value (if non-null)
	 * 2. GuildConfig.levels preset (stored in Flashcore)
	 * 3. Default quadratic curve (a=5, b=50, c=100)
	 *
	 * Return null from getCurve to fall through to guild config or defaults.
	 *
	 * Unlike GuildConfig.levels (which is stored in Flashcore and serializable),
	 * the getCurve callback is code-based and not persisted. This allows dynamic
	 * logic based on runtime conditions, external data, or complex business rules.
	 *
	 * @example Different curves per store (synchronous)
	 * // config/plugins/robojs/xp.ts
	 * export default {
	 *   levels: {
	 *     getCurve: (guildId, storeId) => {
	 *       if (storeId === 'reputation') {
	 *         return {
	 *           xpForLevel: (level) => level * 100,
	 *           levelFromXp: (xp) => Math.floor(xp / 100)
	 *         }
	 *       }
	 *       return null // Use guild config or default
	 *     }
	 *   }
	 * } satisfies PluginOptions
	 *
	 * @example Special guild gets custom curve (synchronous)
	 * export default {
	 *   levels: {
	 *     getCurve: (guildId, storeId) => {
	 *       if (guildId === '123456789012345678') {
	 *         return {
	 *           xpForLevel: (level) => 50 * level * level + 200 * level + 500,
	 *           levelFromXp: (xp) => {
	 *             // Solve quadratic formula for custom coefficients
	 *             return Math.floor((-200 + Math.sqrt(40000 + 200 * (xp - 500))) / 100)
	 *           },
	 *           maxLevel: 100
	 *         }
	 *       }
	 *       return null
	 *     }
	 *   }
	 * } satisfies PluginOptions
	 *
	 * @example Dynamic curve based on guild size (asynchronous)
	 * export default {
	 *   levels: {
	 *     getCurve: async (guildId, storeId) => {
	 *       const guild = await client.guilds.fetch(guildId)
	 *       const memberCount = guild.memberCount
	 *
	 *       // Larger guilds get steeper curves
	 *       if (memberCount > 1000) {
	 *         return {
	 *           xpForLevel: (level) => 10 * level * level + 100 * level + 200,
	 *           levelFromXp: (xp) => {
	 *             return Math.floor((-100 + Math.sqrt(10000 + 40 * (xp - 200))) / 20)
	 *           }
	 *         }
	 *       }
	 *       return null
	 *     }
	 *   }
 		 * } satisfies PluginOptions
 		 *
 		 * @example Per-guild customization with multiple special guilds
 		 * export default {
 		 *   levels: {
 		 *     getCurve: (guildId, storeId) => {
 		 *       // Partner guilds get gentler curves
 		 *       const partnerGuilds = ['111111111111111111', '222222222222222222']
 		 *       if (partnerGuilds.includes(guildId)) {
 		 *         return {
 		 *           xpForLevel: (level) => level * 50, // Linear, 50 XP per level
 		 *           levelFromXp: (xp) => Math.floor(xp / 50),
 		 *         }
 		 *       }
 		 *
 		 *       // Premium guilds get steeper curves with level cap
 		 *       const premiumGuilds = ['333333333333333333', '444444444444444444']
 		 *       if (premiumGuilds.includes(guildId)) {
 		 *         return {
 		 *           xpForLevel: (level) => 10 * level * level + 100 * level + 200,
 		 *           levelFromXp: (xp) => Math.floor((-100 + Math.sqrt(10000 + 40 * (xp - 200))) / 20),
 		 *           maxLevel: 100,
 		 *         }
 		 *       }
 		 *
 		 *       return null // All other guilds use default
 		 *     },
 		 *   },
 		 * } satisfies PluginOptions
 		 *
 		 * @example Per-store customization for multi-currency economy
 		 * export default {
 		 *   levels: {
 		 *     getCurve: (guildId, storeId) => {
 		 *       // Default store: standard curve via fallback
 		 *       if (storeId === 'default') {
 		 *         return null // Use default quadratic curve
 		 *       }
 		 *
 		 *       // Reputation store: Slow linear progression
 		 *       if (storeId === 'reputation') {
 		 *         return {
 		 *           xpForLevel: (level) => level * 500,
 		 *           levelFromXp: (xp) => Math.floor(xp / 500),
 		 *         }
 		 *       }
 		 *
 		 *       // Coins store: Faster linear progression
 		 *       if (storeId === 'coins') {
 		 *         return {
 		 *           xpForLevel: (level) => level * 100,
 		 *           levelFromXp: (xp) => Math.floor(xp / 100),
 		 *         }
 		 *       }
 		 *
 		 *       // Gems store: Exponential with a cap (premium currency)
 		 *       if (storeId === 'gems') {
 		 *         return {
 		 *           xpForLevel: (level) => 100 * Math.pow(2, level),
 		 *           levelFromXp: (xp) => Math.floor(Math.log2(xp / 100)),
 		 *           maxLevel: 20,
 		 *         }
 		 *       }
 		 *
 		 *       return null // Unknown stores use defaults
 		 *     },
 		 *   },
 		 * } satisfies PluginOptions
 		 *
 		 * @example Use cases for getCurve callback:
 		 * - Different curves per store (e.g., reputation vs default vs coins vs gems)
 		 * - Special guilds get unique progression (e.g., partner guilds, premium guilds)
 		 * - Dynamic curves based on guild size or activity
 		 * - Seasonal or time-based progression changes
 		 * - A/B testing different curve configurations
 		 * - Complex business logic that can't be expressed in static config
 		 * - Multi-currency economy systems with different progression rates
 		 * - Tiered guild systems (free, partner, premium) with different curves
 		 *
 		 * @see README.md "Custom Level Curves" section for user-facing examples
 		 * @see AGENTS.md Section 15 for architecture and integration details
	 */
	levels?: {
		/**
		 * Curve factory callback for advanced per-guild/per-store customization
		 *
		 * May be synchronous or asynchronous. Return null to fall through to
		 * guild config preset or default curve.
		 *
		 * @param guildId - Guild ID for which to build curve
		 * @param storeId - Store ID for which to build curve
		 * @returns LevelCurve instance, null to use guild config/defaults, or a Promise resolving to either
		 *
		 * @remarks
		 * This callback has highest precedence in the configuration hierarchy.
		 * Async callbacks are supported for dynamic logic based on external data
		 * (e.g., fetching guild info, database lookups, API calls).
		 */
		getCurve?: (guildId: string, storeId: string) => LevelCurve | null | Promise<LevelCurve | null>
	}
}

/**
 * Resolves the store ID from options, defaulting to 'default' if not provided
 *
 * @param options - Store options (optional)
 * @returns Store ID string
 *
 * @example
 * const storeId = resolveStoreId() // 'default'
 *
 * @example
 * const storeId = resolveStoreId({ storeId: 'reputation' }) // 'reputation'
 */
export function resolveStoreId(options?: StoreOptions): string {
	return options?.storeId ?? 'default'
}
