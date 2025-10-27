/**
 * Message Award Handler Tests
 *
 * Tests the message award handler to verify dual message counter behavior
 * and gating logic (cooldown, No-XP channels, No-XP roles).
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import type { Message, Guild, GuildMember, User, TextChannel, Collection } from 'discord.js'
import type { UserXP, GuildConfig } from '../src/types.js'
import { setupTestEnvironment, cleanupTestEnvironment } from './helpers/test-utils.js'
import { mockFlashcore } from './helpers/mocks.js'

// ============================================================================
// Mock Setup
// ============================================================================

/**
 * Current guild configuration - exported so mock can access it
 */
export let currentConfig: GuildConfig = {
	cooldownSeconds: 60,
	xpRate: 1.0,
	noXpRoleIds: [],
	noXpChannelIds: [],
	roleRewards: [],
	rewardsMode: 'stack',
	removeRewardOnXpLoss: false,
	leaderboard: { public: false }
}

/**
 * Track emitted events for assertions
 */
const emittedEvents: Array<{ type: string; payload: any }> = []

/**
 * Random value for deterministic XP calculation
 */
let mockRandomValue = 0.5 // Will generate baseXp = 20 (Math.floor(0.5 * 11) + 15)

// Store config in global for mock access
;(globalThis as any).__testConfig = currentConfig

// Mock the events module
jest.mock('../.robo/build/runtime/events.js', () => ({
	emitLevelUp: (event: any) => {
		emittedEvents.push({ type: 'levelUp', payload: event })
	},
	emitLevelDown: (event: any) => {
		emittedEvents.push({ type: 'levelDown', payload: event })
	},
	emitXPChange: (event: any) => {
		emittedEvents.push({ type: 'xpChange', payload: event })
	}
}))

// Mock Math.random for deterministic XP
jest.spyOn(Math, 'random').mockImplementation(() => mockRandomValue)

// ============================================================================
// Import handler AFTER mocks are registered
// ============================================================================

// Dynamic import to ensure mocks are applied (from built files)
const { default: award } = await import('../.robo/build/events/messageCreate/award.js')

// ============================================================================
// Helper Functions
// ============================================================================

// Import store functions to clear config cache
import * as store from '../.robo/build/store/index.js'

/**
 * Reset state before each test
 */
function resetState() {
	setupTestEnvironment()
	emittedEvents.length = 0
	// Create a FRESH object, not reuse
	currentConfig = {
		cooldownSeconds: 60,
		xpRate: 1.0,
		noXpRoleIds: [],
		noXpChannelIds: [],
		roleRewards: [],
		rewardsMode: 'stack',
		removeRewardOnXpLoss: false,
		leaderboard: { public: false },
		multipliers: undefined
	}
	mockRandomValue = 0.5 // Reset to default (generates baseXp = 20)
	// CRITICAL: Create a fresh copy for global, not a reference
	;(globalThis as any).__testConfig = JSON.parse(JSON.stringify(currentConfig))
	// CRITICAL: Clear config cache so fresh config is loaded from Flashcore mock
	store.clearConfigCache()

	// Monkey-patch Flashcore mock to intercept config requests (AFTER setupTestEnvironment)
	const originalMockImpl = mockFlashcore.get.getMockImplementation()
	mockFlashcore.get.mockImplementation((key: string, options?: any) => {
		// Intercept config requests - handle both string and array namespace
		const namespace = Array.isArray(options?.namespace) ? options.namespace.join(':') : options?.namespace
		if (namespace === 'xp' && key.startsWith('config:')) {
			const testConfig = (globalThis as any).__testConfig
			return JSON.parse(JSON.stringify(testConfig))
		}
		// Pass through to original mock implementation for other keys
		return originalMockImpl ? originalMockImpl(key, options) : undefined
	})
}

// Reset before each test
beforeEach(() => {
	resetState()
})

afterEach(() => {
	cleanupTestEnvironment()
})

/**
 * Helper to get user from Flashcore storage
 */
function getUserFromStore(guildId: string, userId: string): UserXP | null {
	return mockFlashcore.get(`user:${guildId}:${userId}`, { namespace: 'xp' })
}

/**
 * Helper to create a minimal Discord.js Message mock
 */
function createMessage(options: {
	userId: string
	guildId: string
	channelId: string
	roleIds?: string[]
	isBot?: boolean
}): Message {
	const { userId, guildId, channelId, roleIds = [], isBot = false } = options

	// Create role cache (Map-like structure)
	const roleCache = new Map()
	for (const roleId of roleIds) {
		roleCache.set(roleId, { id: roleId })
	}

	const message = {
		author: {
			bot: isBot,
			id: userId
		} as User,
		guild: {
			id: guildId
		} as Guild,
		member: {
			roles: {
				cache: roleCache as Collection<string, any>
			}
		} as GuildMember,
		channel: {
			id: channelId,
			isTextBased: () => true,
			isDMBased: () => false
		} as TextChannel
	} as Message

	return message
}

// ============================================================================
// Test Suite: Message Counter and Gating Logic
// ============================================================================

test('Baseline: valid message increments messages counter in No-XP channel', async () => {
	// Configure to gate XP
	currentConfig.noXpChannelIds = ['test-channel-1']
	currentConfig.xpRate = 1.0
	// CRITICAL: Update global reference with a COPY
	;(globalThis as any).__testConfig = JSON.parse(JSON.stringify(currentConfig))

	const message = createMessage({
		userId: 'user-1',
		guildId: 'guild-1',
		channelId: 'test-channel-1'
	})

	await award(message)

	const user = getUserFromStore('guild-1', 'user-1')
	expect(user).not.toBeNull()
	expect(user?.messages).toBe(1) // messages should increment to 1
	expect(user?.xpMessages).toBe(0) // xpMessages should remain 0 (No-XP channel)
	expect(user?.xp).toBe(0) // XP should remain 0 (No-XP channel)
})

test('Awarded XP path: both counters increment when XP is awarded', async () => {
	// Configure to allow XP awarding
	currentConfig.noXpChannelIds = []
	currentConfig.noXpRoleIds = []
	currentConfig.cooldownSeconds = 0
	currentConfig.xpRate = 1.0
	currentConfig.multipliers = undefined

	const message = createMessage({
		userId: 'user-2',
		guildId: 'guild-2',
		channelId: 'channel-2'
	})

	await award(message)

	const user = getUserFromStore('guild-2', 'user-2')
	expect(user).not.toBeNull()
	expect(user?.messages).toBe(1) // messages should increment to 1
	expect(user?.xpMessages).toBe(1) // xpMessages should increment to 1 (XP awarded)
	expect((user?.xp ?? 0)).toBeGreaterThan(0) // XP should be greater than 0
	expect((user?.lastAwardedAt ?? 0)).toBeGreaterThan(0) // lastAwardedAt should be updated
})

test('Cooldown block: messages increments but xpMessages does not on cooldown', async () => {
	currentConfig.cooldownSeconds = 60
	currentConfig.xpRate = 1.0

	const message = createMessage({
		userId: 'user-3',
		guildId: 'guild-3',
		channelId: 'channel-3'
	})

	// First message awards XP
	await award(message)

	let user = getUserFromStore('guild-3', 'user-3')
	expect(user?.messages).toBe(1) // messages should be 1 after first message
	expect(user?.xpMessages).toBe(1) // xpMessages should be 1 after first message
	const firstXp = user?.xp ?? 0
	expect(firstXp).toBeGreaterThan(0) // XP should be awarded on first message

	// Second message (within cooldown) increments messages but not xpMessages
	await award(message)

	user = getUserFromStore('guild-3', 'user-3')
	expect(user?.messages).toBe(2) // messages should increment to 2
	expect(user?.xpMessages).toBe(1) // xpMessages should remain 1 (cooldown blocked)
	expect(user?.xp).toBe(firstXp) // XP should remain the same (cooldown blocked)
})

test('No-XP channel exclusion: messages increments but xpMessages does not', async () => {
	currentConfig.noXpChannelIds = ['no-xp-channel']
	currentConfig.noXpRoleIds = []
	currentConfig.cooldownSeconds = 0
	;(globalThis as any).__testConfig = JSON.parse(JSON.stringify(currentConfig))

	const message = createMessage({
		userId: 'user-4',
		guildId: 'guild-4',
		channelId: 'no-xp-channel'
	})

	await award(message)

	const user = getUserFromStore('guild-4', 'user-4')
	expect(user).not.toBeNull()
	expect(user?.messages).toBe(1) // messages should increment to 1
	expect(user?.xpMessages).toBe(0) // xpMessages should remain 0 (No-XP channel)
	expect(user?.xp).toBe(0) // XP should remain 0 (No-XP channel)
	expect(user?.lastAwardedAt).toBe(0) // lastAwardedAt should remain 0 (no XP awarded)
})

test('No-XP role exclusion: messages increments but xpMessages does not', async () => {
	currentConfig.noXpChannelIds = []
	currentConfig.noXpRoleIds = ['no-xp-role']
	currentConfig.cooldownSeconds = 0
	;(globalThis as any).__testConfig = JSON.parse(JSON.stringify(currentConfig))

	const message = createMessage({
		userId: 'user-5',
		guildId: 'guild-5',
		channelId: 'channel-5',
		roleIds: ['no-xp-role', 'some-other-role']
	})

	await award(message)

	const user = getUserFromStore('guild-5', 'user-5')
	expect(user).not.toBeNull()
	expect(user?.messages).toBe(1) // messages should increment to 1
	expect(user?.xpMessages).toBe(0) // xpMessages should remain 0 (No-XP role)
	expect(user?.xp).toBe(0) // XP should remain 0 (No-XP role)
	expect(user?.lastAwardedAt).toBe(0) // lastAwardedAt should remain 0 (no XP awarded)
})

test('Multiple messages with cooldown: messages continues incrementing', async () => {
	currentConfig.cooldownSeconds = 60
	currentConfig.xpRate = 1.0

	const message = createMessage({
		userId: 'user-6',
		guildId: 'guild-6',
		channelId: 'channel-6'
	})

	// Send 5 messages
	for (let i = 0; i < 5; i++) {
		await award(message)
	}

	const user = getUserFromStore('guild-6', 'user-6')
	expect(user?.messages).toBe(5) // messages should increment to 5
	expect(user?.xpMessages).toBe(1) // xpMessages should be 1 (only first message awarded XP)
})

test('Bot messages are ignored', async () => {
	const message = createMessage({
		userId: 'bot-user',
		guildId: 'guild-7',
		channelId: 'channel-7',
		isBot: true
	})

	await award(message)

	const user = getUserFromStore('guild-7', 'bot-user')
	// Bot messages should not create user records (returns undefined, not null)
	expect(user).toBeUndefined()
})

test('XP with multipliers: counters still work correctly', async () => {
	currentConfig.cooldownSeconds = 0
	currentConfig.xpRate = 1.5
	currentConfig.multipliers = {
		server: 2.0,
		role: {},
		user: {}
	}

	const message = createMessage({
		userId: 'user-8',
		guildId: 'guild-8',
		channelId: 'channel-8'
	})

	await award(message)

	const user = getUserFromStore('guild-8', 'user-8')
	expect(user?.messages).toBe(1) // messages should increment to 1
	expect(user?.xpMessages).toBe(1) // xpMessages should increment to 1
	// baseXp = 20 (from mockRandomValue = 0.5), xpRate = 1.5, server = 2.0 => finalXp = floor(20 * 1.5 * 2.0) = 60
	expect((user?.xp ?? 0)).toBeGreaterThan(0) // XP should be awarded with multipliers applied
})

test('Existing user: counters accumulate correctly', async () => {
	currentConfig.cooldownSeconds = 0
	currentConfig.xpRate = 1.0

	// Pre-seed user with existing data
	const existingUser: UserXP = {
		xp: 100,
		level: 0,
		lastAwardedAt: 0,
		messages: 50,
		xpMessages: 25
	}
	mockFlashcore.set(`user:guild-9:user-9`, existingUser, { namespace: 'xp' })

	const message = createMessage({
		userId: 'user-9',
		guildId: 'guild-9',
		channelId: 'channel-9'
	})

	await award(message)

	const user = getUserFromStore('guild-9', 'user-9')
	expect(user?.messages).toBe(51) // messages should increment from 50 to 51
	expect(user?.xpMessages).toBe(26) // xpMessages should increment from 25 to 26
	expect((user?.xp ?? 0)).toBeGreaterThan(100) // XP should increase from 100
})

test('Combined gating: No-XP channel AND No-XP role', async () => {
	currentConfig.noXpChannelIds = ['no-xp-channel']
	currentConfig.noXpRoleIds = ['no-xp-role']
	currentConfig.cooldownSeconds = 0
	;(globalThis as any).__testConfig = JSON.parse(JSON.stringify(currentConfig))

	const message = createMessage({
		userId: 'user-10',
		guildId: 'guild-10',
		channelId: 'no-xp-channel',
		roleIds: ['no-xp-role']
	})

	await award(message)

	const user = getUserFromStore('guild-10', 'user-10')
	expect(user?.messages).toBe(1) // messages should increment even with both gates
	expect(user?.xpMessages).toBe(0) // xpMessages should remain 0 (both gates active)
	expect(user?.xp).toBe(0) // XP should remain 0 (both gates active)
})
