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

		// Load guild configuration
		const guildConfig = await config.getConfig(guildId)

		// Check No-XP channels
		if (guildConfig.noXpChannelIds.includes(channelId)) {
			return
		}

		// Check No-XP roles
		const userRoleIds = Array.from(message.member.roles.cache.keys())
		const hasNoXpRole = userRoleIds.some((roleId) => guildConfig.noXpRoleIds.includes(roleId))
		if (hasNoXpRole) {
			return
		}

		// Load user record
		const existingUser = await store.getUser(guildId, userId)

		// Enforce cooldown
		if (existingUser) {
			const timeSinceLastAward = Date.now() - existingUser.lastAwardedAt
			const cooldownMs = guildConfig.cooldownSeconds * 1000
			if (timeSinceLastAward < cooldownMs) {
				return
			}
		}

		// Generate random base XP (15-25 inclusive)
		const baseXp = Math.floor(Math.random() * 11) + 15

		// Calculate effective multiplier
		const multiplier = resolveMultiplier(guildConfig, userRoleIds, userId)

		// Apply rate and multiplier
		const finalXp = Math.floor(baseXp * guildConfig.xpRate * multiplier)

		// Update or create user record
		const oldXp = existingUser?.xp ?? 0
		const oldLevel = existingUser?.level ?? 0
		const newXp = oldXp + finalXp
		const newLevel = math.computeLevelFromTotalXp(newXp).level

		const updatedUser = {
			xp: newXp,
			level: newLevel,
			lastAwardedAt: Date.now(),
			messages: (existingUser?.messages ?? 0) + 1
		}

		// Persist to Flashcore
		await store.putUser(guildId, userId, updatedUser)

		// Emit level change events
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

		// Always emit XP change event
		events.emitXPChange({
			guildId,
			userId,
			oldXp,
			newXp,
			delta: finalXp,
			reason: 'message'
		})
	} catch (error) {
		logger.error('Failed to award XP:', error)
		// Silently fail to avoid disrupting message flow
	}
}
