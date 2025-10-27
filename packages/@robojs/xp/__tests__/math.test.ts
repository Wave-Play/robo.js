/**
 * Unit tests for MEE6-style level curve mathematics
 * Tests formulas, edge cases, and validation helpers
 */

import { test, expect } from '@jest/globals'

import {
	xpNeededForLevel,
	totalXpForLevel,
	computeLevelFromTotalXp,
	progressInLevel,
	isValidLevel,
	isValidXp,
	xpDeltaForLevelRange
} from '../.robo/build/math/curve.js'

// ============================================================================
// Test Suite: xpNeededForLevel
// ============================================================================

test('xpNeededForLevel returns 0 for level 0', () => {
	expect(xpNeededForLevel(0)).toBe(0)
})

test('xpNeededForLevel returns 155 for level 1', () => {
	// 5*1^2 + 50*1 + 100 = 5 + 50 + 100 = 155
	expect(xpNeededForLevel(1)).toBe(155)
})

test('xpNeededForLevel returns 220 for level 2', () => {
	// 5*2^2 + 50*2 + 100 = 20 + 100 + 100 = 220
	expect(xpNeededForLevel(2)).toBe(220)
})

test('xpNeededForLevel returns 1100 for level 10', () => {
	// 5*10^2 + 50*10 + 100 = 500 + 500 + 100 = 1100
	expect(xpNeededForLevel(10)).toBe(1100)
})

test('xpNeededForLevel throws error for negative level', () => {
	expect(() => xpNeededForLevel(-1)).toThrow(/Level must be non-negative/)
})

test('xpNeededForLevel works with fractional levels', () => {
	// Should calculate formula with fractional input
	const result = xpNeededForLevel(1.5)
	// 5*1.5^2 + 50*1.5 + 100 = 11.25 + 75 + 100 = 186.25
	expect(result).toBe(186.25)
})

// ============================================================================
// Test Suite: totalXpForLevel
// ============================================================================

test('totalXpForLevel returns 0 for level 0', () => {
	expect(totalXpForLevel(0)).toBe(0)
})

test('totalXpForLevel returns 155 for level 1', () => {
	// Sum of level 1 requirement
	expect(totalXpForLevel(1)).toBe(155)
})

test('totalXpForLevel returns 375 for level 2', () => {
	// 155 + 220 = 375
	expect(totalXpForLevel(2)).toBe(375)
})

test('totalXpForLevel returns correct value for level 5', () => {
	// Level 1: 155
	// Level 2: 220
	// Level 3: 5*9 + 50*3 + 100 = 295
	// Level 4: 5*16 + 50*4 + 100 = 380
	// Level 5: 5*25 + 50*5 + 100 = 475
	// Total: 155 + 220 + 295 + 380 + 475 = 1525
	expect(totalXpForLevel(5)).toBe(1525)
})

test('totalXpForLevel handles large level efficiently', () => {
	// Should compute without significant delay
	const result = totalXpForLevel(100)
	expect(result).toBeGreaterThan(0)
	// Verify it's a reasonable value (100 levels should be substantial)
	expect(result).toBeGreaterThan(100000)
})

test('totalXpForLevel returns 0 for negative levels', () => {
	expect(totalXpForLevel(-5)).toBe(0)
})

// ============================================================================
// Test Suite: computeLevelFromTotalXp
// ============================================================================

test('computeLevelFromTotalXp returns level 0 for 0 XP', () => {
	const result = computeLevelFromTotalXp(0)
	expect(result.level).toBe(0)
	expect(result.inLevel).toBe(0)
	expect(result.toNext).toBe(155)
})

test('computeLevelFromTotalXp returns level 0 for 100 XP', () => {
	const result = computeLevelFromTotalXp(100)
	expect(result.level).toBe(0)
	expect(result.inLevel).toBe(100)
	expect(result.toNext).toBe(55) // 155 - 100
})

test('computeLevelFromTotalXp returns level 1 at exact threshold (155 XP)', () => {
	const result = computeLevelFromTotalXp(155)
	expect(result.level).toBe(1)
	expect(result.inLevel).toBe(0)
	expect(result.toNext).toBe(220) // Level 2 requirement
})

test('computeLevelFromTotalXp returns level 1 for 200 XP', () => {
	const result = computeLevelFromTotalXp(200)
	expect(result.level).toBe(1)
	expect(result.inLevel).toBe(45) // 200 - 155
	expect(result.toNext).toBe(175) // 220 - 45
})

test('computeLevelFromTotalXp returns level 2 at exact threshold (375 XP)', () => {
	const result = computeLevelFromTotalXp(375)
	expect(result.level).toBe(2)
	expect(result.inLevel).toBe(0)
	// Level 3 requirement: 5*9 + 50*3 + 100 = 295
	expect(result.toNext).toBe(295)
})

test('computeLevelFromTotalXp handles multi-level jumps (10000 XP)', () => {
	const result = computeLevelFromTotalXp(10000)
	// Verify level is in expected range for 10,000 XP
	expect(result.level).toBeGreaterThanOrEqual(13)
	expect(result.level).toBeLessThanOrEqual(14)
	expect(result.inLevel).toBeGreaterThanOrEqual(0)
	expect(result.toNext).toBeGreaterThan(0)
	// Verify math: inLevel + toNext should equal next level requirement
	const nextLevelXp = xpNeededForLevel(result.level + 1)
	expect(result.inLevel + result.toNext).toBe(nextLevelXp)
})

test('computeLevelFromTotalXp handles negative XP (returns level 0)', () => {
	const result = computeLevelFromTotalXp(-100)
	expect(result.level).toBe(0)
	expect(result.inLevel).toBe(0)
	expect(result.toNext).toBe(155)
})

// ============================================================================
// Test Suite: progressInLevel
// ============================================================================

test('progressInLevel returns 0% for 0 XP', () => {
	const result = progressInLevel(0)
	expect(result.current).toBe(0)
	expect(result.needed).toBe(155)
	expect(result.percentage).toBe(0)
})

test('progressInLevel returns ~50% for half of level 0 requirement', () => {
	const result = progressInLevel(77.5) // Half of 155
	expect(result.current).toBe(77.5)
	expect(result.needed).toBe(155)
	expect(result.percentage).toBe(50)
})

test('progressInLevel returns 0% at exact level boundary (155 XP)', () => {
	const result = progressInLevel(155)
	expect(result.current).toBe(0)
	expect(result.needed).toBe(220) // Level 2 requirement
	expect(result.percentage).toBe(0)
})

test('progressInLevel returns 50% for half of level 1 requirement', () => {
	const result = progressInLevel(155 + 110) // 155 + half of 220
	expect(result.current).toBe(110)
	expect(result.needed).toBe(220)
	expect(result.percentage).toBe(50)
})

test('progressInLevel returns 0% at level 2 boundary (375 XP)', () => {
	const result = progressInLevel(375)
	expect(result.current).toBe(0)
	expect(result.percentage).toBe(0)
	// Level 3 requirement: 5*9 + 50*3 + 100 = 295
	expect(result.needed).toBe(295)
})

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

test('computeLevelFromTotalXp handles very large XP values', () => {
	const result = computeLevelFromTotalXp(1_000_000)
	expect(result.level).toBeGreaterThan(0)
	expect(result.inLevel).toBeGreaterThanOrEqual(0)
	expect(result.toNext).toBeGreaterThan(0)
	// Verify no overflow or precision issues
	const nextLevelXp = xpNeededForLevel(result.level + 1)
	expect(result.inLevel + result.toNext).toBe(nextLevelXp)
})

test('computeLevelFromTotalXp works at exact level boundaries (no off-by-one)', () => {
	// Test multiple level boundaries
	const boundaries = [155, 375, 670, 1050, 1525] // Levels 1-5
	for (let i = 0; i < boundaries.length; i++) {
		const result = computeLevelFromTotalXp(boundaries[i])
		expect(result.level).toBe(i + 1)
		expect(result.inLevel).toBe(0)
	}
})

test('xpNeededForLevel and computeLevelFromTotalXp are inverse operations', () => {
	// For any level, totalXpForLevel should give XP that produces that level
	for (let level = 0; level <= 20; level++) {
		const totalXp = totalXpForLevel(level)
		const computed = computeLevelFromTotalXp(totalXp)
		expect(computed.level).toBe(level)
		expect(computed.inLevel).toBe(0)
	}
})

test('progressInLevel handles floating point XP values', () => {
	const result = progressInLevel(100.5)
	expect(result.current).toBe(100.5)
	expect(result.needed).toBe(155)
	// Should handle fractional percentage
	expect(result.percentage).toBeGreaterThan(64)
	expect(result.percentage).toBeLessThan(65)
})

// ============================================================================
// Test Suite: Validation Helpers
// ============================================================================

test('isValidLevel accepts positive integers', () => {
	expect(isValidLevel(0)).toBeTruthy()
	expect(isValidLevel(10)).toBeTruthy()
	expect(isValidLevel(100)).toBeTruthy()
})

test('isValidLevel rejects negative values', () => {
	expect(isValidLevel(-1)).toBeFalsy()
	expect(isValidLevel(-100)).toBeFalsy()
})

test('isValidLevel accepts fractional values', () => {
	// Implementation accepts fractional levels
	expect(isValidLevel(1.5)).toBeTruthy()
	expect(isValidLevel(10.25)).toBeTruthy()
})

test('isValidLevel rejects infinity', () => {
	expect(isValidLevel(Infinity)).toBeFalsy()
	expect(isValidLevel(-Infinity)).toBeFalsy()
})

test('isValidLevel rejects NaN', () => {
	expect(isValidLevel(NaN)).toBeFalsy()
})

test('isValidXp accepts non-negative numbers', () => {
	expect(isValidXp(0)).toBeTruthy()
	expect(isValidXp(1500)).toBeTruthy()
	expect(isValidXp(1.5)).toBeTruthy()
})

test('isValidXp rejects negative values', () => {
	expect(isValidXp(-100)).toBeFalsy()
})

test('isValidXp rejects infinity and NaN', () => {
	expect(isValidXp(Infinity)).toBeFalsy()
	expect(isValidXp(NaN)).toBeFalsy()
})

// ============================================================================
// Test Suite: xpDeltaForLevelRange
// ============================================================================

test('xpDeltaForLevelRange returns 0 for same level', () => {
	expect(xpDeltaForLevelRange(0, 0)).toBe(0)
	expect(xpDeltaForLevelRange(5, 5)).toBe(0)
})

test('xpDeltaForLevelRange returns 155 for level 0 to 1', () => {
	expect(xpDeltaForLevelRange(0, 1)).toBe(155)
})

test('xpDeltaForLevelRange returns 220 for level 1 to 2', () => {
	expect(xpDeltaForLevelRange(1, 2)).toBe(220)
})

test('xpDeltaForLevelRange returns sum for multi-level jumps', () => {
	// Level 0 to 5: 155 + 220 + 295 + 380 + 475 = 1525
	expect(xpDeltaForLevelRange(0, 5)).toBe(1525)
})

test('xpDeltaForLevelRange returns negative for reverse range', () => {
	expect(xpDeltaForLevelRange(2, 1)).toBe(-220)
	expect(xpDeltaForLevelRange(5, 0)).toBe(-1525)
})
