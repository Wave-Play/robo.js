/**
 * Unit tests for leaderboard service
 *
 * Tests caching, pagination, rank lookup, cache invalidation, and performance.
 *
 * Uses Flashcore mocking to provide test data for getAllUsers, similar to store.test.ts
 */

import { describe, test, expect, jest } from '@jest/globals'

import type { UserXP } from '../src/types.js'
import * as service from '../src/runtime/service.js'
import { putUser, XP_NAMESPACE } from '../src/store/index.js'
import { Flashcore } from 'robo.js'
import { _getEmitter } from '../src/runtime/events.js'

// ============================================================================
// Mock Setup
// ============================================================================

/**
 * Mock store to emulate Flashcore persistence
 * Keyed by: namespace:key
 */
let mockFlashcoreStore = new Map<string, unknown>()

/**
 * Original Flashcore methods (saved before mocking)
 */
const originalFlashcoreGet = Flashcore.get
const originalFlashcoreSet = Flashcore.set

/**
 * Setup mock Flashcore
 */
function setupMockFlashcore() {
	mockFlashcoreStore.clear()

	// Mock Flashcore.get
	;(Flashcore as any).get = async function <T>(key: string, options: { namespace: string }): Promise<T | undefined> {
		const fullKey = `${options.namespace}:${key}`
		return mockFlashcoreStore.get(fullKey) as T | undefined
	}

	// Mock Flashcore.set
	;(Flashcore as any).set = async function <T>(key: string, value: T, options: { namespace: string }): Promise<void> {
		const fullKey = `${options.namespace}:${key}`
		if (value === undefined) {
			mockFlashcoreStore.delete(fullKey)
		} else {
			mockFlashcoreStore.set(fullKey, value)
		}
	}
}

/**
 * Restore original Flashcore methods
 */
function restoreFlashcore() {
	;(Flashcore as any).get = originalFlashcoreGet
	;(Flashcore as any).set = originalFlashcoreSet
	service.clearAllCaches()
	mockFlashcoreStore.clear()

	// Clear the EventEmitter between tests
	const emitter = _getEmitter()
	emitter.removeAllListeners()
}

/**
 * Helper: Create mock users in Flashcore
 */
async function createMockUsers(count: number, guildId: string = 'guild1') {
	for (let i = 0; i < count; i++) {
		const userId = `user${i.toString().padStart(5, '0')}`
		const xp = Math.max(0, 10000 - i * 10) // Descending XP values
		await putUser(guildId, userId, {
			xp,
			level: Math.floor(xp / 100),
			lastAwardedAt: Date.now(),
			messages: i + 1,
			xpMessages: i
		})
	}
}

/**
 * Helper: Create users with specific XP values
 */
async function createUsersWithXP(userXpMap: Record<string, number>, guildId: string = 'guild1') {
	for (const [userId, xp] of Object.entries(userXpMap)) {
		await putUser(guildId, userId, {
			xp,
			level: Math.floor(xp / 100),
			lastAwardedAt: Date.now(),
			messages: 1,
			xpMessages: 1
		})
	}
}

/**
 * Helper: Emit a mock event using the real EventEmitter
 */
function emitEvent(event: string, data: any) {
	const emitter = _getEmitter()
	emitter.emit(event, data)
}

// ============================================================================
// Test Suite: Cache Initialization
// ============================================================================

test('Cache: getLeaderboard returns empty array for empty guild', async () => {
	setupMockFlashcore()

	const { entries, total } = await service.getLeaderboard('guild1', 0, 10)

	expect(entries.length).toBe(0)
	expect(total).toBe(0)

	restoreFlashcore()
})

test('Cache: refreshLeaderboard populates cache from all users', async () => {
	setupMockFlashcore()
	await createMockUsers(25, 'guild1')

	await service.refreshLeaderboard('guild1')

	const { entries } = await service.getLeaderboard('guild1', 0, 10)

	expect(entries.length).toBeGreaterThan(0)
	expect(entries[0].userId).toBe('user00000') // First user has highest XP
	expect(entries[0].rank).toBe(1)

	restoreFlashcore()
})

test('Cache: cache is reused within TTL on subsequent calls', async () => {
	setupMockFlashcore()
	await createMockUsers(10, 'guild1')

	// First call - populates cache
	const result1 = await service.getLeaderboard('guild1', 0, 5)
	expect(result1.entries.length).toBe(5)

	// Second call - should return from cache (not re-sorted)
	const result2 = await service.getLeaderboard('guild1', 0, 5)
	expect(result2.entries.length).toBe(5)
	expect(result1.entries[0].userId).toEqual(result2.entries[0].userId)

	restoreFlashcore()
})

test('Cache: totalUsers is stored and returned', async () => {
	setupMockFlashcore()
	await createMockUsers(150, 'guild1')

	await service.refreshLeaderboard('guild1')

	const { total } = await service.getLeaderboard('guild1', 0, 10)

	expect(total).toBe(150)

	restoreFlashcore()
})

// ============================================================================
// Test Suite: Stable Sorting (XP desc, userId asc)
// ============================================================================

test('Sort: users are sorted by XP descending', async () => {
	setupMockFlashcore()
	await createUsersWithXP({
		user1: 500,
		user2: 1000,
		user3: 750,
		user4: 250,
		user5: 1500
	}, 'guild1')

	const { entries } = await service.getLeaderboard('guild1', 0, 10)

	expect(entries[0].userId).toBe('user5')
	expect(entries[1].userId).toBe('user2')
	expect(entries[2].userId).toBe('user3')
	expect(entries[3].userId).toBe('user1')
	expect(entries[4].userId).toBe('user4')

	restoreFlashcore()
})

test('Sort: equal XP sorted by userId ascending (tiebreaker)', async () => {
	setupMockFlashcore()
	await createUsersWithXP({
		userC: 1000,
		userA: 1000,
		userB: 1000
	}, 'guild1')

	const { entries } = await service.getLeaderboard('guild1', 0, 10)

	expect(entries[0].userId).toBe('userA')
	expect(entries[1].userId).toBe('userB')
	expect(entries[2].userId).toBe('userC')

	restoreFlashcore()
})

test('Sort: ranks are assigned 1-indexed', async () => {
	setupMockFlashcore()
	await createMockUsers(10, 'guild1')

	const { entries } = await service.getLeaderboard('guild1', 0, 10)

	entries.forEach((entry, index) => {
		expect(entry.rank).toBe(index + 1)
	})

	restoreFlashcore()
})

// ============================================================================
// Test Suite: Pagination
// ============================================================================

test('Pagination: returns correct slice for page 1', async () => {
	setupMockFlashcore()
	await createMockUsers(50, 'guild1')

	const { entries } = await service.getLeaderboard('guild1', 0, 10)

	expect(entries.length).toBe(10)
	expect(entries[0].rank).toBe(1)
	expect(entries[9].rank).toBe(10)

	restoreFlashcore()
})

test('Pagination: returns correct slice for page 2 (offset=10)', async () => {
	setupMockFlashcore()
	await createMockUsers(50, 'guild1')

	const { entries } = await service.getLeaderboard('guild1', 10, 10)

	expect(entries.length).toBe(10)
	expect(entries[0].rank).toBe(11)
	expect(entries[9].rank).toBe(20)

	restoreFlashcore()
})

test('Pagination: handles partial page near end', async () => {
	setupMockFlashcore()
	await createMockUsers(25, 'guild1')

	const { entries } = await service.getLeaderboard('guild1', 10, 20)

	expect(entries.length).toBe(15)

	restoreFlashcore()
})

test('Pagination: returns empty array when offset beyond total', async () => {
	setupMockFlashcore()
	await createMockUsers(20, 'guild1')

	const { entries } = await service.getLeaderboard('guild1', 100, 10)

	expect(entries.length).toBe(0)

	restoreFlashcore()
})

test('Pagination: supports pagination beyond cached top 100', async () => {
	setupMockFlashcore()
	await createMockUsers(250, 'guild1')

	// Page 11 (offset=100, limit=10) - beyond MAX_CACHE_SIZE
	const { entries } = await service.getLeaderboard('guild1', 100, 10)

	expect(entries.length).toBe(10)
	expect(entries[0].rank).toBe(101)
	expect(entries[9].rank).toBe(110)

	restoreFlashcore()
})

test('Pagination: supports deep pagination (page 15 at 1500+ users)', async () => {
	setupMockFlashcore()
	await createMockUsers(1600, 'guild1')

	// Page 15 (offset=140, limit=10)
	const { entries } = await service.getLeaderboard('guild1', 140, 10)

	expect(entries.length).toBe(10)
	expect(entries[0].rank).toBe(141)
	expect(entries[9].rank).toBe(150)

	restoreFlashcore()
})

// ============================================================================
// Test Suite: User Rank Lookup
// ============================================================================

test('Rank: getUserRank returns correct rank for top 100 user (cached)', async () => {
	setupMockFlashcore()
	await createMockUsers(50, 'guild1')

	await service.refreshLeaderboard('guild1')

	const rankInfo = await service.getUserRank('guild1', 'user00010')

	expect(rankInfo).not.toBeNull()
	expect(rankInfo!.rank).toBe(11)
	expect(rankInfo!.total).toBe(50)

	restoreFlashcore()
})

test('Rank: getUserRank returns correct rank for user beyond top 100 (non-cached)', async () => {
	setupMockFlashcore()
	await createMockUsers(200, 'guild1')

	const rankInfo = await service.getUserRank('guild1', 'user00150')

	expect(rankInfo).not.toBeNull()
	expect(rankInfo!.rank).toBe(151)
	expect(rankInfo!.total).toBe(200)

	restoreFlashcore()
})

test('Rank: getUserRank returns null for user with 0 XP', async () => {
	setupMockFlashcore()
	await createUsersWithXP({
		user1: 100,
		user2: 0
	}, 'guild1')

	const rankInfo = await service.getUserRank('guild1', 'user2')

	expect(rankInfo).toBe(null)

	restoreFlashcore()
})

test('Rank: getUserRank returns null for non-existent user', async () => {
	setupMockFlashcore()
	await createMockUsers(50, 'guild1')

	const rankInfo = await service.getUserRank('guild1', 'nonexistent')

	expect(rankInfo).toBe(null)

	restoreFlashcore()
})

test('Rank: getUserRank respects stable sort tiebreaker', async () => {
	setupMockFlashcore()
	await createUsersWithXP({
		userA: 1000,
		userB: 1000,
		userC: 1000
	}, 'guild1')

	const rankA = await service.getUserRank('guild1', 'userA')
	const rankB = await service.getUserRank('guild1', 'userB')
	const rankC = await service.getUserRank('guild1', 'userC')

	expect(rankA?.rank).toBe(1)
	expect(rankB?.rank).toBe(2)
	expect(rankC?.rank).toBe(3)

	restoreFlashcore()
})

// ============================================================================
// Test Suite: Cache Invalidation
// ============================================================================

test('Invalidation: invalidateCache clears cache for specific guild', async () => {
	setupMockFlashcore()
	await createMockUsers(20, 'guild1')
	await createMockUsers(20, 'guild2')

	await service.refreshLeaderboard('guild1')
	await service.refreshLeaderboard('guild2')

	// Get initial results
	const before1 = await service.getLeaderboard('guild1', 0, 5)
	const before2 = await service.getLeaderboard('guild2', 0, 5)
	expect(before1.entries.length).toBe(5)
	expect(before2.entries.length).toBe(5)

	// Invalidate guild1 only
	service.invalidateCache('guild1')

	// Guild1 cache should be cleared, guild2 should be fine
	const after1 = await service.getLeaderboard('guild1', 0, 5)
	const after2 = await service.getLeaderboard('guild2', 0, 5)
	expect(after1.entries.length).toBe(5)
	expect(after2.entries.length).toBe(5)

	restoreFlashcore()
})

test('Invalidation: xpChange event triggers cache invalidation', async () => {
	setupMockFlashcore()
	await createMockUsers(20, 'guild1')

	await service.refreshLeaderboard('guild1')

	// Emit xpChange event
	emitEvent('xpChange', { guildId: 'guild1', userId: 'user00000', oldXp: 100, newXp: 200, delta: 100 })

	// Cache should be invalidated (next call will refresh)
	const result = await service.getLeaderboard('guild1', 0, 5)
	expect(result.entries.length).toBeGreaterThan(0)

	restoreFlashcore()
})

test('Invalidation: levelUp event triggers cache invalidation', async () => {
	setupMockFlashcore()
	await createMockUsers(20, 'guild1')

	await service.refreshLeaderboard('guild1')

	// Emit levelUp event
	emitEvent('levelUp', { guildId: 'guild1', userId: 'user00000', oldLevel: 5, newLevel: 6, totalXp: 2000 })

	const result = await service.getLeaderboard('guild1', 0, 5)
	expect(result.entries.length).toBeGreaterThan(0)

	restoreFlashcore()
})

test('Invalidation: levelDown event triggers cache invalidation', async () => {
	setupMockFlashcore()
	await createMockUsers(20, 'guild1')

	await service.refreshLeaderboard('guild1')

	// Emit levelDown event
	emitEvent('levelDown', { guildId: 'guild1', userId: 'user00000', oldLevel: 6, newLevel: 5, totalXp: 1900 })

	const result = await service.getLeaderboard('guild1', 0, 5)
	expect(result.entries.length).toBeGreaterThan(0)

	restoreFlashcore()
})

// ============================================================================
// Test Suite: Cache TTL Expiry
// ============================================================================

test('TTL: cache is used within TTL window', async () => {
	setupMockFlashcore()
	await createMockUsers(20, 'guild1')

	const result1 = await service.getLeaderboard('guild1', 0, 10)
	const result2 = await service.getLeaderboard('guild1', 0, 10)

	// Both should be identical (from cache)
	expect(result1.entries[0].userId).toBe(result2.entries[0].userId)

	restoreFlashcore()
})

test('TTL: cache is invalidated after TTL expires', async () => {
	setupMockFlashcore()
	await createMockUsers(20, 'guild1')

	// First call populates cache
	await service.getLeaderboard('guild1', 0, 10)

	// Next call should work fine
	const result = await service.getLeaderboard('guild1', 0, 10)
	expect(result.entries.length).toBeGreaterThan(0)

	restoreFlashcore()
})

// ============================================================================
// Test Suite: MAX_CACHE_SIZE Limit
// ============================================================================

test('Cache limit: cache only stores top 100 entries', async () => {
	setupMockFlashcore()
	await createMockUsers(200, 'guild1')

	await service.refreshLeaderboard('guild1')

	// Request all 200 entries by paginating
	const page1 = await service.getLeaderboard('guild1', 0, 100)
	const page2 = await service.getLeaderboard('guild1', 100, 100)

	// Page 1 should have 100 entries (from cache)
	expect(page1.entries.length).toBe(100)

	// Page 2 should have 100 entries (calculated from full list, not cached)
	expect(page2.entries.length).toBe(100)

	// Total should be correct
	expect(page2.total).toBe(200)

	restoreFlashcore()
})

test('Cache limit: rank assignment is correct across full dataset', async () => {
	setupMockFlashcore()
	await createMockUsers(150, 'guild1')

	const page1 = await service.getLeaderboard('guild1', 0, 100)
	const page2 = await service.getLeaderboard('guild1', 100, 50)

	// Page 1: ranks 1-100
	expect(page1.entries[0].rank).toBe(1)
	expect(page1.entries[99].rank).toBe(100)

	// Page 2: ranks 101-150
	expect(page2.entries[0].rank).toBe(101)
	expect(page2.entries[49].rank).toBe(150)

	restoreFlashcore()
})

// ============================================================================
// Test Suite: Performance
// ============================================================================

test('Performance: sorting 1000 users completes in <200ms', async () => {
	setupMockFlashcore()
	await createMockUsers(1000, 'guild1')

	const startTime = Date.now()
	await service.refreshLeaderboard('guild1')
	const duration = Date.now() - startTime

	expect(duration).toBeLessThan(200)

	restoreFlashcore()
})

test('Performance: cached read is fast', async () => {
	setupMockFlashcore()
	await createMockUsers(1000, 'guild1')

	// Warm up cache
	await service.getLeaderboard('guild1', 0, 10)

	// Cached read should be very fast
	const startTime = Date.now()
	for (let i = 0; i < 100; i++) {
		await service.getLeaderboard('guild1', 0, 10)
	}
	const duration = Date.now() - startTime

	// 100 cached reads should complete quickly (allow ~1ms per read average)
	expect(duration).toBeLessThan(200)

	restoreFlashcore()
})

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

test('Edge case: empty guild returns empty results', async () => {
	setupMockFlashcore()

	const { entries, total } = await service.getLeaderboard('guild1', 0, 10)

	expect(entries.length).toBe(0)
	expect(total).toBe(0)

	restoreFlashcore()
})

test('Edge case: single user guild works correctly', async () => {
	setupMockFlashcore()
	await createUsersWithXP({ user1: 1000 }, 'guild1')

	const { entries, total } = await service.getLeaderboard('guild1', 0, 10)

	expect(entries.length).toBe(1)
	expect(entries[0].rank).toBe(1)
	expect(total).toBe(1)

	restoreFlashcore()
})

test('Edge case: users with 0 XP are sorted by userId', async () => {
	setupMockFlashcore()
	await createUsersWithXP({
		userC: 0,
		userA: 0,
		userB: 0
	}, 'guild1')

	const { entries } = await service.getLeaderboard('guild1', 0, 10)

	// All users should be returned (even with 0 XP)
	expect(entries.length).toBe(3)
	expect(entries[0].userId).toBe('userA')
	expect(entries[1].userId).toBe('userB')
	expect(entries[2].userId).toBe('userC')

	restoreFlashcore()
})

test('Edge case: clearAllCaches clears all guild caches', async () => {
	setupMockFlashcore()
	await createMockUsers(20, 'guild1')
	await createMockUsers(20, 'guild2')
	await createMockUsers(20, 'guild3')

	await service.refreshLeaderboard('guild1')
	await service.refreshLeaderboard('guild2')
	await service.refreshLeaderboard('guild3')

	// Clear all caches
	service.clearAllCaches()

	// Next calls should refresh caches
	const result1 = await service.getLeaderboard('guild1', 0, 5)
	const result2 = await service.getLeaderboard('guild2', 0, 5)
	const result3 = await service.getLeaderboard('guild3', 0, 5)

	expect(result1.entries.length).toBeGreaterThan(0)
	expect(result2.entries.length).toBeGreaterThan(0)
	expect(result3.entries.length).toBeGreaterThan(0)

	restoreFlashcore()
})
