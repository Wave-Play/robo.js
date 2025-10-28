import type { RoboRequest } from '@robojs/server'
import { config } from '@robojs/xp'
import type { RoleReward } from '@robojs/xp'
import {
	wrapHandler,
	success,
	getGuildFromRequest,
	validateSnowflake,
	validateMethod,
	ERROR_CODES
} from '../../utils.js'

/**
 * Role Rewards Configuration Endpoint
 *
 * Handles CRUD operations for role rewards configuration.
 *
 * **WARNING: This endpoint is currently unauthenticated.**
 * In production, implement authentication and restrict access to administrators only.
 *
 * **Routes:**
 * - GET /api/xp/config/:guildId/rewards - List all role rewards
 * - POST /api/xp/config/:guildId/rewards - Add new role reward
 * - DELETE /api/xp/config/:guildId/rewards - Remove role reward by level
 */
export default wrapHandler(async (request: RoboRequest) => {
	const { guildId } = request.params

	// Validate guild
	await getGuildFromRequest(request)

	// Validate method
	validateMethod(request, ['GET', 'POST', 'DELETE'])

	switch (request.method) {
		case 'GET': {
			// List role rewards
			const guildConfig = await config.get(guildId)
			const rewards = guildConfig.roleRewards || []

			// Sort by level ascending
			const sortedRewards = [...rewards].sort((a, b) => a.level - b.level)

			return success({
				rewards: sortedRewards,
				mode: guildConfig.rewardsMode || 'stack',
				removeOnLoss: guildConfig.removeRewardOnXpLoss || false,
				count: sortedRewards.length
			})
		}

		case 'POST': {
			// Add role reward
			let body: unknown
			try {
				body = await request.json()
			} catch {
				const error = new Error('Invalid JSON in request body')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Validate body is an object
			if (typeof body !== 'object' || body === null || Array.isArray(body)) {
				const error = new Error('Request body must be an object')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Validate body is an object
			if (typeof body !== 'object' || body === null || Array.isArray(body)) {
				const error = new Error('Request body must be an object')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			const bodyObj = body as Record<string, unknown>
			const { level, roleId } = bodyObj

			// Validate level
			if (typeof level !== 'number' || !Number.isInteger(level) || level <= 0) {
				const error = new Error('Level must be a positive integer')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_LEVEL
				throw error
			}

			// Validate role ID
			if (typeof roleId !== 'string' || !validateSnowflake(roleId)) {
				const error = new Error('Role ID must be a valid Discord snowflake')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_ROLE_ID
				throw error
			}

			// Load current config
			const guildConfig = await config.get(guildId)
			const currentRewards = guildConfig.roleRewards || []

			// Check for duplicate level
			const existingReward = currentRewards.find((r: RoleReward) => r.level === level)
			if (existingReward) {
				const error = new Error(`Role reward already exists at level ${level}`)
				;(error as Error & { code: string }).code = ERROR_CODES.DUPLICATE_REWARD
				throw error
			}

			// Add new reward
			const newReward: RoleReward = { level, roleId }
			const updatedRewards = [...currentRewards, newReward].sort((a: RoleReward, b: RoleReward) => a.level - b.level)

			// Update config
			await config.set(guildId, { roleRewards: updatedRewards })

			return success({
				rewards: updatedRewards,
				added: newReward
			})
		}

		case 'DELETE': {
			// Remove role reward
			let body: unknown
			try {
				body = await request.json()
			} catch {
				const error = new Error('Invalid JSON in request body')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Validate body is an object
			if (typeof body !== 'object' || body === null || Array.isArray(body)) {
				const error = new Error('Request body must be an object')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			// Validate body is an object
			if (typeof body !== 'object' || body === null || Array.isArray(body)) {
				const error = new Error('Request body must be an object')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_REQUEST
				throw error
			}

			const bodyObj = body as Record<string, unknown>
			const { level } = bodyObj

			// Validate level
			if (typeof level !== 'number' || !Number.isInteger(level) || level <= 0) {
				const error = new Error('Level must be a positive integer')
				;(error as Error & { code: string }).code = ERROR_CODES.INVALID_LEVEL
				throw error
			}

			// Load current config
			const guildConfig = await config.get(guildId)
			const currentRewards = guildConfig.roleRewards || []

			// Find reward at level
			const rewardToRemove = currentRewards.find((r: RoleReward) => r.level === level)
			if (!rewardToRemove) {
				const error = new Error(`No role reward found at level ${level}`)
				;(error as Error & { code: string }).code = ERROR_CODES.REWARD_NOT_FOUND
				throw error
			}

			// Filter out reward
			const updatedRewards = currentRewards.filter((r: RoleReward) => r.level !== level)

			// Update config
			await config.set(guildId, { roleRewards: updatedRewards })

			return success({
				removed: rewardToRemove,
				remaining: updatedRewards
			})
		}

		default: {
			const error = new Error('Invalid method')
			;(error as Error & { code: string }).code = ERROR_CODES.METHOD_NOT_ALLOWED
			throw error
		}
	}
})
