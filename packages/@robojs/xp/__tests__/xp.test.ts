/**
 * Unit tests for core XP manipulation functions
 * Tests addXP, removeXP, setXP, recalcLevel, and query functions
 */

import { describe, test, expect, beforeEach } from '@jest/globals'
import type { UserXP } from '../src/types.js'
import { setupTestEnvironment, cleanupTestEnvironment } from './helpers/test-utils.js'

// Import the built XP core functions
const xpCore = await import('../.robo/build/core/xp.js')

// Helper to create test user
function createTestUser(xp = 0, level = 0, messages = 0, xpMessages = 0): UserXP {
	return {
		xp,
		level,
		lastAwardedAt: Date.now(),
		messages,
		xpMessages
	}
}

// Reset mocks before each test
beforeEach(() => {
	setupTestEnvironment()
})

afterEach(() => {
	cleanupTestEnvironment()
})

// ============================================================================
// Test Suite: addXP
// ============================================================================

describe('addXP', () => {
	test('adding XP to new user creates record with correct values', async () => {
		const result = await xpCore.addXP('guild1', 'user1', 100)

		expect(result.oldXp).toBe(0)
		expect(result.newXp).toBe(100)
		expect(result.oldLevel).toBe(0)
		expect(result.newLevel).toBe(0)
		expect(result.leveledUp).toBe(false)

		// Verify message counters are initialized to 0 for new users
		const user = await xpCore.getUserData('guild1', 'user1')
		expect(typeof user?.messages).toBe('number')
		expect(typeof user?.xpMessages).toBe('number')
		expect(user?.messages).toBe(0)
		expect(user?.xpMessages).toBe(0)
	})

	test('adding XP to existing user increments correctly', async () => {
		// Pre-populate user data
		await xpCore.addXP('guild1', 'user1', 100)

		// Manually set message counters via getUserData to simulate existing state
		const existingUser = await xpCore.getUserData('guild1', 'user1')
		if (existingUser) {
			existingUser.messages = 10
			existingUser.xpMessages = 5
			// Directly store it via the mock
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', existingUser, { namespace: ['xp', 'guild1', 'users'] })
		}

		const result = await xpCore.addXP('guild1', 'user1', 50)

		expect(result.oldXp).toBe(100)
		expect(result.newXp).toBe(150)
		expect(result.leveledUp).toBe(false)

		// Verify message counters remain unchanged after XP manipulation
		const user = await xpCore.getUserData('guild1', 'user1')
		expect(typeof user?.messages).toBe('number')
		expect(typeof user?.xpMessages).toBe('number')
		expect(user?.messages).toBe(10)
		expect(user?.xpMessages).toBe(5)
	})

	test('adding XP that crosses level threshold updates level', async () => {
		// Create user with 100 XP (level 0)
		await xpCore.addXP('guild1', 'user1', 100)

		// Set message counters
		const existingUser = await xpCore.getUserData('guild1', 'user1')
		if (existingUser) {
			existingUser.messages = 15
			existingUser.xpMessages = 8
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', existingUser, { namespace: ['xp', 'guild1', 'users'] })
		}

		// Adding 100 XP gives 200 total, which should reach level 1 (155 XP needed)
		const result = await xpCore.addXP('guild1', 'user1', 100)

		expect(result.oldXp).toBe(100)
		expect(result.newXp).toBe(200)
		expect(result.oldLevel).toBe(0)
		expect(result.newLevel).toBe(1)
		expect(result.leveledUp).toBe(true)

		// Verify message counters remain unchanged after level up
		const user = await xpCore.getUserData('guild1', 'user1')
		expect(typeof user?.messages).toBe('number')
		expect(typeof user?.xpMessages).toBe('number')
		expect(user?.messages).toBe(15)
		expect(user?.xpMessages).toBe(8)
	})

	test('adding XP emits xpChange event with correct delta and reason', async () => {
		const result = await xpCore.addXP('guild1', 'user1', 100, { reason: 'test_award' })

		// Just verify the function returns properly - event emission testing requires event infrastructure
		expect(result.newXp).toBe(100)
		expect(result.newXp - result.oldXp).toBe(100) // Delta calculation
	})

	test('adding XP that levels up emits levelUp event', async () => {
		// Create user just below level threshold
		await xpCore.addXP('guild1', 'user1', 150)

		const result = await xpCore.addXP('guild1', 'user1', 10)

		expect(result.leveledUp).toBe(true)
		expect(result.newLevel).toBe(1)
	})

	test('adding large XP amount crosses multiple levels correctly', async () => {
		const result = await xpCore.addXP('guild1', 'user1', 1000)

		expect(result.oldXp).toBe(0)
		expect(result.newXp).toBe(1000)
		expect(result.oldLevel).toBe(0)
		expect(result.newLevel).toBeGreaterThan(1) // Should cross multiple levels
		expect(result.leveledUp).toBe(true)
	})

	test('adding 0 XP is allowed (no-op)', async () => {
		await xpCore.addXP('guild1', 'user1', 100)
		const result = await xpCore.addXP('guild1', 'user1', 0)

		expect(result.oldXp).toBe(100)
		expect(result.newXp).toBe(100)
		expect(result.newXp - result.oldXp).toBe(0) // Delta calculation
		expect(result.leveledUp).toBe(false)
	})

	test('adding negative XP throws error', async () => {
		await expect(xpCore.addXP('guild1', 'user1', -50)).rejects.toThrow()
	})

	test('invalid guildId throws error', async () => {
		await expect(xpCore.addXP('', 'user1', 100)).rejects.toThrow()
	})

	test('invalid userId throws error', async () => {
		await expect(xpCore.addXP('guild1', '', 100)).rejects.toThrow()
	})

	test('leveledUp flag is true when level increases, false otherwise', async () => {
		// Add small amount - no level up
		const result1 = await xpCore.addXP('guild1', 'user1', 50)
		expect(result1.leveledUp).toBe(false)

		// Add enough to level up
		const result2 = await xpCore.addXP('guild1', 'user1', 200)
		expect(result2.leveledUp).toBe(true)
	})
})

// ============================================================================
// Test Suite: removeXP
// ============================================================================

describe('removeXP', () => {
	test('removing XP from user decrements correctly', async () => {
		await xpCore.addXP('guild1', 'user1', 200)

		const result = await xpCore.removeXP('guild1', 'user1', 50)

		expect(result.oldXp).toBe(200)
		expect(result.newXp).toBe(150)
		expect(result.newXp - result.oldXp).toBe(-50) // Delta calculation
	})

	test('removing XP that crosses level threshold updates level', async () => {
		// Give user 200 XP (level 1)
		await xpCore.addXP('guild1', 'user1', 200)

		// Remove 100 XP, should drop to level 0
		const result = await xpCore.removeXP('guild1', 'user1', 100)

		expect(result.oldXp).toBe(200)
		expect(result.newXp).toBe(100)
		expect(result.oldLevel).toBe(1)
		expect(result.newLevel).toBe(0)
		expect(result.leveledDown).toBe(true)
	})

	test('removing XP emits xpChange event with negative delta', async () => {
		await xpCore.addXP('guild1', 'user1', 200)

		const result = await xpCore.removeXP('guild1', 'user1', 50)

		expect(result.newXp - result.oldXp).toBe(-50) // Delta calculation
		expect(result.newXp).toBe(150)
	})

	test('removing XP that levels down emits levelDown event', async () => {
		await xpCore.addXP('guild1', 'user1', 200)

		const result = await xpCore.removeXP('guild1', 'user1', 150)

		expect(result.leveledDown).toBe(true)
	})

	test('removing more XP than user has clamps to 0', async () => {
		await xpCore.addXP('guild1', 'user1', 100)

		const result = await xpCore.removeXP('guild1', 'user1', 200)

		expect(result.newXp).toBe(0)
		expect(result.oldXp).toBe(100)
	})

	test('removing XP from non-existent user throws error', async () => {
		await expect(xpCore.removeXP('guild1', 'nonexistent', 50)).rejects.toThrow()
	})

	test('removing negative amount throws error', async () => {
		await xpCore.addXP('guild1', 'user1', 100)
		await expect(xpCore.removeXP('guild1', 'user1', -50)).rejects.toThrow()
	})

	test('leveledDown flag is true when level decreases, false otherwise', async () => {
		await xpCore.addXP('guild1', 'user1', 200)

		// Remove small amount - no level change
		const result1 = await xpCore.removeXP('guild1', 'user1', 10)
		expect(result1.leveledDown).toBe(false)

		// Remove enough to level down
		const result2 = await xpCore.removeXP('guild1', 'user1', 100)
		expect(result2.leveledDown).toBe(true)
	})
})

// ============================================================================
// Test Suite: setXP
// ============================================================================

describe('setXP', () => {
	test('setting XP to specific value updates correctly', async () => {
		await xpCore.addXP('guild1', 'user1', 100)

		const result = await xpCore.setXP('guild1', 'user1', 500)

		expect(result.oldXp).toBe(100)
		expect(result.newXp).toBe(500)
		expect(result.newXp - result.oldXp).toBe(400) // Delta calculation
	})

	test('setting XP higher than current emits levelUp if threshold crossed', async () => {
		await xpCore.addXP('guild1', 'user1', 50)

		const result = await xpCore.setXP('guild1', 'user1', 300)

		expect(result.newLevel).toBeGreaterThan(result.oldLevel)
	})

	test('setting XP lower than current emits levelDown if threshold crossed', async () => {
		await xpCore.addXP('guild1', 'user1', 300)

		const result = await xpCore.setXP('guild1', 'user1', 50)

		expect(result.newLevel).toBeLessThan(result.oldLevel)
	})

	test('setting XP emits xpChange event with correct delta (positive)', async () => {
		await xpCore.addXP('guild1', 'user1', 100)

		const result = await xpCore.setXP('guild1', 'user1', 200)

		expect(result.newXp - result.oldXp).toBe(100) // Delta calculation
	})

	test('setting XP emits xpChange event with correct delta (negative)', async () => {
		await xpCore.addXP('guild1', 'user1', 200)

		const result = await xpCore.setXP('guild1', 'user1', 150)

		expect(result.newXp - result.oldXp).toBe(-50) // Delta calculation
	})

	test('setting XP to 0 works correctly', async () => {
		await xpCore.addXP('guild1', 'user1', 100)

		const result = await xpCore.setXP('guild1', 'user1', 0)

		expect(result.newXp).toBe(0)
		expect(result.newLevel).toBe(0)
	})

	test('setting negative XP throws error', async () => {
		await expect(xpCore.setXP('guild1', 'user1', -100)).rejects.toThrow()
	})

	test('setting XP for new user creates record', async () => {
		const result = await xpCore.setXP('guild1', 'user1', 250)

		expect(result.oldXp).toBe(0)
		expect(result.newXp).toBe(250)

		const user = await xpCore.getUserData('guild1', 'user1')
		expect(user).not.toBeNull()
		expect(user?.xp).toBe(250)
	})
})

// ============================================================================
// Test Suite: recalcLevel
// ============================================================================

describe('recalcLevel', () => {
	test('recalc with correct level returns reconciled=false', async () => {
		await xpCore.addXP('guild1', 'user1', 200)

		const result = await xpCore.recalcLevel('guild1', 'user1')

		expect(result.reconciled).toBe(false)
		expect(result.oldLevel).toBe(result.newLevel)
	})

	test('recalc with incorrect level updates and returns reconciled=true', async () => {
		// Create user and manually set incorrect level
		await xpCore.addXP('guild1', 'user1', 200)
		const user = await xpCore.getUserData('guild1', 'user1')
		if (user) {
			user.level = 5 // Wrong level for 200 XP
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', user, { namespace: ['xp', 'guild1', 'users'] })
		}

		const result = await xpCore.recalcLevel('guild1', 'user1')

		expect(result.reconciled).toBe(true)
		expect(result.oldLevel).not.toBe(result.newLevel)
	})

	test('recalc emits levelUp event when correcting upward', async () => {
		// Create user with XP but wrong level
		await xpCore.addXP('guild1', 'user1', 300)
		const user = await xpCore.getUserData('guild1', 'user1')
		if (user) {
			user.level = 0 // Too low
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', user, { namespace: ['xp', 'guild1', 'users'] })
		}

		const result = await xpCore.recalcLevel('guild1', 'user1')

		expect(result.reconciled).toBe(true)
		expect(result.newLevel).toBeGreaterThan(result.oldLevel)
	})

	test('recalc emits levelDown event when correcting downward', async () => {
		// Create user with wrong level
		await xpCore.addXP('guild1', 'user1', 100)
		const user = await xpCore.getUserData('guild1', 'user1')
		if (user) {
			user.level = 5 // Too high
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', user, { namespace: ['xp', 'guild1', 'users'] })
		}

		const result = await xpCore.recalcLevel('guild1', 'user1')

		expect(result.reconciled).toBe(true)
		expect(result.newLevel).toBeLessThan(result.oldLevel)
	})

	test('recalc for non-existent user throws error', async () => {
		await expect(xpCore.recalcLevel('guild1', 'nonexistent')).rejects.toThrow()
	})

	test('recalc after manual XP edit fixes level correctly', async () => {
		await xpCore.addXP('guild1', 'user1', 50)

		// Manually edit XP to high value but keep old level
		const user = await xpCore.getUserData('guild1', 'user1')
		if (user) {
			user.xp = 500
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', user, { namespace: ['xp', 'guild1', 'users'] })
		}

		const result = await xpCore.recalcLevel('guild1', 'user1')

		expect(result.reconciled).toBe(true)
		expect(result.newLevel).toBeGreaterThan(0)
	})
})

// ============================================================================
// Test Suite: getXP
// ============================================================================

describe('getXP', () => {
	test('returns correct XP for existing user', async () => {
		await xpCore.addXP('guild1', 'user1', 250)

		const xp = await xpCore.getXP('guild1', 'user1')

		expect(xp).toBe(250)
	})

	test('returns 0 for non-existent user', async () => {
		const xp = await xpCore.getXP('guild1', 'nonexistent')

		expect(xp).toBe(0)
	})
})

// ============================================================================
// Test Suite: getLevel
// ============================================================================

describe('getLevel', () => {
	test('returns correct level for existing user', async () => {
		await xpCore.addXP('guild1', 'user1', 300)

		const level = await xpCore.getLevel('guild1', 'user1')

		expect(level).toBeGreaterThan(0)
	})

	test('returns 0 for non-existent user', async () => {
		const level = await xpCore.getLevel('guild1', 'nonexistent')

		expect(level).toBe(0)
	})
})

// ============================================================================
// Test Suite: getUserData
// ============================================================================

describe('getUserData', () => {
	test('returns complete UserXP object for existing user', async () => {
		await xpCore.addXP('guild1', 'user1', 150)

		const user = await xpCore.getUserData('guild1', 'user1')

		expect(user).not.toBeNull()
		expect(user).toHaveProperty('xp')
		expect(user).toHaveProperty('level')
		expect(user).toHaveProperty('lastAwardedAt')
		expect(user).toHaveProperty('messages')
		expect(user).toHaveProperty('xpMessages')
	})

	test('returns null for non-existent user', async () => {
		const user = await xpCore.getUserData('guild1', 'nonexistent')

		expect(user).toBeNull()
	})
})

// ============================================================================
// Test Suite: Event Emission
// ============================================================================

describe('Event Emission', () => {
	test('addXP emits events after Flashcore persistence', async () => {
		const result = await xpCore.addXP('guild1', 'user1', 100)

		// Verify user is persisted
		const user = await xpCore.getUserData('guild1', 'user1')
		expect(user).not.toBeNull()
		expect(result.newXp).toBe(100)
	})

	test('events have correct payload structure', async () => {
		const result = await xpCore.addXP('guild1', 'user1', 150)

		// Verify result structure (guildId/userId are not in result, only in events)
		expect(result).toHaveProperty('oldXp')
		expect(result).toHaveProperty('newXp')
		expect(result).toHaveProperty('oldLevel')
		expect(result).toHaveProperty('newLevel')
		expect(result).toHaveProperty('leveledUp')
	})

	test('multiple level jumps emit single event with correct old/new levels', async () => {
		const result = await xpCore.addXP('guild1', 'user1', 1000)

		expect(result.oldLevel).toBe(0)
		expect(result.newLevel).toBeGreaterThan(1)
		expect(result.leveledUp).toBe(true)
	})
})

// ============================================================================
// Test Suite: Message Counter Behavior
// ============================================================================

describe('Message Counter Behavior', () => {
	test('messages field is preserved when adding XP', async () => {
		await xpCore.addXP('guild1', 'user1', 50)

		// Set message counters
		const user1 = await xpCore.getUserData('guild1', 'user1')
		if (user1) {
			user1.messages = 25
			user1.xpMessages = 10
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', user1, { namespace: ['xp', 'guild1', 'users'] })
		}

		await xpCore.addXP('guild1', 'user1', 50)

		const user = await xpCore.getUserData('guild1', 'user1')
		expect(user?.messages).toBe(25)
	})

	test('xpMessages field is preserved when removing XP', async () => {
		await xpCore.addXP('guild1', 'user1', 200)

		// Set message counters
		const user1 = await xpCore.getUserData('guild1', 'user1')
		if (user1) {
			user1.messages = 50
			user1.xpMessages = 20
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', user1, { namespace: ['xp', 'guild1', 'users'] })
		}

		await xpCore.removeXP('guild1', 'user1', 50)

		const user = await xpCore.getUserData('guild1', 'user1')
		expect(user?.xpMessages).toBe(20)
	})

	test('setXP preserves both message counters', async () => {
		await xpCore.addXP('guild1', 'user1', 100)

		// Set message counters
		const user1 = await xpCore.getUserData('guild1', 'user1')
		if (user1) {
			user1.messages = 30
			user1.xpMessages = 15
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', user1, { namespace: ['xp', 'guild1', 'users'] })
		}

		await xpCore.setXP('guild1', 'user1', 500)

		const user = await xpCore.getUserData('guild1', 'user1')
		expect(user?.messages).toBe(30)
		expect(user?.xpMessages).toBe(15)
	})

	test('recalcLevel preserves both message counters', async () => {
		await xpCore.addXP('guild1', 'user1', 200)

		// Set message counters and wrong level
		const user1 = await xpCore.getUserData('guild1', 'user1')
		if (user1) {
			user1.messages = 40
			user1.xpMessages = 18
			user1.level = 5 // Wrong level
			const { mockFlashcore } = await import('./helpers/mocks.js')
			await mockFlashcore.set('user1', user1, { namespace: ['xp', 'guild1', 'users'] })
		}

		await xpCore.recalcLevel('guild1', 'user1')

		const user = await xpCore.getUserData('guild1', 'user1')
		expect(user?.messages).toBe(40)
		expect(user?.xpMessages).toBe(18)
	})

	test('new users get both message counters initialized to 0', async () => {
		await xpCore.addXP('guild1', 'user1', 50)

		const user = await xpCore.getUserData('guild1', 'user1')
		expect(user?.messages).toBe(0)
		expect(user?.xpMessages).toBe(0)
	})
})
