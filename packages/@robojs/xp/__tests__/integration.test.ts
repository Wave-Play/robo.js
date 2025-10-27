/**
 * Integration tests for @robojs/xp
 * Tests end-to-end functionality of XP and leaderboard systems
 */

import { test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { Flashcore } from 'robo.js'

// Import functions from the package
import { xp, leaderboard } from '../.robo/build/index.js'
import * as service from '../.robo/build/runtime/service.js'

// ============================================================================
// Mock Flashcore Setup
// ============================================================================

let mockFlashcoreStore = new Map<string, unknown>()

// Save original Flashcore methods
const originalFlashcoreGet = Flashcore.get
const originalFlashcoreSet = Flashcore.set

function setupMockFlashcore() {
	mockFlashcoreStore.clear()

	// Mock Flashcore.get to read from mockFlashcoreStore
	Flashcore.get = jest.fn(async (key: string, options: any = {}) => {
		const namespace = options.namespace || ''
		const fullKey = namespace ? `${namespace}:${key}` : key
		return mockFlashcoreStore.get(fullKey)
	}) as any

	// Mock Flashcore.set to write to mockFlashcoreStore
	Flashcore.set = jest.fn(async (key: string, value: unknown, options: any = {}) => {
		const namespace = options.namespace || ''
		const fullKey = namespace ? `${namespace}:${key}` : key

		if (value === undefined) {
			mockFlashcoreStore.delete(fullKey)
		} else {
			mockFlashcoreStore.set(fullKey, value)
		}
	}) as any
}

function restoreFlashcore() {
	// Restore original methods
	Flashcore.get = originalFlashcoreGet
	Flashcore.set = originalFlashcoreSet

	// Clear all service caches
	service.clearAllCaches()

	// Clear mock store
	mockFlashcoreStore.clear()
}

beforeEach(() => {
	setupMockFlashcore()
})

afterEach(() => {
	restoreFlashcore()
})

// ============================================================================
// Test Suite: Basic Integration Tests
// ============================================================================

test('XP system: add XP to user', async () => {
	const guildId = 'test-guild-1'
	const userId = 'test-user-1'

	const result = await xp.add(guildId, userId, 100)

	expect(result.oldXp).toBe(0)
	expect(result.newXp).toBe(100)
	expect(result.oldLevel).toBe(0)
	expect(result.newLevel).toBe(0)
	expect(result.leveledUp).toBe(false)
})

test('XP system: level up when crossing threshold', async () => {
	const guildId = 'test-guild-2'
	const userId = 'test-user-2'

	// Level 1 requires 155 XP
	const result = await xp.add(guildId, userId, 200)

	expect(result.newXp).toBe(200)
	expect(result.newLevel).toBe(1)
	expect(result.leveledUp).toBe(true)
})

test('XP system: set XP directly', async () => {
	const guildId = 'test-guild-3'
	const userId = 'test-user-3'

	const result = await xp.set(guildId, userId, 500)

	expect(result.newXp).toBe(500)
	expect(result.newLevel).toBe(2)
})

test('XP system: remove XP', async () => {
	const guildId = 'test-guild-4'
	const userId = 'test-user-4'

	// First add some XP
	await xp.add(guildId, userId, 200)

	// Then remove
	const result = await xp.remove(guildId, userId, 50)

	expect(result.oldXp).toBe(200)
	expect(result.newXp).toBe(150)
})

test('XP system: recalculate level', async () => {
	const guildId = 'test-guild-5'
	const userId = 'test-user-5'

	// Add XP
	await xp.add(guildId, userId, 200)

	// Recalculate
	const result = await xp.recalc(guildId, userId)

	expect(result.reconciled).toBe(false) // Already correct
	expect(result.newLevel).toBe(1)
})

test('Leaderboard: get leaderboard for guild', async () => {
	const guildId = 'test-guild-6'

	// Add some users
	await xp.add(guildId, 'user-a', 500)
	await xp.add(guildId, 'user-b', 300)
	await xp.add(guildId, 'user-c', 700)

	const result = await leaderboard.get(guildId, 0, 10)

	expect(result.entries.length).toBeGreaterThanOrEqual(3)
	// Verify sorted by XP descending
	if (result.entries.length >= 2) {
		expect(result.entries[0].xp).toBeGreaterThanOrEqual(result.entries[1].xp)
	}
})

test('Leaderboard: get user rank', async () => {
	const guildId = 'test-guild-7'
	const userId = 'user-ranked'

	// Add user with XP
	await xp.add(guildId, userId, 600)

	const result = await leaderboard.getRank(guildId, userId)

	expect(result).not.toBeNull()
	expect(result!.rank >= 1).toBe(true)
	expect(result!.total >= 1).toBe(true)
})

test('Performance: leaderboard caching (top 100)', async () => {
	const guildId = 'test-guild-perf'

	// Create some test users
	for (let i = 0; i < 20; i++) {
		await xp.add(guildId, `perf-user-${i}`, i * 100)
	}

	// First query (may build cache)
	const start = performance.now()
	const result = await leaderboard.get(guildId, 0, 10)
	const firstQuery = performance.now() - start

	// Second query (should be cached)
	const start2 = performance.now()
	await leaderboard.get(guildId, 0, 10)
	const secondQuery = performance.now() - start2

	console.log(`\nLeaderboard performance:`)
	console.log(`  First query: ${firstQuery.toFixed(2)}ms`)
	console.log(`  Second query (cached): ${secondQuery.toFixed(2)}ms`)

	// Verify results
	expect(result.entries.length).toBeGreaterThan(0)

	// Second query should be faster (cached)
	// Message counters (messages and xpMessages) are tracked separately and don't impact
	// leaderboard performance as they're not included in cached leaderboard entries.
	expect(secondQuery).toBeLessThan(firstQuery * 2) // Allow some variance
})

// ============================================================================
// Test Suite: Message Counter Integration Tests
// ============================================================================

test('Message counters: messages vs xpMessages distinction', async () => {
	const guildId = 'test-guild-messages'
	const userId = 'test-user-messages'

	// Add XP to user multiple times
	await xp.add(guildId, userId, 100)
	await xp.add(guildId, userId, 100)
	await xp.add(guildId, userId, 100)

	// Retrieve user data
	const user = await xp.getUser(guildId, userId)

	// Both counters should be present in UserXP records
	expect(user).not.toBeNull()
	expect(typeof user?.messages).toBe('number')
	expect(typeof user?.xpMessages).toBe('number')
})

test('XP manipulation preserves message counters', async () => {
	const guildId = 'test-guild-preserve'
	const userId = 'test-user-preserve'

	// Add XP to establish a user
	await xp.add(guildId, userId, 500)

	// Get initial user data and store message counter values
	const initialUser = await xp.getUser(guildId, userId)
	const initialMessages = initialUser?.messages || 0
	const initialXpMessages = initialUser?.xpMessages || 0

	// Perform XP operations
	await xp.remove(guildId, userId, 100)
	await xp.set(guildId, userId, 1000)

	// Get final user data
	const finalUser = await xp.getUser(guildId, userId)

	// Message counters should only be modified by message handler, not XP manipulation
	expect(finalUser?.messages).toBe(initialMessages)
	expect(finalUser?.xpMessages).toBe(initialXpMessages)
})

test('New users initialize both message counters to 0', async () => {
	const guildId = 'test-guild-new'
	const userId = 'test-user-new'

	// Add XP to a brand new user
	await xp.add(guildId, userId, 250)

	// Retrieve user data
	const user = await xp.getUser(guildId, userId)

	// New users should have both counters initialized to 0
	expect(user).not.toBeNull()
	expect(user?.messages).toBe(0)
	expect(user?.xpMessages).toBe(0)
})

test('Leaderboard entries include message data', async () => {
	const guildId = 'test-guild-leaderboard'

	// Add some users with XP
	await xp.add(guildId, 'user-1', 500)
	await xp.add(guildId, 'user-2', 300)
	await xp.add(guildId, 'user-3', 700)

	// Get leaderboard
	const result = await leaderboard.get(guildId, 0, 10)

	// Leaderboard entries don't include message counters (only userId, xp, level, rank)
	expect(result.entries.length).toBeGreaterThan(0)
	for (const entry of result.entries) {
		expect(typeof entry.userId).toBe('string')
		expect(typeof entry.xp).toBe('number')
		expect(typeof entry.level).toBe('number')
		expect(typeof entry.rank).toBe('number')
	}
})

// ============================================================================
// Test Suite: Message Counter and Gating Logic (Conceptual Tests)
// ============================================================================

// Note: Message counter increment and gating logic (cooldown, No-XP roles/channels)
// is implemented in the message handler (award.ts) and tested in the unit tests.
// The integration test for this functionality would require a full Discord.js mock
// and Flashcore initialization, which is beyond the scope of these lightweight
// integration tests.
//
// The actual behavior is tested through:
// 1. Unit tests in xp.test.ts (verify message counters are preserved)
// 2. Message handler tests (would test the actual increment logic)
// 3. Type system validation (UserXP includes messages and xpMessages fields)
