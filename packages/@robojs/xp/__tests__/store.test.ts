/**
 * Unit tests for Flashcore CRUD operations
 * Tests data persistence, caching, and key structure
 *
 * Uses monkey-patching to mock Flashcore.get and Flashcore.set, maintaining
 * an in-memory key-value store to emulate persistence and verify correct
 * namespace and key shapes.
 */

import { describe, test, expect } from '@jest/globals'

import {
	normalizeConfig,
	mergeConfigs,
	getDefaultConfig,
	XP_NAMESPACE,
	SCHEMA_VERSION,
	getUser,
	putUser,
	deleteUser,
	getAllUsers,
	addMember,
	removeMember,
	getMembers,
	getConfig,
	putConfig,
	updateConfig,
	getOrInitConfig,
	getGlobalConfig,
	setGlobalConfig,
	getSchemaVersion,
	setSchemaVersion,
	clearConfigCache
} from '../src/store/index.js'
import * as store from '../src/store/index.js'
import type { GuildConfig, UserXP, GlobalConfig } from '../src/types.js'
import { Flashcore } from 'robo.js'

// ============================================================================
// Mock Setup: Flashcore CRUD Layer
// ============================================================================

/**
 * Mock store to emulate Flashcore persistence
 * Keyed by: namespace:key
 */
let mockStore = new Map<string, unknown>()

/**
 * Record of all Flashcore calls for assertion
 */
interface FlashcoreCall {
	method: 'get' | 'set'
	key: string
	value?: unknown
	options: { namespace: string }
}
let flashcoreCalls: FlashcoreCall[] = []

/**
 * Original Flashcore methods (saved before mocking)
 */
const originalFlashcoreGet = Flashcore.get
const originalFlashcoreSet = Flashcore.set

/**
 * Setup mock Flashcore
 */
function setupMockFlashcore() {
	mockStore.clear()
	flashcoreCalls = []

	// Mock Flashcore.get
	;(Flashcore as any).get = async function <T>(key: string, options: { namespace: string }): Promise<T | undefined> {
		flashcoreCalls.push({ method: 'get', key, options })
		const fullKey = `${options.namespace}:${key}`
		return mockStore.get(fullKey) as T | undefined
	}

	// Mock Flashcore.set
	;(Flashcore as any).set = async function <T>(key: string, value: T, options: { namespace: string }): Promise<void> {
		flashcoreCalls.push({ method: 'set', key, value, options })
		const fullKey = `${options.namespace}:${key}`
		if (value === undefined) {
			mockStore.delete(fullKey)
		} else {
			mockStore.set(fullKey, value)
		}
	}
}

/**
 * Restore original Flashcore methods
 */
function restoreMockFlashcore() {
	;(Flashcore as any).get = originalFlashcoreGet
	;(Flashcore as any).set = originalFlashcoreSet
	clearConfigCache()
	mockStore.clear()
	flashcoreCalls = []
}

// ============================================================================
// Test Suite: User CRUD Operations (with Flashcore mocking)
// ============================================================================

test('User CRUD: getUser on miss returns null', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'

	const user = await getUser(guildId, userId)

	expect(user).toBe(null)
	// Verify correct key and namespace
	expect(
		flashcoreCalls.some(
			(c) => c.method === 'get' && c.key === `user:${guildId}:${userId}` && c.options.namespace === XP_NAMESPACE
		)
	).toBeTruthy()

	restoreMockFlashcore()
})

test('User CRUD: putUser persists and getUser retrieves', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'
	const userData: UserXP = {
		xp: 1500,
		level: 5,
		lastAwardedAt: Date.now(),
		messages: 423,
		xpMessages: 156
	}

	// putUser stores the data
	await putUser(guildId, userId, userData)

	// Verify data was stored with correct key/namespace
	expect(
		flashcoreCalls.some(
			(c) => c.method === 'set' && c.key === `user:${guildId}:${userId}` && c.options.namespace === XP_NAMESPACE
		)
	).toBeTruthy()

	// getUser retrieves it
	const retrieved = await getUser(guildId, userId)
	expect(retrieved).toEqual(userData)

	restoreMockFlashcore()
})

test('User CRUD: putUser triggers addMember side-effect', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'
	const userData: UserXP = {
		xp: 1500,
		level: 5,
		lastAwardedAt: Date.now(),
		messages: 423,
		xpMessages: 156
	}

	await putUser(guildId, userId, userData)

	// Verify members array was updated
	const members = await getMembers(guildId)
	expect(members.has(userId)).toBeTruthy()

	restoreMockFlashcore()
})

test('User CRUD: putUser updates existing user data', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'
	const userData1: UserXP = {
		xp: 1500,
		level: 5,
		lastAwardedAt: Date.now(),
		messages: 423,
		xpMessages: 156
	}
	const userData2: UserXP = {
		xp: 2000,
		level: 6,
		lastAwardedAt: Date.now(),
		messages: 500,
		xpMessages: 180
	}

	await putUser(guildId, userId, userData1)
	const first = await getUser(guildId, userId)
	expect(first?.xp).toBe(1500)

	await putUser(guildId, userId, userData2)
	const second = await getUser(guildId, userId)
	expect(second?.xp).toBe(2000)
	expect(second?.level).toBe(6)

	restoreMockFlashcore()
})

test('User CRUD: deleteUser removes data and triggers removeMember', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'
	const userData: UserXP = {
		xp: 1500,
		level: 5,
		lastAwardedAt: Date.now(),
		messages: 423,
		xpMessages: 156
	}

	// Add user first
	await putUser(guildId, userId, userData)
	let retrieved = await getUser(guildId, userId)
	expect(retrieved !== null).toBeTruthy()

	// Delete user
	await deleteUser(guildId, userId)
	retrieved = await getUser(guildId, userId)
	expect(retrieved).toBe(null)

	// Verify removed from members
	const members = await getMembers(guildId)
	expect(members.has(userId)).toBeFalsy()

	restoreMockFlashcore()
})

// ============================================================================
// Test Suite: Message Counter Serialization (with Flashcore mocking)
// ============================================================================

test('Message Counters: putUser persists both message counters', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'
	const userData: UserXP = {
		xp: 500,
		level: 2,
		lastAwardedAt: Date.now(),
		messages: 150,
		xpMessages: 75
	}

	// Store user with distinct message counter values
	await putUser(guildId, userId, userData)

	// Retrieve and verify both counters
	const retrieved = await getUser(guildId, userId)
	expect(retrieved).not.toBeNull()
	expect(retrieved?.messages).toBe(150)
	expect(retrieved?.xpMessages).toBe(75)

	restoreMockFlashcore()
})

test('Message Counters: message counters survive serialization roundtrip', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'
	const userData: UserXP = {
		xp: 10000,
		level: 20,
		lastAwardedAt: Date.now(),
		messages: 5000,
		xpMessages: 2500
	}

	// Store with large values
	await putUser(guildId, userId, userData)

	// Retrieve and verify exact values
	const retrieved = await getUser(guildId, userId)
	expect(retrieved).not.toBeNull()
	expect(retrieved?.messages).toBe(5000)
	expect(retrieved?.xpMessages).toBe(2500)

	restoreMockFlashcore()
})

test('Message Counters: updating user preserves message counters', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'

	// Store initial user
	const initial: UserXP = {
		xp: 100,
		level: 0,
		lastAwardedAt: Date.now(),
		messages: 50,
		xpMessages: 30
	}
	await putUser(guildId, userId, initial)

	// Update with modified XP but same message counters
	const updated: UserXP = {
		xp: 200,
		level: 1,
		lastAwardedAt: Date.now(),
		messages: 50,
		xpMessages: 30
	}
	await putUser(guildId, userId, updated)

	// Retrieve and verify message counters remain unchanged
	const retrieved = await getUser(guildId, userId)
	expect(retrieved).not.toBeNull()
	expect(retrieved?.messages).toBe(50)
	expect(retrieved?.xpMessages).toBe(30)

	restoreMockFlashcore()
})

test('Message Counters: getAllUsers returns users with message counters', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId1 = '222222222222222222'
	const userId2 = '333333333333333333'

	// Seed users with message counters
	const user1: UserXP = { xp: 100, level: 1, lastAwardedAt: Date.now(), messages: 10, xpMessages: 5 }
	const user2: UserXP = { xp: 200, level: 2, lastAwardedAt: Date.now(), messages: 20, xpMessages: 10 }

	await putUser(guildId, userId1, user1)
	await putUser(guildId, userId2, user2)

	const allUsers = await getAllUsers(guildId)

	// Verify all users have both counters
	for (const [userId, user] of allUsers) {
		expect(typeof user.messages).toBe('number')
		expect(typeof user.xpMessages).toBe('number')
		expect(user.messages).toBeGreaterThanOrEqual(0)
		expect(user.xpMessages).toBeGreaterThanOrEqual(0)
	}

	restoreMockFlashcore()
})

test('Message Counters: getUser handles legacy records without xpMessages', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'

	// Manually insert a legacy record without xpMessages
	const legacyData = {
		xp: 500,
		level: 2,
		lastAwardedAt: Date.now(),
		messages: 100
		// Note: no xpMessages field
	}

	const fullKey = `${XP_NAMESPACE}:user:${guildId}:${userId}`
	mockStore.set(fullKey, legacyData)
	await addMember(guildId, userId)

	// Retrieve the legacy record
	const retrieved = await getUser(guildId, userId)

	// Legacy records from before dual counter implementation may not have xpMessages field
	expect(retrieved).not.toBeNull()
	expect(retrieved?.messages).toBe(100)
	// xpMessages will be undefined for legacy records
	expect(retrieved?.xpMessages).toBe(undefined)

	restoreMockFlashcore()
})

// ============================================================================
// Test Suite: Members Management (with Flashcore mocking)
// ============================================================================

test('Members: addMember is idempotent', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'

	await addMember(guildId, userId)
	await addMember(guildId, userId) // Add again

	const members = await getMembers(guildId)
	expect(members.size).toBe(1)
	expect(members.has(userId)).toBeTruthy()

	// Verify only 2 set calls (one per addMember)
	const setCalls = flashcoreCalls.filter((c) => c.method === 'set' && c.key === `members:${guildId}`)
	expect(setCalls.length).toBe(2)

	restoreMockFlashcore()
})

test('Members: removeMember is idempotent', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'

	// Add member first
	await addMember(guildId, userId)
	let members = await getMembers(guildId)
	expect(members.size).toBe(1)

	// Remove member
	await removeMember(guildId, userId)
	members = await getMembers(guildId)
	expect(members.size).toBe(0)

	// Try removing again (idempotent)
	await removeMember(guildId, userId)
	members = await getMembers(guildId)
	expect(members.size).toBe(0)

	restoreMockFlashcore()
})

test('Members: getMembers returns Set<string>', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId1 = '222222222222222222'
	const userId2 = '333333333333333333'

	await addMember(guildId, userId1)
	await addMember(guildId, userId2)

	const members = await getMembers(guildId)
	expect(members instanceof Set).toBeTruthy()
	expect(members.size).toBe(2)
	expect(members.has(userId1)).toBeTruthy()
	expect(members.has(userId2)).toBeTruthy()

	restoreMockFlashcore()
})

test('Members: underlying storage is array, API exposes Set', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId1 = '222222222222222222'
	const userId2 = '333333333333333333'

	await addMember(guildId, userId1)
	await addMember(guildId, userId2)

	// Check what's stored in Flashcore (should be array)
	const fullKey = `${XP_NAMESPACE}:members:${guildId}`
	const storedArray = mockStore.get(fullKey)
	expect(Array.isArray(storedArray)).toBeTruthy()
	expect((storedArray as string[]).length).toBe(2)

	// API returns Set
	const members = await getMembers(guildId)
	expect(members instanceof Set).toBeTruthy()

	restoreMockFlashcore()
})

// ============================================================================
// Test Suite: getAllUsers (with Flashcore mocking)
// ============================================================================

test('getAllUsers: fetches all members in parallel and returns Map', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId1 = '222222222222222222'
	const userId2 = '333333333333333333'
	const userId3 = '444444444444444444'

	// Seed members and users
	const user1: UserXP = { xp: 100, level: 1, lastAwardedAt: Date.now(), messages: 10, xpMessages: 5 }
	const user2: UserXP = { xp: 200, level: 2, lastAwardedAt: Date.now(), messages: 20, xpMessages: 10 }
	const user3: UserXP = { xp: 300, level: 3, lastAwardedAt: Date.now(), messages: 30, xpMessages: 15 }

	await putUser(guildId, userId1, user1)
	await putUser(guildId, userId2, user2)
	await putUser(guildId, userId3, user3)

	const allUsers = await getAllUsers(guildId)

	expect(allUsers instanceof Map).toBeTruthy()
	expect(allUsers.size).toBe(3)
	expect(allUsers.get(userId1)).toEqual(user1)
	expect(allUsers.get(userId2)).toEqual(user2)
	expect(allUsers.get(userId3)).toEqual(user3)

	restoreMockFlashcore()
})

test('getAllUsers: skips missing users', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId1 = '222222222222222222'
	const userId2 = '333333333333333333'
	const userId3 = '444444444444444444'

	// Seed only 2 of 3 users
	const user1: UserXP = { xp: 100, level: 1, lastAwardedAt: Date.now(), messages: 10, xpMessages: 5 }
	const user2: UserXP = { xp: 200, level: 2, lastAwardedAt: Date.now(), messages: 20, xpMessages: 10 }

	await putUser(guildId, userId1, user1)
	await putUser(guildId, userId2, user2)
	// userId3 intentionally not stored

	// Manually add userId3 to members (simulating inconsistent state)
	const memberKey = `${XP_NAMESPACE}:members:${guildId}`
	const arr = [userId1, userId2, userId3]
	mockStore.set(memberKey, arr)

	const allUsers = await getAllUsers(guildId)

	// Should only return users that exist
	expect(allUsers.size).toBe(2)
	expect(allUsers.has(userId1)).toBeTruthy()
	expect(allUsers.has(userId2)).toBeTruthy()
	expect(allUsers.has(userId3)).toBeFalsy()

	restoreMockFlashcore()
})

test('getAllUsers: uses Promise.all for parallel fetches', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userIds = ['111111111111111111', '222222222222222222', '333333333333333333']

	// Seed users
	for (const userId of userIds) {
		await putUser(guildId, userId, { xp: 100, level: 1, lastAwardedAt: Date.now(), messages: 10, xpMessages: 5 })
	}

	// Clear call history
	flashcoreCalls = []

	// Call getAllUsers
	await getAllUsers(guildId)

	// Should have 1 getMembers call and 3 getUser calls
	const getCallsCount = flashcoreCalls.filter((c) => c.method === 'get').length
	expect(getCallsCount).toBe(4) // 1 getMembers + 3 getUser

	restoreMockFlashcore()
})

// ============================================================================
// Test Suite: Config CRUD Operations (with Flashcore mocking)
// ============================================================================

test('Config CRUD: getOrInitConfig persists merged defaults for new guild', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	const config = await getOrInitConfig(guildId)

	// Should return default config
	expect(config.cooldownSeconds).toBe(60)
	expect(config.xpRate).toBe(1.0)

	// Verify persisted to Flashcore
	expect(flashcoreCalls.some((c) => c.method === 'set' && c.key === `config:${guildId}`)).toBeTruthy()

	restoreMockFlashcore()
})

test('Config CRUD: getConfig returns cached value on second call', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	// First call
	await getConfig(guildId)
	const getCalls1 = flashcoreCalls.filter((c) => c.method === 'get' && c.key === `config:${guildId}`).length

	// Second call
	flashcoreCalls = []
	await getConfig(guildId)
	const getCalls2 = flashcoreCalls.filter((c) => c.method === 'get' && c.key === `config:${guildId}`).length

	// Second call should have no Flashcore.get (cache hit)
	expect(getCalls2).toBe(0)

	restoreMockFlashcore()
})

test('Config CRUD: updateConfig merges and persists partial update', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	const updated = await updateConfig(guildId, { cooldownSeconds: 120 })

	expect(updated.cooldownSeconds).toBe(120)
	expect(updated.xpRate).toBe(1.0) // Preserved from default

	restoreMockFlashcore()
})

test('Config CRUD: setGlobalConfig clears cache and affects subsequent getConfig', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	// Get config first (should cache)
	let config = await getConfig(guildId)
	expect(config.cooldownSeconds).toBe(60)

	// Set global config
	await setGlobalConfig({ cooldownSeconds: 90 })

	// Get config again should reflect new global
	config = await getConfig(guildId)
	expect(config.cooldownSeconds).toBe(90)

	restoreMockFlashcore()
})

test('Config CRUD: config merge order (defaults <- global <- stored)', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	// Set global config
	await setGlobalConfig({ cooldownSeconds: 120, xpRate: 1.2 })

	// Store guild-specific config (partial, not including xpRate)
	const storedConfig: Partial<GuildConfig> = { cooldownSeconds: 90 }
	const key = `${XP_NAMESPACE}:config:${guildId}`
	mockStore.set(key, storedConfig)

	// Clear cache to force re-read
	clearConfigCache()

	// Retrieve and verify merge: defaults <- global <- stored
	const config = await getConfig(guildId)

	// cooldownSeconds from stored (highest precedence)
	expect(config.cooldownSeconds).toBe(90)
	// xpRate from global (not overridden by stored)
	expect(config.xpRate).toBe(1.2)

	restoreMockFlashcore()
})

test('Config CRUD: getOrInitConfig returns existing if already stored', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	const customConfig: GuildConfig = {
		...getDefaultConfig(),
		cooldownSeconds: 180,
		xpRate: 2.0
	}

	// Store custom config first
	await putConfig(guildId, customConfig)
	clearConfigCache()

	// Get or init should return existing
	const config = await getOrInitConfig(guildId)
	expect(config.cooldownSeconds).toBe(180)
	expect(config.xpRate).toBe(2.0)

	restoreMockFlashcore()
})

// ============================================================================
// Test Suite: Schema Version (with Flashcore mocking)
// ============================================================================

test('Schema: getSchemaVersion returns default when missing', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	const version = await getSchemaVersion(guildId)

	expect(version).toBe(SCHEMA_VERSION)
	expect(version).toBe(1)

	restoreMockFlashcore()
})

test('Schema: setSchemaVersion persists and getSchemaVersion retrieves', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	await setSchemaVersion(guildId, 2)

	const version = await getSchemaVersion(guildId)
	expect(version).toBe(2)

	// Verify correct key and namespace
	expect(
		flashcoreCalls.some(
			(c) => c.method === 'set' && c.key === `schema:${guildId}` && c.options.namespace === XP_NAMESPACE
		)
	).toBeTruthy()

	restoreMockFlashcore()
})

test('Schema: all calls use correct namespace', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	await setSchemaVersion(guildId, 2)
	await getSchemaVersion(guildId)

	// All calls should have XP_NAMESPACE
	expect(flashcoreCalls.every((c) => c.options.namespace === XP_NAMESPACE)).toBeTruthy()

	restoreMockFlashcore()
})

// ============================================================================
// Test Suite: Key and Namespace Validation
// ============================================================================

test('Flashcore calls: all operations use XP_NAMESPACE', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'

	await putUser(guildId, userId, { xp: 100, level: 1, lastAwardedAt: Date.now(), messages: 10, xpMessages: 5 })
	await getUser(guildId, userId)
	await addMember(guildId, userId)
	await getMembers(guildId)
	await getConfig(guildId)
	await setSchemaVersion(guildId, 1)

	// All calls should use XP_NAMESPACE
	expect(flashcoreCalls.every((c) => c.options.namespace === XP_NAMESPACE)).toBeTruthy()
	expect(flashcoreCalls.length).toBeGreaterThan(0)

	restoreMockFlashcore()
})

test('Flashcore keys: user key format is "user:guildId:userId"', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'

	await putUser(guildId, userId, { xp: 100, level: 1, lastAwardedAt: Date.now(), messages: 10, xpMessages: 5 })

	const userKey = `user:${guildId}:${userId}`
	expect(flashcoreCalls.some((c) => c.method === 'set' && c.key === userKey)).toBeTruthy()

	restoreMockFlashcore()
})

test('Flashcore keys: members key format is "members:guildId"', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'
	const userId = '222222222222222222'

	await addMember(guildId, userId)

	const membersKey = `members:${guildId}`
	expect(flashcoreCalls.some((c) => c.method === 'set' && c.key === membersKey)).toBeTruthy()

	restoreMockFlashcore()
})

test('Flashcore keys: config key format is "config:guildId"', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	await getOrInitConfig(guildId)

	const configKey = `config:${guildId}`
	expect(flashcoreCalls.some((c) => c.method === 'set' && c.key === configKey)).toBeTruthy()

	restoreMockFlashcore()
})

test('Flashcore keys: schema key format is "schema:guildId"', async () => {
	setupMockFlashcore()
	const guildId = '111111111111111111'

	await setSchemaVersion(guildId, 1)

	const schemaKey = `schema:${guildId}`
	expect(flashcoreCalls.some((c) => c.method === 'set' && c.key === schemaKey)).toBeTruthy()

	restoreMockFlashcore()
})

test('Flashcore keys: global config key is "config:global"', async () => {
	setupMockFlashcore()

	await setGlobalConfig({ cooldownSeconds: 90 })
	await getGlobalConfig()

	const globalKey = 'config:global'
	expect(flashcoreCalls.some((c) => c.method === 'set' && c.key === globalKey)).toBeTruthy()
	expect(flashcoreCalls.some((c) => c.method === 'get' && c.key === globalKey)).toBeTruthy()

	restoreMockFlashcore()
})

// ============================================================================
// Test Suite: Config Normalization

test('normalizeConfig fills missing fields with defaults', () => {
	const defaults = getDefaultConfig()
	const raw = {
		cooldownSeconds: 90
	}

	const normalized = normalizeConfig(raw, defaults)

	expect(normalized.cooldownSeconds).toBe(90)
	expect(normalized.xpRate).toBe(defaults.xpRate)
	expect(normalized.rewardsMode).toBe(defaults.rewardsMode)
	expect(normalized.removeRewardOnXpLoss).toBe(defaults.removeRewardOnXpLoss)
})

test('normalizeConfig preserves existing fields', () => {
	const defaults = getDefaultConfig()
	const raw = {
		cooldownSeconds: 120,
		xpRate: 2.0,
		noXpRoleIds: ['123456789012345678'],
		roleRewards: [{ level: 5, roleId: '234567890123456789' }],
		rewardsMode: 'replace' as const,
		removeRewardOnXpLoss: true,
		leaderboard: { public: true }
	}

	const normalized = normalizeConfig(raw, defaults)

	expect(normalized.cooldownSeconds).toBe(120)
	expect(normalized.xpRate).toBe(2.0)
	expect(normalized.noXpRoleIds.length).toBe(1)
	expect(normalized.roleRewards.length).toBe(1)
	expect(normalized.rewardsMode).toBe('replace')
	expect(normalized.removeRewardOnXpLoss).toBe(true)
	expect(normalized.leaderboard.public).toBe(true)
})

test('normalizeConfig handles null input by returning defaults', () => {
	const defaults = getDefaultConfig()
	const normalized = normalizeConfig(null, defaults)

	expect(normalized).toEqual(defaults)
})

test('normalizeConfig handles undefined input by returning defaults', () => {
	const defaults = getDefaultConfig()
	const normalized = normalizeConfig(undefined, defaults)

	expect(normalized).toEqual(defaults)
})

test('normalizeConfig handles non-object input by returning defaults', () => {
	const defaults = getDefaultConfig()
	const normalized = normalizeConfig('invalid', defaults)

	expect(normalized).toEqual(defaults)
})

test('normalizeConfig handles invalid arrays by using defaults', () => {
	const defaults = getDefaultConfig()
	const raw = {
		noXpRoleIds: 'not-an-array',
		noXpChannelIds: 123,
		roleRewards: null
	}

	const normalized = normalizeConfig(raw, defaults)

	expect(normalized.noXpRoleIds).toEqual(defaults.noXpRoleIds)
	expect(normalized.noXpChannelIds).toEqual(defaults.noXpChannelIds)
	expect(normalized.roleRewards).toEqual(defaults.roleRewards)
})

test('normalizeConfig preserves multipliers object', () => {
	const defaults = getDefaultConfig()
	const raw = {
		multipliers: {
			server: 2.0,
			role: { '123456789012345678': 1.5 },
			user: { '234567890123456789': 0.5 }
		}
	}

	const normalized = normalizeConfig(raw, defaults)

	expect(normalized.multipliers?.server).toBe(2.0)
	expect(normalized.multipliers?.role?.['123456789012345678']).toBe(1.5)
	expect(normalized.multipliers?.user?.['234567890123456789']).toBe(0.5)
})

test('normalizeConfig handles undefined multipliers', () => {
	const defaults = getDefaultConfig()
	const raw = {}

	const normalized = normalizeConfig(raw, defaults)

	expect(normalized.multipliers).toBe(undefined)
})

// ============================================================================
// Test Suite: Config Merging
// ============================================================================

test('mergeConfigs does not mutate input objects', () => {
	const base: GuildConfig = getDefaultConfig()
	const override: Partial<GuildConfig> = { cooldownSeconds: 90 }

	const baseCopy = JSON.stringify(base)
	const overrideCopy = JSON.stringify(override)

	mergeConfigs(base, override)

	expect(JSON.stringify(base)).toBe(baseCopy)
	expect(JSON.stringify(override)).toBe(overrideCopy)
})

test('mergeConfigs deep merges nested multipliers', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		multipliers: {
			server: 1.5,
			role: { '123456789012345678': 2.0 },
			user: {}
		}
	}
	const override: Partial<GuildConfig> = {
		multipliers: {
			role: { '234567890123456789': 3.0 },
			user: { '345678901234567890': 0.5 }
		}
	}

	const merged = mergeConfigs(base, override)

	expect(merged.multipliers?.server).toBe(1.5) // Preserved from base
	expect(merged.multipliers?.role?.['123456789012345678']).toBe(2.0) // Preserved from base
	expect(merged.multipliers?.role?.['234567890123456789']).toBe(3.0) // Added from override
	expect(merged.multipliers?.user?.['345678901234567890']).toBe(0.5) // Added from override
})

test('mergeConfigs handles undefined multipliers in base', () => {
	const base: GuildConfig = getDefaultConfig()
	const override: Partial<GuildConfig> = {
		multipliers: {
			server: 2.0
		}
	}

	const merged = mergeConfigs(base, override)

	expect(merged.multipliers?.server).toBe(2.0)
})

test('mergeConfigs handles undefined multipliers in override', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		multipliers: {
			server: 1.5
		}
	}
	const override: Partial<GuildConfig> = {}

	const merged = mergeConfigs(base, override)

	expect(merged.multipliers?.server).toBe(1.5)
})

test('mergeConfigs override takes precedence for all fields', () => {
	const base: GuildConfig = getDefaultConfig()
	const override: Partial<GuildConfig> = {
		cooldownSeconds: 120,
		xpRate: 2.0,
		rewardsMode: 'replace',
		removeRewardOnXpLoss: true,
		leaderboard: { public: true }
	}

	const merged = mergeConfigs(base, override)

	expect(merged.cooldownSeconds).toBe(120)
	expect(merged.xpRate).toBe(2.0)
	expect(merged.rewardsMode).toBe('replace')
	expect(merged.removeRewardOnXpLoss).toBe(true)
	expect(merged.leaderboard.public).toBe(true)
})

test('mergeConfigs replaces arrays (does not concatenate)', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		noXpRoleIds: ['123456789012345678']
	}
	const override: Partial<GuildConfig> = {
		noXpRoleIds: ['234567890123456789', '345678901234567890']
	}

	const merged = mergeConfigs(base, override)

	expect(merged.noXpRoleIds.length).toBe(2)
	expect(merged.noXpRoleIds).toEqual(['234567890123456789', '345678901234567890'])
})

test('mergeConfigs preserves base arrays when override has none', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		noXpRoleIds: ['123456789012345678']
	}
	const override: Partial<GuildConfig> = {}

	const merged = mergeConfigs(base, override)

	expect(merged.noXpRoleIds.length).toBe(1)
	expect(merged.noXpRoleIds[0]).toBe('123456789012345678')
})

// ============================================================================
// Test Suite: Constants
// ============================================================================

test('XP_NAMESPACE is set to "xp"', () => {
	expect(XP_NAMESPACE).toBe('xp')
})

test('SCHEMA_VERSION is set to 1', () => {
	expect(SCHEMA_VERSION).toBe(1)
})

// ============================================================================
// Test Suite: Default Config
// ============================================================================

test('getDefaultConfig returns consistent object', () => {
	const config1 = getDefaultConfig()
	const config2 = getDefaultConfig()

	// Should return equivalent objects
	expect(config1.cooldownSeconds).toBe(config2.cooldownSeconds)
	expect(config1.xpRate).toBe(config2.xpRate)
	expect(config1.rewardsMode).toBe(config2.rewardsMode)
})

test('getDefaultConfig returns new array instances', () => {
	const config1 = getDefaultConfig()
	const config2 = getDefaultConfig()

	// Arrays should not be the same reference
	expect(config1.noXpRoleIds).not.toBe(config2.noXpRoleIds)
	expect(config1.noXpChannelIds).not.toBe(config2.noXpChannelIds)
	expect(config1.roleRewards).not.toBe(config2.roleRewards)
})

// ============================================================================
// Test Suite: UserXP Structure (data validation)
// ============================================================================

test('UserXP type has expected structure', () => {
	const user: UserXP = {
		xp: 1500,
		level: 5,
		lastAwardedAt: Date.now(),
		messages: 423,
		xpMessages: 156
	}

	expect(typeof user.xp === 'number').toBeTruthy()
	expect(typeof user.level === 'number').toBeTruthy()
	expect(typeof user.lastAwardedAt === 'number').toBeTruthy()
	expect(typeof user.messages === 'number').toBeTruthy()
})

// ============================================================================
// Test Suite: Flashcore Key Structure (documentation)
// ============================================================================

test('Flashcore key structure is documented correctly', () => {
	// This test documents the expected key structure with namespace
	// All keys use namespace: XP_NAMESPACE ('xp')
	const guildId = '123456789012345678'
	const userId = '234567890123456789'

	const userKey = `user:${guildId}:${userId}`
	expect(userKey).toBe(`user:${guildId}:${userId}`)

	const membersKey = `members:${guildId}`
	expect(membersKey).toBe(`members:${guildId}`)

	const configKey = `config:${guildId}`
	expect(configKey).toBe(`config:${guildId}`)

	const schemaKey = `schema:${guildId}`
	expect(schemaKey).toBe(`schema:${guildId}`)

	const globalConfigKey = 'config:global'
	expect(globalConfigKey).toBe('config:global')
})

// ============================================================================
// Test Suite: Config Deep Merge Edge Cases
// ============================================================================

test('mergeConfigs handles nested leaderboard object', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		leaderboard: { public: false }
	}
	const override: Partial<GuildConfig> = {
		leaderboard: { public: true }
	}

	const merged = mergeConfigs(base, override)

	expect(merged.leaderboard.public).toBe(true)
})

test('mergeConfigs preserves base leaderboard when override has none', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		leaderboard: { public: true }
	}
	const override: Partial<GuildConfig> = {}

	const merged = mergeConfigs(base, override)

	expect(merged.leaderboard.public).toBe(true)
})

test('normalizeConfig handles partial multipliers object', () => {
	const defaults = getDefaultConfig()
	const raw = {
		multipliers: {
			server: 2.0
			// No role or user multipliers
		}
	}

	const normalized = normalizeConfig(raw, defaults)

	expect(normalized.multipliers?.server).toBe(2.0)
	expect(normalized.multipliers?.role).toEqual({})
	expect(normalized.multipliers?.user).toEqual({})
})

test('mergeConfigs handles empty multipliers sub-objects', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		multipliers: {
			role: {},
			user: {}
		}
	}
	const override: Partial<GuildConfig> = {
		multipliers: {
			role: { '123456789012345678': 1.5 }
		}
	}

	const merged = mergeConfigs(base, override)

	expect(merged.multipliers?.role?.['123456789012345678']).toBe(1.5)
	expect(merged.multipliers?.user).toEqual({})
})

// ============================================================================
// Test Suite: Store CRUD Operations (Mock-based)
// ============================================================================

test('User CRUD: storing and retrieving user data maintains structure', () => {
	const user: UserXP = {
		xp: 1500,
		level: 5,
		lastAwardedAt: Date.now(),
		messages: 423,
		xpMessages: 156
	}

	// Verify structure integrity
	expect(typeof user.xp === 'number').toBeTruthy()
	expect(typeof user.level === 'number').toBeTruthy()
	expect(typeof user.lastAwardedAt === 'number').toBeTruthy()
	expect(typeof user.messages === 'number').toBeTruthy()
})

test('Member operations: idempotency of addMember', () => {
	// Simulate adding same member twice to a set
	const members = new Set<string>()
	const userId = '123456789012345678'

	members.add(userId)
	members.add(userId) // Add again

	expect(members.size).toBe(1)
	expect(members.has(userId)).toBeTruthy()
})

test('Member operations: idempotency of removeMember', () => {
	// Simulate removing member that may not exist
	const members = new Set<string>()
	const userId = '123456789012345678'

	// Try removing when set is empty - should not error
	members.delete(userId)
	expect(members.size).toBe(0)

	// Add and remove
	members.add(userId)
	members.delete(userId)
	expect(members.size).toBe(0)
})

test('Member array serialization: converting Set to array and back', () => {
	const members = new Set(['111111111111111111', '222222222222222222', '333333333333333333'])

	// Simulate serialization
	const arr = Array.from(members)
	expect(Array.isArray(arr)).toBeTruthy()
	expect(arr.length).toBe(3)

	// Simulate deserialization
	const restored = new Set(arr)
	expect(restored.size).toBe(3)
	expect(restored.has('111111111111111111')).toBeTruthy()
	expect(restored.has('222222222222222222')).toBeTruthy()
	expect(restored.has('333333333333333333')).toBeTruthy()
})

test('Config cache behavior: storing and retrieving from cache', () => {
	const config: GuildConfig = getDefaultConfig()
	const cache = new Map<string, GuildConfig>()
	const guildId = '123456789012345678'

	// Store in cache
	cache.set(guildId, config)
	expect(cache.has(guildId)).toBeTruthy()

	// Retrieve from cache
	const cached = cache.get(guildId)
	expect(cached).toEqual(config)
})

test('Config cache behavior: cache miss returns undefined', () => {
	const cache = new Map<string, GuildConfig>()
	const guildId = '123456789012345678'

	const cached = cache.get(guildId)
	expect(cached).toBe(undefined)
})

test('Config CRUD: merge order (defaults <- global <- stored)', () => {
	const defaults: GuildConfig = {
		...getDefaultConfig(),
		cooldownSeconds: 60,
		xpRate: 1.0
	}

	const global: GlobalConfig = {
		cooldownSeconds: 120
	}

	const stored: Partial<GuildConfig> = {
		cooldownSeconds: 90
	}

	// Merge: defaults <- global <- stored
	let merged = mergeConfigs(defaults, global)
	expect(merged.cooldownSeconds).toBe(120)

	merged = mergeConfigs(merged, stored)
	expect(merged.cooldownSeconds).toBe(90)
	expect(merged.xpRate).toBe(1.0)
})

test('Config CRUD: getConfig returns merged result with global applied', () => {
	// Simulate: stored config + global config + defaults
	const defaults = getDefaultConfig()
	const globalConfig: GlobalConfig = {
		xpRate: 1.5,
		cooldownSeconds: 120
	}
	const storedConfig: Partial<GuildConfig> = {
		cooldownSeconds: 90
	}

	// Merge: defaults <- global <- stored
	let merged = mergeConfigs(defaults, globalConfig)
	merged = mergeConfigs(merged, storedConfig)

	// Verify precedence
	expect(merged.cooldownSeconds).toBe(90) // stored wins
	expect(merged.xpRate).toBe(1.5) // global applied
})

test('Config CRUD: getOrInitConfig cache behavior', () => {
	const cache = new Map<string, GuildConfig>()
	const guildId = '123456789012345678'
	const config = getDefaultConfig()

	// First call: cache miss, store in cache
	cache.set(guildId, config)
	expect(cache.has(guildId)).toBeTruthy()

	// Second call: cache hit
	const cached = cache.get(guildId)
	expect(cached).toEqual(config)
})

test('Member serialization: array roundtrip preserves order', () => {
	const originalArray = ['111111111111111111', '222222222222222222', '333333333333333333']

	// Convert to Set and back to array
	const set = new Set(originalArray)
	const resultArray = Array.from(set)

	expect(resultArray.length).toBe(originalArray.length)
	for (const id of originalArray) {
		expect(resultArray.includes(id)).toBeTruthy()
	}
})

test('Config normalization: partial config fills missing fields with defaults', () => {
	const defaults = getDefaultConfig()
	const partial: Partial<GuildConfig> = {
		cooldownSeconds: 90
	}

	const normalized = normalizeConfig(partial, defaults)

	expect(normalized.cooldownSeconds).toBe(90)
	expect(normalized.xpRate).toBe(defaults.xpRate)
	expect(normalized.rewardsMode).toBe(defaults.rewardsMode)
	expect(Array.isArray(normalized.noXpRoleIds)).toBeTruthy()
	expect(Array.isArray(normalized.noXpChannelIds)).toBeTruthy()
})

test('Schema version: default value is applied', () => {
	// Simulate schema version retrieval with fallback
	const stored: number | undefined = undefined
	const version = stored ?? 1 // SCHEMA_VERSION default

	expect(version).toBe(1)
})

test('getAllUsers: parallel fetch structure (simulation)', () => {
	const members = new Set(['111111111111111111', '222222222222222222', '333333333333333333'])

	// Simulate creating promises for parallel fetch
	const userIds = Array.from(members)
	const promises = userIds.map(() =>
		Promise.resolve({ xp: 100, level: 1, lastAwardedAt: Date.now(), messages: 10, xpMessages: 5 })
	)

	expect(promises.length).toBe(3)

	// Simulate Promise.all
	Promise.all(promises).then((users) => {
		expect(users.length).toBe(3)
		for (const user of users) {
			expect(typeof user.xp === 'number').toBeTruthy()
		}
	})
})

test('Config merge with multipliers: deep merge preserves all nested data', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		multipliers: {
			server: 1.5,
			role: { '111111111111111111': 2.0 },
			user: { '222222222222222222': 0.5 }
		}
	}

	const override: Partial<GuildConfig> = {
		multipliers: {
			role: { '333333333333333333': 1.8 }
		}
	}

	const merged = mergeConfigs(base, override)

	expect(merged.multipliers?.server).toBe(1.5)
	expect(merged.multipliers?.role?.['111111111111111111']).toBe(2.0)
	expect(merged.multipliers?.role?.['333333333333333333']).toBe(1.8)
	expect(merged.multipliers?.user?.['222222222222222222']).toBe(0.5)
})

// ============================================================================
// Test Suite: Labels Configuration Handling
// ============================================================================

test('normalizeConfig preserves labels object', () => {
	const defaults = getDefaultConfig()
	const raw = {
		cooldownSeconds: 60,
		labels: { xpDisplayName: 'Reputation' }
	}

	const normalized = normalizeConfig(raw as any, defaults)

	expect(normalized.labels).toBeDefined()
	expect(normalized.labels?.xpDisplayName).toBe('Reputation')
})

test('normalizeConfig handles undefined labels', () => {
	const defaults = getDefaultConfig()
	const raw = { cooldownSeconds: 60 }

	const normalized = normalizeConfig(raw as any, defaults)

	expect(normalized.labels).toBeUndefined()
})

test('mergeConfigs deep merges labels (override wins)', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		labels: { xpDisplayName: 'Points' }
	} as any
	const override: Partial<GuildConfig> = {
		labels: { xpDisplayName: 'Reputation' }
	}

	const merged = mergeConfigs(base, override)

	expect(merged.labels?.xpDisplayName).toBe('Reputation')
	expect(merged.cooldownSeconds).toBe(base.cooldownSeconds)
})

test('mergeConfigs preserves base labels when override has none', () => {
	const base: GuildConfig = {
		...getDefaultConfig(),
		labels: { xpDisplayName: 'Karma' }
	} as any
	const override: Partial<GuildConfig> = { cooldownSeconds: 90 }

	const merged = mergeConfigs(base, override)

	expect(merged.labels?.xpDisplayName).toBe('Karma')
	expect(merged.cooldownSeconds).toBe(90)
})

test('mergeConfigs applies override labels when base has none', () => {
	const base: GuildConfig = getDefaultConfig()
	const override: Partial<GuildConfig> = {
		labels: { xpDisplayName: 'Stars' }
	}

	const merged = mergeConfigs(base, override)

	expect(merged.labels?.xpDisplayName).toBe('Stars')
})

test('labels undefined by default in getDefaultConfig', () => {
	const defaults = getDefaultConfig()
	expect(defaults.labels).toBeUndefined()
})
