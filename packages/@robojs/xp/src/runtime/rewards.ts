/**
 * Role rewards system for XP leveling
 *
 * Role rewards only process events from the default store to avoid conflicts.
 * Custom stores (e.g., reputation, credits) do not trigger role assignments.
 *
 * This design prevents situations where parallel progression systems would
 * grant Discord roles, which should only come from the primary leveling system.
 */
import { client, logger } from 'robo.js'
import { PermissionFlagsBits } from 'discord.js'
import type { Guild, GuildMember, Role } from 'discord.js'
import * as events from './events.js'
import { getConfig } from '../config.js'
import type { LevelUpEvent, LevelDownEvent, GuildConfig, RoleReward, RewardsMode } from '../types.js'

/**
 * Checks if the bot can manage a specific role
 */
function canBotManageRole(botMember: GuildMember, role: Role): { canManage: boolean; reason?: string } {
	if (role.managed) {
		return { canManage: false, reason: 'Role is managed by integration' }
	}

	if (botMember.roles.highest.comparePositionTo(role) <= 0) {
		return { canManage: false, reason: 'Bot role is not high enough' }
	}

	return { canManage: true }
}

/**
 * Applies role rewards in stack mode (user accumulates all qualifying roles)
 */
async function applyStackMode(
	member: GuildMember,
	botMember: GuildMember,
	roleRewards: RoleReward[],
	userLevel: number
): Promise<void> {
	const qualifyingRewards = roleRewards.filter((reward) => reward.level <= userLevel)

	for (const reward of qualifyingRewards) {
		try {
			// Fetch role
			const role = member.guild.roles.cache.get(reward.roleId) ?? (await member.guild.roles.fetch(reward.roleId))

			if (!role) {
				logger.warn('Role reward not found in guild', {
					guildId: member.guild.id,
					userId: member.id,
					roleId: reward.roleId,
					level: reward.level
				})
				continue
			}

			// Check if bot can manage the role
			const { canManage, reason } = canBotManageRole(botMember, role)
			if (!canManage) {
				logger.warn(`Cannot assign role reward: ${reason}`, {
					guildId: member.guild.id,
					userId: member.id,
					roleId: reward.roleId,
					level: reward.level,
					reason
				})
				continue
			}

			// Add role if member doesn't already have it
			if (!member.roles.cache.has(reward.roleId)) {
				await member.roles.add(role, 'XP level reward')
				logger.debug('Added role reward', {
					guildId: member.guild.id,
					userId: member.id,
					roleId: reward.roleId,
					level: reward.level
				})
			}
		} catch (error) {
			logger.error('Error adding role reward', {
				guildId: member.guild.id,
				userId: member.id,
				roleId: reward.roleId,
				level: reward.level,
				error
			})
		}
	}
}

/**
 * Applies role rewards in replace mode (user gets only the highest qualifying role)
 */
async function applyReplaceMode(
	member: GuildMember,
	botMember: GuildMember,
	roleRewards: RoleReward[],
	userLevel: number
): Promise<void> {
	// Find highest qualifying reward
	const qualifyingRewards = roleRewards.filter((reward) => reward.level <= userLevel)
	const sortedQualifying = [...qualifyingRewards].sort((a, b) => b.level - a.level)
	const targetReward = sortedQualifying[0]

	// Process each reward role
	for (const reward of roleRewards) {
		try {
			const role = member.guild.roles.cache.get(reward.roleId) ?? (await member.guild.roles.fetch(reward.roleId))

			if (!role) {
				logger.warn('Role reward not found in guild', {
					guildId: member.guild.id,
					userId: member.id,
					roleId: reward.roleId,
					level: reward.level
				})
				continue
			}

			// Check if bot can manage the role
			const { canManage, reason } = canBotManageRole(botMember, role)
			if (!canManage) {
				logger.warn(`Cannot manage role reward: ${reason}`, {
					guildId: member.guild.id,
					userId: member.id,
					roleId: reward.roleId,
					level: reward.level,
					reason
				})
				continue
			}

			// If this is the target role, ensure member has it
			if (targetReward && reward.roleId === targetReward.roleId) {
				if (!member.roles.cache.has(reward.roleId)) {
					await member.roles.add(role, 'XP level reward')
					logger.debug('Added role reward', {
						guildId: member.guild.id,
						userId: member.id,
						roleId: reward.roleId,
						level: reward.level
					})
				}
			}
			// If member has this role but it's not the target, remove it
			else if (member.roles.cache.has(reward.roleId)) {
				await member.roles.remove(role, 'XP level reward (replace mode)')
				logger.debug('Removed role reward (replace mode)', {
					guildId: member.guild.id,
					userId: member.id,
					roleId: reward.roleId
				})
			}
		} catch (error) {
			logger.error('Error managing role reward in replace mode', {
				guildId: member.guild.id,
				userId: member.id,
				roleId: reward.roleId,
				level: reward.level,
				error
			})
		}
	}
}

/**
 * Main reconciliation function for role rewards
 *
 * This function is only called for default store events by the event listeners.
 * Manual calls to this function should typically use the default store to avoid
 * unexpected role assignments from custom stores.
 *
 * @warning Calling this for custom stores may cause unexpected role assignments
 */
export async function reconcileRoleRewards(
	guildId: string,
	userId: string,
	newLevel: number,
	guildConfig: GuildConfig
): Promise<void> {
	try {
		// Guard: Ensure client and guilds API are available
		if (!client?.guilds) {
			logger.warn('Robo.js client not initialized; cannot reconcile role rewards', { guildId, userId })
			return
		}

		// Fetch guild
		const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId))
		if (!guild) {
			logger.warn('Guild not found for role rewards reconciliation', { guildId, userId })
			return
		}

		// Fetch member
		const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId))
		if (!member) {
			logger.warn('Member not found for role rewards reconciliation', { guildId, userId })
			return
		}

		// Get bot member
		const botMember = guild.members.me
		if (!botMember) {
			logger.warn('Bot member not found for role rewards reconciliation', { guildId, userId })
			return
		}

		// Check ManageRoles permission
		if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
			logger.warn('Bot lacks ManageRoles permission for role rewards', { guildId, userId })
			return
		}

		// Deduplicate rewards: keep highest level reward per roleId
		const rewardsByRoleId = new Map<string, RoleReward>()
		for (const reward of guildConfig.roleRewards) {
			const existing = rewardsByRoleId.get(reward.roleId)
			if (!existing || reward.level > existing.level) {
				rewardsByRoleId.set(reward.roleId, reward)
			}
		}

		// Sort deduplicated rewards by level for deterministic processing
		const sortedRewards = Array.from(rewardsByRoleId.values()).sort((a, b) => a.level - b.level)

		// Apply rewards based on mode
		const mode = guildConfig.rewardsMode ?? 'stack'
		if (mode === 'stack') {
			await applyStackMode(member, botMember, sortedRewards, newLevel)
		} else {
			await applyReplaceMode(member, botMember, sortedRewards, newLevel)
		}
	} catch (error) {
		logger.error('Error reconciling role rewards', { guildId, userId, newLevel, error })
	}
}

/**
 * Handles level down events, removing roles if configured
 *
 * This function is only called for default store events.
 * Role removal only applies to the default store.
 */
async function handleLevelDown(
	guildId: string,
	userId: string,
	newLevel: number,
	guildConfig: GuildConfig
): Promise<void> {
	// Only process if removeRewardOnXpLoss is enabled
	if (!guildConfig.removeRewardOnXpLoss) {
		logger.debug('Skipping level down role reconciliation (removeRewardOnXpLoss is false)', {
			guildId,
			userId,
			newLevel
		})
		return
	}

	try {
		// Guard: Ensure client and guilds API are available
		if (!client?.guilds) {
			logger.warn('Robo.js client not initialized; cannot handle level down', { guildId, userId })
			return
		}

		// Fetch guild
		const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId))
		if (!guild) {
			logger.warn('Guild not found for level down reconciliation', { guildId, userId })
			return
		}

		// Fetch member
		const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId))
		if (!member) {
			logger.warn('Member not found for level down reconciliation', { guildId, userId })
			return
		}

		// Get bot member
		const botMember = guild.members.me
		if (!botMember) {
			logger.warn('Bot member not found for level down reconciliation', { guildId, userId })
			return
		}

		// Check ManageRoles permission
		if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
			logger.warn('Bot lacks ManageRoles permission for level down reconciliation', { guildId, userId })
			return
		}

		const mode = guildConfig.rewardsMode ?? 'stack'

		if (mode === 'stack') {
			// Remove roles where reward.level > newLevel
			const rolesToRemove = guildConfig.roleRewards.filter((reward) => reward.level > newLevel)

			for (const reward of rolesToRemove) {
				try {
					const role = guild.roles.cache.get(reward.roleId) ?? (await guild.roles.fetch(reward.roleId))

					if (!role) {
						logger.warn('Role not found for level down removal', {
							guildId,
							userId,
							roleId: reward.roleId,
							level: reward.level
						})
						continue
					}

					// Check if bot can manage the role
					const { canManage, reason } = canBotManageRole(botMember, role)
					if (!canManage) {
						logger.warn(`Cannot remove role reward: ${reason}`, {
							guildId,
							userId,
							roleId: reward.roleId,
							level: reward.level,
							reason
						})
						continue
					}

					// Remove role if member has it
					if (member.roles.cache.has(reward.roleId)) {
						await member.roles.remove(role, 'XP level reward (level down)')
						logger.debug('Removed role reward (level down)', {
							guildId,
							userId,
							roleId: reward.roleId,
							level: reward.level
						})
					}
				} catch (error) {
					logger.error('Error removing role reward on level down', {
						guildId,
						userId,
						roleId: reward.roleId,
						level: reward.level,
						error
					})
				}
			}
		} else {
			// Replace mode: always reconcile (user should only have highest qualifying role)
			await reconcileRoleRewards(guildId, userId, newLevel, guildConfig)
		}
	} catch (error) {
		logger.error('Error handling level down', { guildId, userId, newLevel, error })
	}
}

// Register event listeners
events.on('levelUp', async (event: LevelUpEvent) => {
	try {
		const { guildId, userId, newLevel, storeId } = event

		// Role rewards only apply to default store
		if (storeId !== 'default') {
			logger.debug('Skipping role rewards for non-default store', { guildId, userId, storeId })
			return
		}

		// Load guild config
		const guildConfig = await getConfig(guildId)

		// Return early if no rewards configured
		if (guildConfig.roleRewards.length === 0) {
			return
		}

		// Reconcile role rewards
		await reconcileRoleRewards(guildId, userId, newLevel, guildConfig)
	} catch (error) {
		logger.error('Error handling levelUp event for role rewards', { event, error })
	}
})

events.on('levelDown', async (event: LevelDownEvent) => {
	try {
		const { guildId, userId, newLevel, storeId } = event

		// Role removal only applies to default store
		if (storeId !== 'default') {
			logger.debug('Skipping role removal for non-default store', { guildId, userId, storeId })
			return
		}

		// Load guild config
		const guildConfig = await getConfig(guildId)

		// Return early if no rewards configured
		if (guildConfig.roleRewards.length === 0) {
			return
		}

		// Handle level down
		await handleLevelDown(guildId, userId, newLevel, guildConfig)
	} catch (error) {
		logger.error('Error handling levelDown event for role rewards', { event, error })
	}
})
