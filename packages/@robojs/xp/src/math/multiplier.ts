import type { GuildConfig } from '~/types.js'

/**
 * Extracts the server-wide XP multiplier from the guild configuration.
 *
 * @param config - The guild configuration
 * @returns The server multiplier (default: 1.0)
 *
 * @example
 * ```typescript
 * const config = { multipliers: { server: 2.0 } }
 * const multiplier = getServerMultiplier(config) // 2.0
 * ```
 */
export function getServerMultiplier(config: GuildConfig): number {
	return config.multipliers?.server ?? 1.0
}

/**
 * Finds the maximum role multiplier among a user's roles.
 *
 * When a user has multiple roles with different multipliers,
 * the highest multiplier is selected. This follows standard multiplier behavior
 * where role multipliers don't stack additively.
 *
 * @param config - The guild configuration
 * @param roleIds - Array of role IDs the user has
 * @returns The maximum role multiplier (default: 1.0)
 *
 * @example
 * ```typescript
 * const config = {
 *   multipliers: {
 *     role: {
 *       'role1': 1.2,
 *       'role2': 1.8,
 *       'role3': 1.5
 *     }
 *   }
 * }
 * const roleIds = ['role1', 'role2', 'role4']
 * const multiplier = getMaxRoleMultiplier(config, roleIds) // 1.8 (max of 1.2 and 1.8)
 * ```
 */
export function getMaxRoleMultiplier(config: GuildConfig, roleIds: string[]): number {
	if (!roleIds || roleIds.length === 0) {
		return 1.0
	}

	if (!config.multipliers?.role) {
		return 1.0
	}

	let maxMultiplier: number | undefined
	for (const roleId of roleIds) {
		const roleMultiplier = config.multipliers.role[roleId]
		if (roleMultiplier !== undefined) {
			if (maxMultiplier === undefined || roleMultiplier > maxMultiplier) {
				maxMultiplier = roleMultiplier
			}
		}
	}

	return maxMultiplier ?? 1.0
}

/**
 * Extracts the user-specific XP multiplier from the guild configuration.
 *
 * This provides a personal XP boost feature (e.g., +50% with multiplier 1.5).
 * For example, a multiplier of 1.5 represents a +50% boost.
 *
 * @param config - The guild configuration
 * @param userId - The user ID to check
 * @returns The user multiplier (default: 1.0)
 *
 * @example
 * ```typescript
 * const config = { multipliers: { user: { 'user123': 1.5 } } }
 * const multiplier = getUserMultiplier(config, 'user123') // 1.5 (+50% boost)
 * ```
 */
export function getUserMultiplier(config: GuildConfig, userId: string): number {
	return config.multipliers?.user?.[userId] ?? 1.0
}

/**
 * Resolves the effective XP multiplier for a user based on server, role, and user multipliers.
 *
 * **Resolution Order:**
 * 1. Server multiplier (applies to everyone)
 * 2. Maximum role multiplier (highest among user's roles)
 * 3. User multiplier (personal boost)
 *
 * **Formula:** `server × max(role) × user`
 *
 * Multipliers stack multiplicatively, not additively. For example:
 * - Server: 2.0x, Role: 1.5x, User: 1.5x → Final: 4.5x (2.0 × 1.5 × 1.5)
 * - Server: 1.0x, Role: 1.2x, User: 1.0x → Final: 1.2x (1.0 × 1.2 × 1.0)
 *
 * @param config - The guild configuration containing multiplier settings
 * @param userRoleIds - Array of role IDs the user has
 * @param userId - The user ID to resolve multiplier for
 * @returns The effective multiplier to apply to base XP
 *
 * @example
 * ```typescript
 * const config = {
 *   multipliers: {
 *     server: 2.0,
 *     role: {
 *       'moderator': 1.5,
 *       'contributor': 1.2
 *     },
 *     user: {
 *       'user123': 1.5
 *     }
 *   }
 * }
 *
 * // User with moderator and contributor roles
 * const multiplier = resolveMultiplier(config, ['moderator', 'contributor'], 'user123')
 * // Result: 4.5 (2.0 × 1.5 × 1.5) - max role is 1.5
 *
 * // User with no multipliers
 * const defaultMultiplier = resolveMultiplier({}, [], 'user456')
 * // Result: 1.0 (no modification)
 * ```
 */
export function resolveMultiplier(config: GuildConfig, userRoleIds: string[], userId: string): number {
	// Start with base multiplier
	let multiplier = 1.0

	// Apply server multiplier
	multiplier *= getServerMultiplier(config)

	// Apply maximum role multiplier
	multiplier *= getMaxRoleMultiplier(config, userRoleIds)

	// Apply user-specific multiplier
	multiplier *= getUserMultiplier(config, userId)

	return Math.round(multiplier * 1000) / 1000
}
