/**
 * TypeScript type definitions for @robojs/xp
 *
 * This module defines all core types for the XP system including user data,
 * configuration, events, and math results. Follows MEE6 parity standards.
 */

/**
 * User XP data stored per guild member
 *
 * @property xp - Total XP accumulated (determines level)
 * @property level - Current level (derived from XP using MEE6 curve)
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
 * - 'stack': User keeps all role rewards from previous levels (MEE6 default)
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
 * All fields have sensible defaults matching MEE6 behavior.
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
	cooldownSeconds: number
	xpRate: number
	noXpRoleIds: string[]
	noXpChannelIds: string[]
	roleRewards: RoleReward[]
	rewardsMode: RewardsMode
	removeRewardOnXpLoss: boolean
	leaderboard: {
		public: boolean
	}
	multipliers?: {
		server?: number
		role?: Record<string, number>
		user?: Record<string, number>
	}
	theme?: {
		embedColor?: number
		backgroundUrl?: string
	}
	labels?: {
		xpDisplayName?: string
	}
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
 * @property oldLevel - Previous level
 * @property newLevel - New level (always > oldLevel)
 * @property totalXp - Total XP after level up
 *
 * @example
 * {
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
 *   oldLevel: 4,
 *   newLevel: 5,
 *   totalXp: 1550
 * }
 */
export interface LevelUpEvent {
	readonly guildId: string
	readonly userId: string
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
 * @property oldLevel - Previous level
 * @property newLevel - New level (always < oldLevel)
 * @property totalXp - Total XP after level down
 *
 * @example
 * {
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
 *   oldLevel: 5,
 *   newLevel: 4,
 *   totalXp: 1200
 * }
 */
export interface LevelDownEvent {
	readonly guildId: string
	readonly userId: string
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
 * @property oldXp - Previous XP amount
 * @property newXp - New XP amount
 * @property delta - Change in XP (newXp - oldXp, can be negative)
 * @property reason - Optional reason for XP change (e.g., 'manual_adjustment', 'message')
 *
 * @example
 * {
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
 *   oldXp: 1500,
 *   newXp: 1550,
 *   delta: 50,
 *   reason: 'message'
 * }
 */
export interface XPChangeEvent {
	readonly guildId: string
	readonly userId: string
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
 * Options for adding XP to a user
 *
 * @property reason - Optional audit trail reason for XP change
 *
 * @example
 * { reason: 'admin_bonus' }
 */
export interface AddXPOptions {
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
