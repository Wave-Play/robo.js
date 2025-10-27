/**
 * Core XP manipulation functions that integrate with store, math, and events.
 *
 * @example
 * ```typescript
 * import { addXP, removeXP, setXP, recalcLevel } from './core/xp.js'
 *
 * // Award XP to a user
 * const result = await addXP('guildId', 'userId', 100, { reason: 'contest_winner' })
 * if (result.leveledUp) {
 *   console.log(`User leveled up to ${result.newLevel}!`)
 * }
 *
 * // Recalculate level from total XP
 * await recalcLevel('guildId', 'userId')
 * ```
 */

import { logger } from 'robo.js'
import * as store from '../store/index.js'
import * as math from '../math/curve.js'
import * as events from '../runtime/events.js'
import type { UserXP, AddXPOptions } from '../types.js'

export interface XPChangeResult {
	oldXp: number
	newXp: number
	oldLevel: number
	newLevel: number
	leveledUp: boolean
}

export interface XPRemoveResult {
	oldXp: number
	newXp: number
	oldLevel: number
	newLevel: number
	leveledDown: boolean
}

export interface XPSetResult {
	oldXp: number
	newXp: number
	oldLevel: number
	newLevel: number
}

export interface RecalcResult {
	oldLevel: number
	newLevel: number
	totalXp: number
	reconciled: boolean
}

/**
 * Adds XP to a user, computes level changes, and emits events.
 * Events are emitted after persistence for consistency.
 * Role reconciliation happens automatically via event listeners.
 *
 * @param guildId - Guild snowflake ID
 * @param userId - User snowflake ID
 * @param amount - Amount of XP to add (must be positive)
 * @param options - Optional settings like reason
 * @returns Result object with old/new XP, levels, and leveledUp flag
 */
export async function addXP(
	guildId: string,
	userId: string,
	amount: number,
	options?: AddXPOptions
): Promise<XPChangeResult> {
	try {
		// Validate inputs
		if (amount < 0) {
			throw new Error('Amount must be non-negative. Use removeXP for removing XP.')
		}
		if (!guildId || !userId) {
			throw new Error('Invalid guildId or userId')
		}

		// Load or create user record
		let user = await store.getUser(guildId, userId)
		if (!user) {
			user = {
				xp: 0,
				level: 0,
				lastAwardedAt: 0,
				messages: 0,
				xpMessages: 0
			}
		}

		const oldXp = user.xp
		const oldLevel = user.level

		// Calculate new XP
		const newXp = oldXp + amount

		// Compute new level
		const levelData = math.computeLevelFromTotalXp(newXp)
		const newLevel = levelData.level

		// Update user record
		const updatedUser: UserXP = {
			...user,
			xp: newXp,
			level: newLevel
		}

		// Persist changes
		await store.putUser(guildId, userId, updatedUser)

		// Emit events after persistence
		events.emitXPChange({
			guildId,
			userId,
			oldXp,
			newXp,
			delta: amount,
			reason: options?.reason
		})

		// Emit level change events if needed
		if (newLevel > oldLevel) {
			events.emitLevelUp({
				guildId,
				userId,
				oldLevel,
				newLevel,
				totalXp: newXp
			})
		} else if (newLevel < oldLevel) {
			events.emitLevelDown({
				guildId,
				userId,
				oldLevel,
				newLevel,
				totalXp: newXp
			})
		}

		return {
			oldXp,
			newXp,
			oldLevel,
			newLevel,
			leveledUp: newLevel > oldLevel
		}
	} catch (error) {
		logger.error('Error adding XP:', error)
		throw error
	}
}

/**
 * Removes XP from a user (calls addXP with negative amount).
 * Ensures XP doesn't go below 0.
 *
 * @param guildId - Guild snowflake ID
 * @param userId - User snowflake ID
 * @param amount - Amount of XP to remove (must be positive)
 * @param options - Optional settings like reason
 * @returns Result object with old/new XP, levels, and leveledDown flag
 */
export async function removeXP(
	guildId: string,
	userId: string,
	amount: number,
	options?: AddXPOptions
): Promise<XPRemoveResult> {
	try {
		// Validate inputs
		if (amount < 0) {
			throw new Error('Amount must be non-negative')
		}
		if (!guildId || !userId) {
			throw new Error('Invalid guildId or userId')
		}

		// Validate user exists
		const user = await store.getUser(guildId, userId)
		if (!user) {
			throw new Error('User not found')
		}

		const oldXp = user.xp
		const oldLevel = user.level

		// Ensure XP doesn't go below 0
		const newXp = Math.max(0, oldXp - amount)
		const actualRemoved = oldXp - newXp

		// Compute new level
		const levelData = math.computeLevelFromTotalXp(newXp)
		const newLevel = levelData.level

		// Update user record
		const updatedUser: UserXP = {
			...user,
			xp: newXp,
			level: newLevel
		}

		// Persist changes
		await store.putUser(guildId, userId, updatedUser)

		// Emit events after persistence
		events.emitXPChange({
			guildId,
			userId,
			oldXp,
			newXp,
			delta: -actualRemoved,
			reason: options?.reason
		})

		// Emit level change events if needed
		if (newLevel < oldLevel) {
			events.emitLevelDown({
				guildId,
				userId,
				oldLevel,
				newLevel,
				totalXp: newXp
			})
		} else if (newLevel > oldLevel) {
			events.emitLevelUp({
				guildId,
				userId,
				oldLevel,
				newLevel,
				totalXp: newXp
			})
		}

		return {
			oldXp,
			newXp,
			oldLevel,
			newLevel,
			leveledDown: newLevel < oldLevel
		}
	} catch (error) {
		logger.error('Error removing XP:', error)
		throw error
	}
}

/**
 * Sets absolute XP value for a user.
 *
 * @param guildId - Guild snowflake ID
 * @param userId - User snowflake ID
 * @param totalXp - New total XP (must be non-negative)
 * @param options - Optional settings like reason
 * @returns Result object with old/new XP and levels
 */
export async function setXP(
	guildId: string,
	userId: string,
	totalXp: number,
	options?: AddXPOptions
): Promise<XPSetResult> {
	try {
		// Validate inputs
		if (totalXp < 0) {
			throw new Error('Total XP must be non-negative')
		}
		if (!guildId || !userId) {
			throw new Error('Invalid guildId or userId')
		}

		// Load or create user record
		let user = await store.getUser(guildId, userId)
		if (!user) {
			user = {
				xp: 0,
				level: 0,
				lastAwardedAt: 0,
				messages: 0,
				xpMessages: 0
			}
		}

		const oldXp = user.xp
		const oldLevel = user.level

		// Calculate delta
		const delta = totalXp - oldXp

		// Compute new level
		const levelData = math.computeLevelFromTotalXp(totalXp)
		const newLevel = levelData.level

		// Update user record
		const updatedUser: UserXP = {
			...user,
			xp: totalXp,
			level: newLevel
		}

		// Persist changes
		await store.putUser(guildId, userId, updatedUser)

		// Emit events after persistence
		events.emitXPChange({
			guildId,
			userId,
			oldXp,
			newXp: totalXp,
			delta,
			reason: options?.reason
		})

		// Emit level change events if needed
		if (newLevel > oldLevel) {
			events.emitLevelUp({
				guildId,
				userId,
				oldLevel,
				newLevel,
				totalXp
			})
		} else if (newLevel < oldLevel) {
			events.emitLevelDown({
				guildId,
				userId,
				oldLevel,
				newLevel,
				totalXp
			})
		}

		return {
			oldXp,
			newXp: totalXp,
			oldLevel,
			newLevel
		}
	} catch (error) {
		logger.error('Error setting XP:', error)
		throw error
	}
}

/**
 * Recalculates level from total XP and reconciles roles.
 * Useful for fixing inconsistencies after config changes or manual database edits.
 *
 * @param guildId - Guild snowflake ID
 * @param userId - User snowflake ID
 * @returns Result object with old/new levels and reconciliation status
 */
export async function recalcLevel(guildId: string, userId: string): Promise<RecalcResult> {
	try {
		// Validate inputs
		if (!guildId || !userId) {
			throw new Error('Invalid guildId or userId')
		}

		// Load user record
		const user = await store.getUser(guildId, userId)
		if (!user) {
			throw new Error('User not found')
		}

		const oldLevel = user.level
		const totalXp = user.xp

		// Compute correct level
		const levelData = math.computeLevelFromTotalXp(totalXp)
		const newLevel = levelData.level

		// Check if reconciliation needed
		if (newLevel !== oldLevel) {
			// Update user record with correct level
			const updatedUser: UserXP = {
				...user,
				level: newLevel
			}

			// Persist changes
			await store.putUser(guildId, userId, updatedUser)

			// Emit level change event
			if (newLevel > oldLevel) {
				events.emitLevelUp({
					guildId,
					userId,
					oldLevel,
					newLevel,
					totalXp
				})
			} else {
				events.emitLevelDown({
					guildId,
					userId,
					oldLevel,
					newLevel,
					totalXp
				})
			}

			return {
				oldLevel,
				newLevel,
				totalXp,
				reconciled: true
			}
		}

		return {
			oldLevel,
			newLevel,
			totalXp,
			reconciled: false
		}
	} catch (error) {
		logger.error('Error recalculating level:', error)
		throw error
	}
}

/**
 * Returns user's total XP (0 if not found).
 *
 * @param guildId - Guild snowflake ID
 * @param userId - User snowflake ID
 * @returns Total XP
 */
export async function getXP(guildId: string, userId: string): Promise<number> {
	try {
		const user = await store.getUser(guildId, userId)
		return user?.xp ?? 0
	} catch (error) {
		logger.error('Error getting XP:', error)
		return 0
	}
}

/**
 * Returns user's level (0 if not found).
 *
 * @param guildId - Guild snowflake ID
 * @param userId - User snowflake ID
 * @returns User level
 */
export async function getLevel(guildId: string, userId: string): Promise<number> {
	try {
		const user = await store.getUser(guildId, userId)
		return user?.level ?? 0
	} catch (error) {
		logger.error('Error getting level:', error)
		return 0
	}
}

/**
 * Returns full user XP record.
 *
 * @param guildId - Guild snowflake ID
 * @param userId - User snowflake ID
 * @returns User XP record or null if not found
 */
export async function getUserData(guildId: string, userId: string): Promise<UserXP | null> {
	try {
		return await store.getUser(guildId, userId)
	} catch (error) {
		logger.error('Error getting user data:', error)
		return null
	}
}
