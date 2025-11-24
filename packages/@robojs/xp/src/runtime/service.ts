/**
 * Leaderboard caching service for performance optimization.
 *
 * Provides in-memory caching of sorted leaderboards with automatic invalidation
 * on XP changes. Optimized for large servers (10k+ users) with:
 * - Top 100 user cache per guild and store (reduces memory footprint)
 * - TTL-based expiration (60 seconds)
 * - Event-driven cache invalidation
 * - O(1) cached reads, O(n log n) cache refresh
 * - Multi-store support: Each store has independent leaderboard cache
 *
 * Cache structure: Map<guildId, Map<storeId, data>>
 * Cache is automatically invalidated on xpChange, levelUp, and levelDown events.
 * Events include storeId field, ensuring only the affected store's cache is invalidated.
 *
 * @example
 * ```typescript
 * // Default store
 * const { entries, total } = await getLeaderboard('123...', 0, 10)
 *
 * // Custom store (e.g., reputation system)
 * const { entries, total } = await getLeaderboard('123...', 0, 10, { storeId: 'reputation' })
 *
 * // Each store maintains independent cache
 * // XP changes in reputation store only invalidate reputation cache
 * // Default store cache remains unaffected
 * ```
 */

import type { LeaderboardEntry, FlashcoreOptions } from '../types.js'
import { getAllUsers } from '../store/index.js'
import { computeLevelFromTotalXp } from '../math/curve.js'
import { getResolvedCurve } from '../math/curves.js'
import { on as onEvent } from './events.js'
import { logger } from 'robo.js'
import { resolveStoreId } from '../types.js'

/**
 * Cache configuration constants
 */
const CACHE_TTL = 60000 // 60 seconds
const MAX_CACHE_SIZE = 100 // Top 100 users per guild

/**
 * In-memory cache: guildId -> storeId -> sorted leaderboard entries
 * Nested structure for per-store cache isolation
 */
const leaderboardCache = new Map<string, Map<string, LeaderboardEntry[]>>()

/**
 * Cache timestamps: guildId -> storeId -> last update time
 * Nested structure for per-store cache isolation
 */
const cacheTimestamps = new Map<string, Map<string, number>>()

/**
 * Total users count: guildId -> storeId -> total number of tracked users
 * Nested structure for per-store cache isolation
 */
const totalUsersCache = new Map<string, Map<string, number>>()

/**
 * Parallel cache of userId membership for O(1) checks
 * Structure mirrors leaderboardCache: guildId -> storeId -> Set<userId>
 */
const userIdSets = new Map<string, Map<string, Set<string>>>()

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
 * @param options - Optional Flashcore options (e.g., storeId for multi-store support)
 * @returns Object with entries array and total user count
 *
 * @example
 * ```typescript
 * // Get top 10 users (default store)
 * const { entries, total } = await getLeaderboard('123...', 0, 10)
 *
 * // Get users 11-20 (page 2, default store)
 * const { entries, total } = await getLeaderboard('123...', 10, 10)
 *
 * // Get users 101-110 (beyond cached top 100, default store)
 * const { entries, total } = await getLeaderboard('123...', 100, 10)
 *
 * // Get top 10 users from custom store
 * const { entries, total } = await getLeaderboard('123...', 0, 10, { storeId: 'reputation' })
 * ```
 */
export async function getLeaderboard(
	guildId: string,
	offset: number = 0,
	limit: number = 10,
	options?: FlashcoreOptions
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
	// Extract storeId for multi-store support
	const storeId = resolveStoreId(options)

	// Check cache validity
	const cached = leaderboardCache.get(guildId)?.get(storeId)
	const timestamp = cacheTimestamps.get(guildId)?.get(storeId)
	const isCacheValid = cached && timestamp && Date.now() - timestamp < CACHE_TTL

	// Ensure cache is fresh
	if (!isCacheValid) {
		await refreshLeaderboard(guildId, options)
	}

	// After ensuring freshness, recompute cached reference
	const freshCached = leaderboardCache.get(guildId)?.get(storeId) ?? []

	// If requested window is within cached coverage, return from cache
	if (offset + limit <= freshCached.length) {
		const total = totalUsersCache.get(guildId)?.get(storeId) ?? 0
		return {
			entries: freshCached.slice(offset, offset + limit),
			total
		}
	}

	// Requested window exceeds cached coverage - full-range fallback
	const users = await getAllUsers(guildId, options)

	// Resolve curve once for this guild/store to ensure correct level computation
	const curve = await getResolvedCurve(guildId, storeId)

	// Map users to entries with rank assignment
	const entries: LeaderboardEntry[] = Array.from(users.entries())
		.map(([userId, userData]) => {
			const levelInfo = computeLevelFromTotalXp(userData.xp, curve)
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
 * @param options - Optional Flashcore options (e.g., storeId for multi-store support)
 *
 * @example
 * ```typescript
 * // Manually refresh cache (default store, usually automatic via events)
 * await refreshLeaderboard('123...')
 *
 * // Manually refresh cache for custom store
 * await refreshLeaderboard('123...', { storeId: 'reputation' })
 * ```
 */
export async function refreshLeaderboard(guildId: string, options?: FlashcoreOptions): Promise<void> {
	try {
		// Extract storeId for multi-store support
		const storeId = resolveStoreId(options)

		// Fetch all users from Flashcore
		const users = await getAllUsers(guildId, options)

		// Resolve curve once for this guild/store to compute levels consistently
		const curve = await getResolvedCurve(guildId, storeId)

		// Ensure outer map exists for this guild
		if (!totalUsersCache.has(guildId)) {
			totalUsersCache.set(guildId, new Map())
		}
		// Store total user count for this guild and store
		totalUsersCache.get(guildId)!.set(storeId, users.size)

		// Convert to array and sort
		const entries: LeaderboardEntry[] = Array.from(users.entries())
			.map(([userId, userData]) => {
				const levelInfo = computeLevelFromTotalXp(userData.xp, curve)
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

		// Ensure outer map exists for this guild
		if (!leaderboardCache.has(guildId)) {
			leaderboardCache.set(guildId, new Map())
		}
		leaderboardCache.get(guildId)!.set(storeId, topEntries)

		// Maintain parallel userId Set cache for O(1) membership checks
		if (!userIdSets.has(guildId)) {
			userIdSets.set(guildId, new Map())
		}
		userIdSets
			.get(guildId)!
			.set(
				storeId,
				new Set(topEntries.map((e) => e.userId))
			)

		// Ensure outer map exists for this guild
		if (!cacheTimestamps.has(guildId)) {
			cacheTimestamps.set(guildId, new Map())
		}
		cacheTimestamps.get(guildId)!.set(storeId, Date.now())

		logger.debug(
			`Refreshed leaderboard cache for guild ${guildId} store ${storeId}: ${entries.length} users, cached top ${topEntries.length}`
		)
	} catch (error) {
		logger.error(`Failed to refresh leaderboard cache for guild ${guildId} store ${resolveStoreId(options)}:`, error)
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
 * @param options - Optional Flashcore options (e.g., storeId for multi-store support)
 * @returns Rank info (1-indexed position and total users) or null if user not found
 *
 * @example
 * ```typescript
 * // Get user rank from default store
 * const rankInfo = await getUserRank('123...', '456...')
 * if (rankInfo) {
 *   console.log(`User is rank ${rankInfo.rank} out of ${rankInfo.total}`)
 * }
 *
 * // Get user rank from custom store
 * const repRank = await getUserRank('123...', '456...', { storeId: 'reputation' })
 * ```
 */
export async function getUserRank(guildId: string, userId: string, options?: FlashcoreOptions): Promise<{ rank: number; total: number } | null> {
	try {
		// Extract storeId for multi-store support
		const storeId = resolveStoreId(options)

		// Ensure cache is fresh
		const cached = leaderboardCache.get(guildId)?.get(storeId)
		const timestamp = cacheTimestamps.get(guildId)?.get(storeId)
		const isCacheValid = cached && timestamp && Date.now() - timestamp < CACHE_TTL

		if (!isCacheValid) {
			await refreshLeaderboard(guildId, options)
		}

		// Always fetch total users from getAllUsers to get accurate count
		const users = await getAllUsers(guildId, options)

		// Check if user exists and has XP > 0 FIRST
		const userData = users.get(userId)
		if (!userData || userData.xp === 0) {
			return null
		}

		// Check if user is in cache
		const cache = leaderboardCache.get(guildId)?.get(storeId) ?? []
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
		logger.error(`Failed to get user rank for ${userId} in guild ${guildId} store ${resolveStoreId(options)}:`, error)
		return null
	}
}

/**
 * Invalidates cache for a specific guild and store.
 * Called automatically when XP changes via event listeners.
 *
 * Supports two modes:
 * - Specific store: Pass { storeId: 'name' } to invalidate only that store
 * - All stores: Pass { all: true } to invalidate all stores for the guild
 *
 * @param guildId - Guild ID
 * @param options - Optional Flashcore options or { all: true } to invalidate all stores
 *
 * @example
 * ```typescript
 * // Manual cache invalidation for specific store (usually automatic)
 * invalidateCache('123...', { storeId: 'reputation' })
 *
 * // Invalidate all stores for a guild
 * invalidateCache('123...', { all: true })
 * ```
 */
export function invalidateCache(guildId: string, options?: FlashcoreOptions | { all: true }): void {
	// Handle "all stores" invalidation
	if (options && 'all' in options && options.all) {
		leaderboardCache.delete(guildId)
		cacheTimestamps.delete(guildId)
		totalUsersCache.delete(guildId)
		userIdSets.delete(guildId)
		logger.debug(`Invalidated all leaderboard caches for guild ${guildId}`)
		return
	}

	// Specific store invalidation
	const storeId = resolveStoreId(options as FlashcoreOptions)
	leaderboardCache.get(guildId)?.delete(storeId)
	cacheTimestamps.get(guildId)?.delete(storeId)
	totalUsersCache.get(guildId)?.delete(storeId)
	userIdSets.get(guildId)?.delete(storeId)
	logger.debug(`Invalidated leaderboard cache for guild ${guildId} store ${storeId}`)
}

/**
 * Clears all cached leaderboards for all guilds and all stores.
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
	userIdSets.clear()
	logger.debug('Cleared all leaderboard caches (all guilds, all stores)')
}

/**
 * Checks if a user exists in the cached top 100 for a specific guild and store.
 * Used for lazy cache invalidation - only invalidate if user is in cache.
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param storeId - Store ID
 * @returns true if user is in cached top 100, false otherwise
 */
function isUserInCache(guildId: string, userId: string, storeId: string): boolean {
	// Prefer O(1) membership check using Set if available
	const guildSets = userIdSets.get(guildId)
	const set = guildSets?.get(storeId)
	if (set) return set.has(userId)

	// Fallback to scanning the cached array if Set is not initialized
	const guildCache = leaderboardCache.get(guildId)
	const storeCache = guildCache?.get(storeId)
	if (!storeCache) return false
	return storeCache.some((entry) => entry.userId === userId)
}

/**
 * Register event listeners for automatic cache invalidation.
 * Called at module load to ensure cache stays synchronized.
 *
 * Event listeners automatically invalidate the correct store's cache using event.storeId.
 * Each store maintains independent leaderboard cache, ensuring isolation between stores.
 *
 * Uses lazy invalidation: only invalidates cache if the affected user is in the cached top 100.
 * This dramatically improves cache hit rates in large servers where most XP changes occur outside top 100.
 */
onEvent('xpChange', (event) => {
	const { guildId, userId, storeId } = event
	if (isUserInCache(guildId, userId, storeId)) {
		invalidateCache(guildId, { storeId })
	} else {
		logger.trace(`Skipping cache invalidation for user ${userId} not in top 100 (guild: ${guildId}, store: ${storeId})`)
	}
})

onEvent('levelUp', (event) => {
	const { guildId, userId, storeId } = event
	if (isUserInCache(guildId, userId, storeId)) {
		invalidateCache(guildId, { storeId })
	} else {
		logger.trace(`Skipping cache invalidation for user ${userId} not in top 100 (guild: ${guildId}, store: ${storeId})`)
	}
})

onEvent('levelDown', (event) => {
	const { guildId, userId, storeId } = event
	if (isUserInCache(guildId, userId, storeId)) {
		invalidateCache(guildId, { storeId })
	} else {
		logger.trace(`Skipping cache invalidation for user ${userId} not in top 100 (guild: ${guildId}, store: ${storeId})`)
	}
})

logger.debug('Leaderboard service initialized with lazy cache invalidation (top 100 only)')
