/**
 * Leaderboard caching service for performance optimization.
 *
 * Provides in-memory caching of sorted leaderboards with automatic invalidation
 * on XP changes. Optimized for large servers (10k+ users) with:
 * - Top 100 user cache per guild (reduces memory footprint)
 * - TTL-based expiration (60 seconds)
 * - Event-driven cache invalidation
 * - O(1) cached reads, O(n log n) cache refresh
 *
 * Cache is automatically invalidated on xpChange, levelUp, and levelDown events.
 */

import type { LeaderboardEntry } from '../types.js'
import { getAllUsers } from '../store/index.js'
import { computeLevelFromTotalXp } from '../math/curve.js'
import { on as onEvent } from './events.js'
import { logger } from 'robo.js'

/**
 * Cache configuration constants
 */
const CACHE_TTL = 60000 // 60 seconds
const MAX_CACHE_SIZE = 100 // Top 100 users per guild

/**
 * In-memory cache: guildId -> sorted leaderboard entries
 */
const leaderboardCache = new Map<string, LeaderboardEntry[]>()

/**
 * Cache timestamps: guildId -> last update time
 */
const cacheTimestamps = new Map<string, number>()

/**
 * Total users count: guildId -> total number of tracked users
 */
const totalUsersCache = new Map<string, number>()

/**
 * Retrieves leaderboard with pagination support and total user count.
 * Uses cached data if available and fresh, otherwise triggers refresh.
 * Supports deep pagination beyond the cached top N.
 *
 * Complexity:
 * - O(1) for cached reads within cached range (within TTL)
 * - O(n log n) for cache refresh (all users sorted)
 * - O(n log n) for deep pagination fallback (full dataset sort and slice)
 *
 * @param guildId - Guild ID
 * @param offset - Starting position (0-indexed, default: 0)
 * @param limit - Number of entries to return (default: 10)
 * @returns Object with entries array and total user count
 *
 * @example
 * ```typescript
 * // Get top 10 users
 * const { entries, total } = await getLeaderboard('123...', 0, 10)
 *
 * // Get users 11-20 (page 2)
 * const { entries, total } = await getLeaderboard('123...', 10, 10)
 *
 * // Get users 101-110 (beyond cached top 100)
 * const { entries, total } = await getLeaderboard('123...', 100, 10)
 * ```
 */
export async function getLeaderboard(
	guildId: string,
	offset: number = 0,
	limit: number = 10
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
	// Check cache validity
	const cached = leaderboardCache.get(guildId)
	const timestamp = cacheTimestamps.get(guildId)
	const isCacheValid = cached && timestamp && Date.now() - timestamp < CACHE_TTL

	// Ensure cache is fresh
	if (!isCacheValid) {
		await refreshLeaderboard(guildId)
	}

	// After ensuring freshness, recompute cached reference
	const freshCached = leaderboardCache.get(guildId) ?? []

	// If requested window is within cached coverage, return from cache
	if (offset + limit <= freshCached.length) {
		const total = totalUsersCache.get(guildId) ?? 0
		return {
			entries: freshCached.slice(offset, offset + limit),
			total
		}
	}

	// Requested window exceeds cached coverage - full-range fallback
	const users = await getAllUsers(guildId)

	// Map users to entries with rank assignment
	const entries: LeaderboardEntry[] = Array.from(users.entries())
		.map(([userId, userData]) => {
			const levelInfo = computeLevelFromTotalXp(userData.xp)
			return {
				userId,
				xp: userData.xp,
				level: levelInfo.level,
				rank: 0 // Will be set below
			}
		})
		.sort((a, b) => {
			// Sort by XP descending, then userId ascending (stable sort)
			const xpDiff = b.xp - a.xp
			if (xpDiff !== 0) return xpDiff
			return a.userId.localeCompare(b.userId)
		})

	// Assign rank positions (1-indexed)
	entries.forEach((entry, index) => {
		entry.rank = index + 1
	})

	// Slice the requested window
	const sliced = entries.slice(offset, offset + limit)

	// Return with total from full dataset
	return {
		entries: sliced,
		total: users.size
	}
}

/**
 * Rebuilds leaderboard cache from Flashcore storage.
 * Fetches all users, sorts by XP (desc) then userId (asc), and caches top N.
 * Also updates the total users count for the guild.
 *
 * Complexity: O(n log n) where n = total users in guild
 *
 * @param guildId - Guild ID
 *
 * @example
 * ```typescript
 * // Manually refresh cache (usually automatic via events)
 * await refreshLeaderboard('123...')
 * ```
 */
export async function refreshLeaderboard(guildId: string): Promise<void> {
	try {
		// Fetch all users from Flashcore
		const users = await getAllUsers(guildId)

		// Store total user count for this guild
		totalUsersCache.set(guildId, users.size)

		// Convert to array and sort
		const entries: LeaderboardEntry[] = Array.from(users.entries())
			.map(([userId, userData]) => {
				const levelInfo = computeLevelFromTotalXp(userData.xp)
				return {
					userId,
					xp: userData.xp,
					level: levelInfo.level,
					rank: 0 // Will be set below
				}
			})
			.sort((a, b) => {
				// Sort by XP descending, then userId ascending (stable sort)
				const xpDiff = b.xp - a.xp
				if (xpDiff !== 0) return xpDiff
				return a.userId.localeCompare(b.userId)
			})

		// Assign rank positions (1-indexed)
		entries.forEach((entry, index) => {
			entry.rank = index + 1
		})

		// Cache top N entries
		const topEntries = entries.slice(0, MAX_CACHE_SIZE)
		leaderboardCache.set(guildId, topEntries)
		cacheTimestamps.set(guildId, Date.now())

		logger.debug(`Refreshed leaderboard cache for guild ${guildId}: ${entries.length} users, cached top ${topEntries.length}`)
	} catch (error) {
		logger.error(`Failed to refresh leaderboard cache for guild ${guildId}:`, error)
		throw error
	}
}

/**
 * Gets user's rank position in the leaderboard.
 * Returns null if user has no XP record.
 *
 * For users in top 100, uses cached data (O(n) search).
 * For users beyond cache, fetches all users and calculates position (O(n log n)).
 * Always returns the total number of tracked users from getAllUsers.
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @returns Rank info (1-indexed position and total users) or null if user not found
 *
 * @example
 * ```typescript
 * const rankInfo = await getUserRank('123...', '456...')
 * if (rankInfo) {
 *   console.log(`User is rank ${rankInfo.rank} out of ${rankInfo.total}`)
 * }
 * ```
 */
export async function getUserRank(
	guildId: string,
	userId: string
): Promise<{ rank: number; total: number } | null> {
	try {
		// Ensure cache is fresh
		const cached = leaderboardCache.get(guildId)
		const timestamp = cacheTimestamps.get(guildId)
		const isCacheValid = cached && timestamp && Date.now() - timestamp < CACHE_TTL

		if (!isCacheValid) {
			await refreshLeaderboard(guildId)
		}

		// Always fetch total users from getAllUsers to get accurate count
		const users = await getAllUsers(guildId)

		// Check if user exists and has XP > 0 FIRST
		const userData = users.get(userId)
		if (!userData || userData.xp === 0) {
			return null
		}

		// Check if user is in cache
		const cache = leaderboardCache.get(guildId) ?? []
		const cachedEntry = cache.find((entry) => entry.userId === userId)

		if (cachedEntry) {
			return {
				rank: cachedEntry.rank,
				total: users.size
			}
		}

		// User not in cache - need to calculate position from all users
		// Count users with more XP (or equal XP but lower userId)
		let rank = 1
		for (const [otherUserId, otherUserData] of users.entries()) {
			if (otherUserId === userId) continue

			if (
				otherUserData.xp > userData.xp ||
				(otherUserData.xp === userData.xp && otherUserId.localeCompare(userId) < 0)
			) {
				rank++
			}
		}

		return {
			rank,
			total: users.size
		}
	} catch (error) {
		logger.error(`Failed to get user rank for ${userId} in guild ${guildId}:`, error)
		return null
	}
}

/**
 * Invalidates cache for a specific guild.
 * Called automatically when XP changes via event listeners.
 *
 * @param guildId - Guild ID
 *
 * @example
 * ```typescript
 * // Manual cache invalidation (usually automatic)
 * invalidateCache('123...')
 * ```
 */
export function invalidateCache(guildId: string): void {
	leaderboardCache.delete(guildId)
	cacheTimestamps.delete(guildId)
	totalUsersCache.delete(guildId)
	logger.debug(`Invalidated leaderboard cache for guild ${guildId}`)
}

/**
 * Clears all cached leaderboards.
 * Useful for testing or manual cache reset.
 *
 * @example
 * ```typescript
 * clearAllCaches()
 * ```
 */
export function clearAllCaches(): void {
	leaderboardCache.clear()
	cacheTimestamps.clear()
	totalUsersCache.clear()
	logger.debug('Cleared all leaderboard caches')
}

/**
 * Register event listeners for automatic cache invalidation.
 * Called at module load to ensure cache stays synchronized.
 */
onEvent('xpChange', (event) => {
	invalidateCache(event.guildId)
})

onEvent('levelUp', (event) => {
	invalidateCache(event.guildId)
})

onEvent('levelDown', (event) => {
	invalidateCache(event.guildId)
})

logger.debug('Leaderboard service initialized with event-driven cache invalidation')
