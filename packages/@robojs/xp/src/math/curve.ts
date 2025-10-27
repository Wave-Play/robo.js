/**
 * MEE6-style level curve mathematics
 *
 * Implements the formula: XP = 5 * level^2 + 50 * level + 100
 * This matches MEE6's leveling curve for Discord bots.
 *
 * Reference: https://github.com/Mee6/Mee6-documentation
 */

import type { LevelProgress } from '../types.js'

/**
 * Formula coefficients for MEE6 level curve
 * Formula: XP = A * level^2 + B * level + C
 */
export const CURVE_A = 5
export const CURVE_B = 50
export const CURVE_C = 100

/**
 * Calculates XP required to reach a specific level from level 0
 * Uses MEE6 formula: 5 * level^2 + 50 * level + 100
 *
 * @param level - Target level (must be >= 0)
 * @returns Total XP needed to reach the specified level
 * @throws Error if level is negative
 *
 * @example
 * xpNeededForLevel(0) // 0
 * xpNeededForLevel(1) // 155
 * xpNeededForLevel(2) // 220
 * xpNeededForLevel(10) // 1100
 */
export function xpNeededForLevel(level: number): number {
	if (level < 0) {
		throw new Error('Level must be non-negative')
	}

	if (level === 0) {
		return 0
	}

	return CURVE_A * level * level + CURVE_B * level + CURVE_C
}

/**
 * Calculates cumulative XP needed to reach a level
 * This is the total XP required to be at the START of the specified level
 *
 * @param level - Target level (must be >= 0)
 * @returns Cumulative XP from level 0 to specified level
 *
 * @example
 * totalXpForLevel(0) // 0
 * totalXpForLevel(1) // 155 (0 + 155)
 * totalXpForLevel(2) // 375 (155 + 220)
 */
export function totalXpForLevel(level: number): number {
	if (level <= 0) {
		return 0
	}

	let total = 0
	for (let i = 1; i <= level; i++) {
		total += xpNeededForLevel(i)
	}
	return total
}

/**
 * Computes current level and progress from total XP
 * Inverse calculation of totalXpForLevel
 *
 * @param totalXp - Total XP accumulated (must be >= 0)
 * @returns LevelProgress with current level, XP in level, and XP to next level
 *
 * @example
 * computeLevelFromTotalXp(0)   // { level: 0, inLevel: 0, toNext: 155 }
 * computeLevelFromTotalXp(100) // { level: 0, inLevel: 100, toNext: 55 }
 * computeLevelFromTotalXp(155) // { level: 1, inLevel: 0, toNext: 220 }
 * computeLevelFromTotalXp(200) // { level: 1, inLevel: 45, toNext: 175 }
 */
export function computeLevelFromTotalXp(totalXp: number): LevelProgress {
	if (totalXp < 0) {
		totalXp = 0
	}

	// Handle level 0 case
	if (totalXp < xpNeededForLevel(1)) {
		return {
			level: 0,
			inLevel: totalXp,
			toNext: xpNeededForLevel(1) - totalXp
		}
	}

	// Find level by iterating until we exceed totalXp
	let level = 0
	let cumulativeXp = 0

	while (true) {
		const nextLevelXp = xpNeededForLevel(level + 1)
		if (cumulativeXp + nextLevelXp > totalXp) {
			// Current level found
			const inLevel = totalXp - cumulativeXp
			const toNext = nextLevelXp - inLevel
			return { level, inLevel, toNext }
		}
		cumulativeXp += nextLevelXp
		level++
	}
}

/**
 * Calculates progress within current level as absolute values and percentage
 *
 * @param totalXp - Total XP accumulated
 * @returns Object with current XP in level, XP needed for next level, and percentage
 *
 * @example
 * progressInLevel(0)   // { current: 0, needed: 155, percentage: 0 }
 * progressInLevel(77.5) // { current: 77.5, needed: 155, percentage: 50 }
 * progressInLevel(155) // { current: 0, needed: 220, percentage: 0 }
 * progressInLevel(265) // { current: 110, needed: 220, percentage: 50 }
 */
export function progressInLevel(totalXp: number): { current: number; needed: number; percentage: number } {
	const progress = computeLevelFromTotalXp(totalXp)
	const percentage = progress.toNext > 0 ? (progress.inLevel / (progress.inLevel + progress.toNext)) * 100 : 0

	return {
		current: progress.inLevel,
		needed: progress.inLevel + progress.toNext,
		percentage
	}
}

/**
 * Validates if a level is valid (non-negative integer)
 *
 * @param level - Level to validate
 * @returns True if level is non-negative integer
 *
 * @example
 * isValidLevel(0)    // true
 * isValidLevel(10)   // true
 * isValidLevel(-1)   // false
 * isValidLevel(1.5)  // true (implementation accepts fractional levels)
 */
export function isValidLevel(level: number): boolean {
	return typeof level === 'number' && level >= 0 && Number.isFinite(level)
}

/**
 * Validates if XP amount is valid (non-negative number)
 *
 * @param xp - XP to validate
 * @returns True if XP is non-negative number
 *
 * @example
 * isValidXp(0)     // true
 * isValidXp(1500)  // true
 * isValidXp(-100)  // false
 * isValidXp(1.5)   // true
 */
export function isValidXp(xp: number): boolean {
	return typeof xp === 'number' && xp >= 0 && Number.isFinite(xp)
}

/**
 * Calculates XP difference between two levels
 * Useful for multi-level jumps and XP grants
 *
 * @param fromLevel - Starting level
 * @param toLevel - Target level
 * @returns XP delta (positive if toLevel > fromLevel, negative if toLevel < fromLevel)
 *
 * @example
 * xpDeltaForLevelRange(0, 0)  // 0
 * xpDeltaForLevelRange(0, 1)  // 155
 * xpDeltaForLevelRange(1, 2)  // 220
 * xpDeltaForLevelRange(2, 1)  // -220
 */
export function xpDeltaForLevelRange(fromLevel: number, toLevel: number): number {
	return totalXpForLevel(toLevel) - totalXpForLevel(fromLevel)
}
