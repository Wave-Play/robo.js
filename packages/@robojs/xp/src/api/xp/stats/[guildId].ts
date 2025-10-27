import type { RoboRequest } from '@robojs/server'
import { leaderboard, config } from '@robojs/xp'
import { wrapHandler, success, getGuildFromRequest, validateMethod } from '../utils.js'

/**
 * Guild Statistics Endpoint
 *
 * Provides high-level guild statistics for dashboards and analytics.
 *
 * **WARNING: This endpoint is currently unauthenticated.**
 * Recommend restricting access to administrators only in production.
 *
 * **Performance Considerations:**
 * - Top user data from cached leaderboard (fast)
 * - Total XP calculation requires loading all users (expensive for large guilds)
 * - Consider the performance impact for guilds with thousands of users
 *
 * **Use Cases:**
 * - Dashboard overview pages
 * - Analytics and reporting
 * - Guild comparison tools
 * - Admin monitoring
 *
 * **Route:**
 * - GET /api/xp/stats/:guildId - Get guild statistics
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Validate method
	validateMethod(request, ['GET'])

	const { guildId } = request.params

	// Validate guild
	await getGuildFromRequest(request)

	// Get leaderboard data for total count and top user
	const leaderboardResult = await leaderboard.get(guildId, 0, 1)

	// Get guild config
	const guildConfig = await config.get(guildId)

	// Calculate config statistics
	const rewardsCount = guildConfig.roleRewards?.length || 0
	let multipliersCount = 0
	if (guildConfig.multipliers) {
		if (guildConfig.multipliers.server) multipliersCount++
		if (guildConfig.multipliers.role) multipliersCount += Object.keys(guildConfig.multipliers.role).length
		if (guildConfig.multipliers.user) multipliersCount += Object.keys(guildConfig.multipliers.user).length
	}

	// Build response
	const response: {
		users: {
			total: number
			topUser?: {
				userId: string
				xp: number
				level: number
			}
		}
		xp: {
			total?: number
		}
		config: {
			cooldownSeconds: number
			xpRate: number
			rewardsCount: number
			multipliersCount: number
		}
		leaderboard: {
			public: boolean
		}
	} = {
		users: {
			total: leaderboardResult.total
		},
		xp: {},
		config: {
			cooldownSeconds: guildConfig.cooldownSeconds,
			xpRate: guildConfig.xpRate,
			rewardsCount,
			multipliersCount
		},
		leaderboard: {
			public: guildConfig.leaderboard?.public || false
		}
	}

	// Add top user if available
	if (leaderboardResult.entries.length > 0) {
		const topUser = leaderboardResult.entries[0]
		response.users.topUser = {
			userId: topUser.userId,
			xp: topUser.xp,
			level: topUser.level
		}
	}

	// Note: Total XP calculation is omitted as it would require loading all users
	// which could be expensive for large guilds. Consider adding as optional query parameter.

	return success(response)
})
