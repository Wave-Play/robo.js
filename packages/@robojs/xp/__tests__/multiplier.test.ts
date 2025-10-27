import { test, expect } from '@jest/globals'

import { resolveMultiplier, getServerMultiplier, getMaxRoleMultiplier, getUserMultiplier } from '../.robo/build/math/multiplier.js'
import type { GuildConfig } from '../src/types.js'

// Helper to create test configs
function createTestConfig(multipliers?: GuildConfig['multipliers']): GuildConfig {
	return {
		cooldownSeconds: 60,
		xpRate: 1.0,
		noXpChannelIds: [],
		noXpRoleIds: [],
		roleRewards: [],
		rewardsMode: 'stack',
		removeRewardOnXpLoss: false,
		leaderboard: { public: false },
		multipliers
	}
}

// ============================================================================
// Test Suite: resolveMultiplier
// ============================================================================

test('resolveMultiplier - Returns 1.0 with no multipliers configured', () => {
	const config = createTestConfig()
	const result = resolveMultiplier(config, [], 'user123')
	expect(result).toBe(1.0)
})

test('resolveMultiplier - Applies server multiplier only', () => {
	const config = createTestConfig({
		server: 2.0,
		role: {},
		user: {}
	})
	const result = resolveMultiplier(config, [], 'user123')
	expect(result).toBe(2.0)
})

test('resolveMultiplier - Applies role multiplier only', () => {
	const config = createTestConfig({
		role: { role1: 1.5 }
	})
	const result = resolveMultiplier(config, ['role1'], 'user123')
	expect(result).toBe(1.5)
})

test('resolveMultiplier - Applies user multiplier only', () => {
	const config = createTestConfig({
		user: { user123: 1.5 }
	})
	const result = resolveMultiplier(config, [], 'user123')
	expect(result).toBe(1.5)
})

test('resolveMultiplier - Stacks server and role multipliers', () => {
	const config = createTestConfig({
		server: 2.0,
		role: { role1: 1.5 }
	})
	const result = resolveMultiplier(config, ['role1'], 'user123')
	// 2.0 * 1.5 = 3.0
	expect(result).toBe(3.0)
})

test('resolveMultiplier - Stacks server, role, and user multipliers', () => {
	const config = createTestConfig({
		server: 2.0,
		role: { role1: 1.5 },
		user: { user123: 1.5 }
	})
	const result = resolveMultiplier(config, ['role1'], 'user123')
	// 2.0 * 1.5 * 1.5 = 4.5
	expect(result).toBe(4.5)
})

test('resolveMultiplier - Uses max role multiplier with multiple roles', () => {
	const config = createTestConfig({
		role: {
			role1: 1.2,
			role2: 1.8,
			role3: 1.5
		}
	})
	const result = resolveMultiplier(config, ['role1', 'role2', 'role3'], 'user123')
	// Should use max: 1.8
	expect(result).toBe(1.8)
})

test('resolveMultiplier - Ignores roles without multipliers', () => {
	const config = createTestConfig({
		role: { role1: 1.5 }
	})
	// role2 has no multiplier configured
	const result = resolveMultiplier(config, ['role1', 'role2'], 'user123')
	expect(result).toBe(1.5)
})

test('resolveMultiplier - Returns 1.0 when user has no roles', () => {
	const config = createTestConfig({
		role: { role1: 1.5 }
	})
	const result = resolveMultiplier(config, [], 'user123')
	expect(result).toBe(1.0)
})

test('resolveMultiplier - Handles multipliers < 1.0 (penalties)', () => {
	const config = createTestConfig({
		server: 0.5,
		role: { role1: 0.8 },
		user: { user123: 0.9 }
	})
	const result = resolveMultiplier(config, ['role1'], 'user123')
	// 0.5 * 0.8 * 0.9 = 0.36
	expect(result).toBeCloseTo(0.36, 2)
})

// ============================================================================
// Test Suite: getServerMultiplier
// ============================================================================

test('getServerMultiplier - Returns 1.0 when no multipliers configured', () => {
	const config = createTestConfig()
	const result = getServerMultiplier(config)
	expect(result).toBe(1.0)
})

test('getServerMultiplier - Returns 1.0 when multipliers object exists but server undefined', () => {
	const config = createTestConfig({
		role: {},
		user: {}
	})
	const result = getServerMultiplier(config)
	expect(result).toBe(1.0)
})

test('getServerMultiplier - Returns configured server multiplier', () => {
	const config = createTestConfig({
		server: 2.5
	})
	const result = getServerMultiplier(config)
	expect(result).toBe(2.5)
})

// ============================================================================
// Test Suite: getMaxRoleMultiplier
// ============================================================================

test('getMaxRoleMultiplier - Returns 1.0 with empty role array', () => {
	const config = createTestConfig({
		role: { role1: 1.5 }
	})
	const result = getMaxRoleMultiplier(config, [])
	expect(result).toBe(1.0)
})

test('getMaxRoleMultiplier - Returns 1.0 when no role multipliers configured', () => {
	const config = createTestConfig()
	const result = getMaxRoleMultiplier(config, ['role1', 'role2'])
	expect(result).toBe(1.0)
})

test('getMaxRoleMultiplier - Returns 1.0 when user roles have no multipliers', () => {
	const config = createTestConfig({
		role: { role3: 1.5 }
	})
	// User has role1 and role2, but only role3 has multiplier
	const result = getMaxRoleMultiplier(config, ['role1', 'role2'])
	expect(result).toBe(1.0)
})

test('getMaxRoleMultiplier - Returns single role multiplier', () => {
	const config = createTestConfig({
		role: { role1: 1.5 }
	})
	const result = getMaxRoleMultiplier(config, ['role1'])
	expect(result).toBe(1.5)
})

test('getMaxRoleMultiplier - Returns maximum among multiple role multipliers', () => {
	const config = createTestConfig({
		role: {
			role1: 1.2,
			role2: 2.5,
			role3: 1.8
		}
	})
	const result = getMaxRoleMultiplier(config, ['role1', 'role2', 'role3'])
	// Max is 2.5
	expect(result).toBe(2.5)
})

test('getMaxRoleMultiplier - Handles mix of configured and unconfigured roles', () => {
	const config = createTestConfig({
		role: {
			role1: 1.5,
			role3: 1.2
		}
	})
	// User has role1, role2 (no multiplier), role3
	const result = getMaxRoleMultiplier(config, ['role1', 'role2', 'role3'])
	// Max is 1.5 (role2 is ignored)
	expect(result).toBe(1.5)
})

// ============================================================================
// Test Suite: getUserMultiplier
// ============================================================================

test('getUserMultiplier - Returns 1.0 when no multipliers configured', () => {
	const config = createTestConfig()
	const result = getUserMultiplier(config, 'user123')
	expect(result).toBe(1.0)
})

test('getUserMultiplier - Returns 1.0 when multipliers object exists but user undefined', () => {
	const config = createTestConfig({
		role: {},
		user: {}
	})
	const result = getUserMultiplier(config, 'user123')
	expect(result).toBe(1.0)
})

test('getUserMultiplier - Returns 1.0 when different user has multiplier', () => {
	const config = createTestConfig({
		user: { user1: 1.5 }
	})
	// Query for user2, but only user1 has multiplier
	const result = getUserMultiplier(config, 'user2')
	expect(result).toBe(1.0)
})

test('getUserMultiplier - Returns configured user multiplier', () => {
	const config = createTestConfig({
		user: { user1: 1.5 }
	})
	const result = getUserMultiplier(config, 'user1')
	expect(result).toBe(1.5)
})

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

test('Edge case - Handles undefined config.multipliers gracefully', () => {
	const config = createTestConfig(undefined)
	const result = resolveMultiplier(config, ['role1'], 'user123')
	expect(result).toBe(1.0)
})

test('Edge case - Handles empty strings in role IDs', () => {
	const config = createTestConfig({
		role: { '': 2.0, role1: 1.5 }
	})
	// User has empty string role ID
	const result = getMaxRoleMultiplier(config, ['', 'role1'])
	// Should find both, max is 2.0
	expect(result).toBe(2.0)
})

test('Edge case - Precision with many multipliers', () => {
	const config = createTestConfig({
		server: 1.1,
		role: { role1: 1.2 },
		user: { user123: 1.3 }
	})
	const result = resolveMultiplier(config, ['role1'], 'user123')
	// 1.1 * 1.2 * 1.3 = 1.716
	expect(result).toBeCloseTo(1.716, 3)
})

// ============================================================================
// Test Suite: Resolution Order Verification
// ============================================================================

test('Resolution order - Applies multipliers in order: server × max(role) × user', () => {
	const config = createTestConfig({
		server: 2.0,
		role: { role1: 3.0 },
		user: { user123: 4.0 }
	})
	const result = resolveMultiplier(config, ['role1'], 'user123')
	// Expected: 2.0 * 3.0 * 4.0 = 24.0
	expect(result).toBe(24.0)

	// If order was different (e.g., additive), result would be different
	// Additive: 2.0 + 3.0 + 4.0 = 9.0 (incorrect)
	// Role + user first: (3.0 + 4.0) * 2.0 = 14.0 (incorrect)
})

test('Resolution order - Changing order would produce different result', () => {
	// This test documents what the result would be if order was different
	const config = createTestConfig({
		server: 2.0,
		role: { role1: 1.5 },
		user: { user123: 1.5 }
	})
	const result = resolveMultiplier(config, ['role1'], 'user123')

	// Correct order (server × role × user): 2.0 * 1.5 * 1.5 = 4.5
	expect(result).toBe(4.5)

	// If order was (user × role × server), result would still be 4.5 (multiplication is commutative)
	// But the spec requires specific order for consistency with MEE6
	// If it was additive: 2.0 + 1.5 + 1.5 = 5.0 (incorrect)
})
