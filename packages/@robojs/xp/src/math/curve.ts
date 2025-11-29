/**
 * Level curve mathematics for XP system
 *
 * Implements the default quadratic formula: XP = 5 * level^2 + 50 * level + 100
 * Supports custom level curves via optional LevelCurve parameter.
 */

import type { LevelProgress, LevelCurve } from '../types.js'

/**
 * Default quadratic curve coefficients
 * Formula: XP = A * level^2 + B * level + C
 */
export const DEFAULT_CURVE_A = 5
export const DEFAULT_CURVE_B = 50
export const DEFAULT_CURVE_C = 100

/**
 * Calculates XP required to gain a specific level (delta from previous level)
 * Uses default quadratic formula or custom curve if provided
 *
 * When using a custom curve, returns the XP delta between the specified level
 * and the previous level: curve.xpForLevel(level) - curve.xpForLevel(level - 1).
 * This represents the XP cost to gain that specific level.
 *
 * @param level - Target level (must be >= 0)
 * @param curve - Optional custom level curve (uses default quadratic if omitted)
 * @returns XP required to gain the specified level from the previous level
 * @throws Error if level is negative
 *
 * @example Default curve (quadratic)
 * xpNeededForLevel(0) // 0
 * xpNeededForLevel(1) // 155 (XP to gain level 1)
 * xpNeededForLevel(2) // 220 (XP to gain level 2)
 * xpNeededForLevel(10) // 1100 (XP to gain level 10)
 *
 * @example With custom linear curve
 * const curve = buildLinearCurve({ type: 'linear', params: { xpPerLevel: 100 } })
 * xpNeededForLevel(1, curve) // 100 (100 - 0)
 * xpNeededForLevel(10, curve) // 100 (1000 - 900)
 */
export function xpNeededForLevel(level: number): number
export function xpNeededForLevel(level: number, curve: LevelCurve): number
export function xpNeededForLevel(level: number, curve?: LevelCurve): number {
	if (level < 0) {
		throw new Error('Level must be non-negative')
	}

	if (level === 0) {
		return 0
	}

	// If custom curve provided, compute delta from previous level
	if (curve) {
		return curve.xpForLevel(level) - curve.xpForLevel(level - 1)
	}

	return DEFAULT_CURVE_A * level * level + DEFAULT_CURVE_B * level + DEFAULT_CURVE_C
}

/**
 * Calculates cumulative XP needed to reach a level
 * This is the total XP required to be at the START of the specified level
 *
 * When using a custom curve, delegates to curve.xpForLevel(level) which returns
 * the total threshold. For the default curve, uses iterative summation.
 *
 * @param level - Target level (must be >= 0)
 * @param curve - Optional custom level curve
 * @returns Cumulative XP from level 0 to specified level
 *
 * @example Default curve (iterative summation)
 * totalXpForLevel(0) // 0
 * totalXpForLevel(1) // 155 (0 + 155)
 * totalXpForLevel(2) // 375 (155 + 220)
 *
 * @example With custom linear curve (direct threshold)
 * const curve = buildLinearCurve({ type: 'linear', params: { xpPerLevel: 100 } })
 * totalXpForLevel(5, curve) // 500 (curve.xpForLevel(5))
 */
export function totalXpForLevel(level: number): number
export function totalXpForLevel(level: number, curve: LevelCurve): number
export function totalXpForLevel(level: number, curve?: LevelCurve): number {
	if (level <= 0) {
		return 0
	}

	// If custom curve provided, use its total threshold directly
	if (curve) {
		return curve.xpForLevel(level)
	}

	// Default curve: iterative summation
	let total = 0
	for (let i = 1; i <= level; i++) {
		total += xpNeededForLevel(i)
	}
	return total
}

/**
 * Computes current level and progress from total XP
 * Inverse calculation of totalXpForLevel
 * Uses custom curve's optimized inverse function if provided
 *
 * @param totalXp - Total XP accumulated (must be >= 0)
 * @param curve - Optional custom level curve
 * @returns LevelProgress with current level, XP in level, and XP to next level
 *
 * @example
 * computeLevelFromTotalXp(0)   // { level: 0, inLevel: 0, toNext: 155 }
 * computeLevelFromTotalXp(100) // { level: 0, inLevel: 100, toNext: 55 }
 * computeLevelFromTotalXp(155) // { level: 1, inLevel: 0, toNext: 220 }
 * computeLevelFromTotalXp(200) // { level: 1, inLevel: 45, toNext: 175 }
 *
 * @example With custom curve
 * const curve = buildLinearCurve({ type: 'linear', params: { xpPerLevel: 100 } })
 * computeLevelFromTotalXp(550, curve) // { level: 5, inLevel: 50, toNext: 50 }
 */
export function computeLevelFromTotalXp(totalXp: number): LevelProgress
export function computeLevelFromTotalXp(totalXp: number, curve: LevelCurve): LevelProgress
export function computeLevelFromTotalXp(totalXp: number, curve?: LevelCurve): LevelProgress {
	if (totalXp < 0) {
		totalXp = 0
	}

	// If custom curve provided, use curve's inverse function
	if (curve) {
		const level = curve.levelFromXp(totalXp)
		const currentLevelXp = curve.xpForLevel(level)
		const nextLevelXp = curve.xpForLevel(level + 1)
		const inLevel = totalXp - currentLevelXp
		
		// Guard against Infinity at max level
		if (!Number.isFinite(nextLevelXp) || (curve.maxLevel !== undefined && level >= curve.maxLevel)) {
			return { level, inLevel, toNext: 0 }
		}
		
		const toNext = nextLevelXp - currentLevelXp - inLevel
		return { level, inLevel, toNext }
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
 * @param curve - Optional custom level curve
 * @returns Object with current XP in level, XP needed for next level, and percentage
 *
 * @example
 * progressInLevel(0)   // { current: 0, needed: 155, percentage: 0 }
 * progressInLevel(77.5) // { current: 77.5, needed: 155, percentage: 50 }
 * progressInLevel(155) // { current: 0, needed: 220, percentage: 0 }
 * progressInLevel(265) // { current: 110, needed: 220, percentage: 50 }
 */
export function progressInLevel(totalXp: number): { current: number; needed: number; percentage: number }
export function progressInLevel(totalXp: number, curve: LevelCurve): { current: number; needed: number; percentage: number }
export function progressInLevel(totalXp: number, curve?: LevelCurve): { current: number; needed: number; percentage: number } {
	const progress = curve ? computeLevelFromTotalXp(totalXp, curve) : computeLevelFromTotalXp(totalXp)
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
 * @param curve - Optional custom level curve
 * @returns XP delta (positive if toLevel > fromLevel, negative if toLevel < fromLevel)
 *
 * @example
 * xpDeltaForLevelRange(0, 0)  // 0
 * xpDeltaForLevelRange(0, 1)  // 155
 * xpDeltaForLevelRange(1, 2)  // 220
 * xpDeltaForLevelRange(2, 1)  // -220
 */
export function xpDeltaForLevelRange(fromLevel: number, toLevel: number): number
export function xpDeltaForLevelRange(fromLevel: number, toLevel: number, curve: LevelCurve): number
export function xpDeltaForLevelRange(fromLevel: number, toLevel: number, curve?: LevelCurve): number {
	if (curve) {
		return totalXpForLevel(toLevel, curve) - totalXpForLevel(fromLevel, curve)
	}
	return totalXpForLevel(toLevel) - totalXpForLevel(fromLevel)
}
