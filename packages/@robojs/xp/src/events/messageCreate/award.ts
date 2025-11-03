import type { Message } from 'discord.js'
import { logger } from 'robo.js'
import * as config from '~/config.js'
import * as store from '~/store/index.js'
import * as math from '~/math/curve.js'
import { resolveMultiplier } from '~/math/multiplier.js'
import * as events from '~/runtime/events.js'

/**
 * Awards XP to users for sending messages in text channels.
 *
 * This handler implements the core XP awarding mechanics:
 * - Random 15-25 base XP per message
 * - Cooldown enforcement (per-user)
 * - Channel and role exclusions (No-XP lists)
 * - Multiplier resolution (server × max(role) × user)
 * - Level change detection and event emission
 *
 * Early exits for:
 * - Bot messages
 * - DMs (no guild context)
 * - Non-text channels
 * - No-XP channels
 * - No-XP roles
 * - Within cooldown period
 */
export default async function (message: Message) {
	try {
		// Ignore bot messages
		if (message.author.bot) {
			return
		}

		// Require guild context (DMs don't award XP)
		if (!message.guild || !message.member) {
			return
		}

		// Text channels only
		if (!message.channel.isTextBased() || message.channel.isDMBased()) {
			return
		}

		const guildId = message.guild.id
		const userId = message.author.id
		const channelId = message.channel.id

		// Load user record early to track total messages
		const existingUser = await store.getUser(guildId, userId)

		// Calculate new total messages count (increments for all valid guild text messages)
		const newMessagesCount = (existingUser?.messages ?? 0) + 1

		// Load guild configuration
		const guildConfig = await config.getConfig(guildId)

		// Check No-XP channels
		const isNoXpChannel = guildConfig.noXpChannelIds.includes(channelId)

		// Check No-XP roles
		const userRoleIds = Array.from(message.member.roles.cache.keys())
		const hasNoXpRole = userRoleIds.some((roleId) => guildConfig.noXpRoleIds.includes(roleId))

		// Enforce cooldown
		const timeSinceLastAward = existingUser ? Date.now() - existingUser.lastAwardedAt : Infinity
		const cooldownMs = guildConfig.cooldownSeconds * 1000
		const isInCooldown = timeSinceLastAward < cooldownMs

		// Determine if XP should be awarded
		const shouldAwardXp = !isNoXpChannel && !hasNoXpRole && !isInCooldown

		// Build user object with messages count
		let updatedUser = {
			xp: existingUser?.xp ?? 0,
			level: existingUser?.level ?? 0,
			lastAwardedAt: existingUser?.lastAwardedAt ?? 0,
			messages: newMessagesCount,
			xpMessages: existingUser?.xpMessages ?? 0
		}

		// Store old values for event emission
		const oldXp = updatedUser.xp
		const oldLevel = updatedUser.level

		// Award XP if all checks pass
		if (shouldAwardXp) {
			// Generate random base XP (15-25 inclusive)
			const baseXp = Math.floor(Math.random() * 11) + 15

			// Calculate effective multiplier
			const multiplier = resolveMultiplier(guildConfig, userRoleIds, userId)

			// Early exit if multiplier is 0 (manual XP control mode)
			if (multiplier === 0) {
				// Persist messages count without awarding XP
				await store.putUser(guildId, userId, updatedUser)
				return
			}

			// Apply rate and multiplier
			const finalXp = Math.floor(baseXp * guildConfig.xpRate * multiplier)

			// Calculate new XP and level
			const newXp = oldXp + finalXp
			const newLevel = math.computeLevelFromTotalXp(newXp).level

			// Update user object with XP fields
			updatedUser = {
				xp: newXp,
				level: newLevel,
				lastAwardedAt: Date.now(),
				messages: newMessagesCount,
				xpMessages: updatedUser.xpMessages + 1
			}

			// Persist to Flashcore (single write path)
			await store.putUser(guildId, userId, updatedUser)

			// Emit level change events
			if (newLevel > oldLevel) {
				events.emitLevelUp({
					guildId,
					userId,
					storeId: 'default',
					oldLevel,
					newLevel,
					totalXp: newXp
				})
			} else if (newLevel < oldLevel) {
				events.emitLevelDown({
					guildId,
					userId,
					storeId: 'default',
					oldLevel,
					newLevel,
					totalXp: newXp
				})
			}

			// Always emit XP change event when XP is awarded
			events.emitXPChange({
				guildId,
				userId,
				storeId: 'default',
				oldXp,
				newXp,
				delta: finalXp,
				reason: 'message'
			})
		} else {
			// Persist messages count even when XP is not awarded (single write path)
			await store.putUser(guildId, userId, updatedUser)
		}
	} catch (error) {
		logger.error('Failed to award XP:', error)
		// Silently fail to avoid disrupting message flow
	}
}
