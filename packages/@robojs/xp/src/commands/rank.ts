/**
 * /rank [user] command
 *
 * Displays user rank card with level, XP progress, rank position, and active multipliers.
 * Supports theme customization via guild config.
 */

import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { getConfig } from '../config.js'
import { getUserData } from '../core/xp.js'
import { computeLevelFromTotalXp, progressInLevel } from '../math/curve.js'
import { resolveMultiplier } from '../math/multiplier.js'
import { getUserRank } from '../runtime/service.js'
import {
	requireGuild,
	createErrorEmbed,
	createInfoEmbed,
	formatXP,
	formatLevel,
	formatRank,
	formatMultiplier,
	formatPercentage,
	createProgressBar,
	getEmbedColor
} from '../core/utils.js'

/**
 * Command configuration
 */
export const config: CommandConfig = {
	description: "View your rank or another user's rank",
	dmPermission: false,
	options: [
		{
			name: 'user',
			description: 'User to view rank for (defaults to you)',
			type: 'user',
			required: false
		}
	]
}

/**
 * Command handler
 */
export default async function (interaction: ChatInputCommandInteraction): Promise<CommandResult> {
	try {
		// Validate guild context
		const guildCheck = requireGuild(interaction)
		if (typeof guildCheck === 'string') {
			return {
				embeds: [createErrorEmbed('Error', guildCheck)],
				ephemeral: true
			}
		}
		const { guildId } = guildCheck

		// Get target user (defaults to command invoker)
		const targetUser = interaction.options.getUser('user') ?? interaction.user

		// Validate user is not a bot
		if (targetUser.bot) {
			return {
				embeds: [createErrorEmbed('Error', 'Cannot view rank for bots')],
				ephemeral: true
			}
		}

		// Load guild configuration
		const guildConfig = await getConfig(guildId)

		// Get user XP data
		const userData = await getUserData(guildId, targetUser.id)
		if (!userData || userData.xp === 0) {
			return {
				embeds: [createErrorEmbed('No Data', `${targetUser.username} has no XP in this server`)],
				ephemeral: true
			}
		}

		// Get user rank position
		const rankData = await getUserRank(guildId, targetUser.id)
		if (!rankData) {
			return {
				embeds: [createErrorEmbed('Error', 'Failed to calculate rank position')],
				ephemeral: true
			}
		}

		// Compute level progress
		const progress = computeLevelFromTotalXp(userData.xp)
		const progressData = progressInLevel(userData.xp)

		// Calculate effective multiplier
		let effectiveMultiplier = 1.0
		try {
			// Fetch guild member to get roles
			const member =
				interaction.guild?.members.cache.get(targetUser.id) ??
				(await interaction.guild?.members.fetch(targetUser.id))

			if (member) {
				const roleIds = Array.from(member.roles.cache.keys())
				effectiveMultiplier = resolveMultiplier(guildConfig, roleIds, targetUser.id)
			}
		} catch (error) {
			logger.warn(`Failed to fetch member for multiplier calculation: ${error}`)
			// Continue with default multiplier 1.0
		}

		// Build progress bar (15 characters)
		const progressBar = createProgressBar(progress.inLevel, progress.inLevel + progress.toNext, 15)

		// Build rank card embed
		const embedColor = getEmbedColor(guildConfig)
		const fields = [
			{
				name: 'Rank',
				value: `${formatRank(rankData.rank)} / ${rankData.total.toLocaleString('en-US')}`,
				inline: true
			},
			{
				name: 'Level',
				value: formatLevel(progress.level),
				inline: true
			},
			{
				name: 'XP',
				value: formatXP(userData.xp),
				inline: true
			},
			{
				name: 'Progress',
				value: `${progressBar} ${formatPercentage(progressData.percentage)}`,
				inline: false
			},
			{
				name: 'XP in Level',
				value: `${progress.inLevel.toLocaleString('en-US')} / ${(progress.inLevel + progress.toNext).toLocaleString('en-US')} XP`,
				inline: false
			},
			{
				name: 'Next Level',
				value: `${formatXP(progress.toNext)} remaining`,
				inline: false
			},
			{
				name: 'Messages',
				value: userData.messages.toLocaleString('en-US'),
				inline: true
			}
		]

		// Add multiplier field if active
		if (effectiveMultiplier !== 1.0) {
			fields.push({
				name: 'Active Multipliers',
				value: formatMultiplier(effectiveMultiplier),
				inline: true
			})
		}

		const embed = createInfoEmbed(`Rank Card - ${targetUser.username}`, '', fields, embedColor).setThumbnail(
			targetUser.displayAvatarURL()
		)

		// Add footer with last activity
		if (userData.lastAwardedAt > 0) {
			embed.setFooter({
				text: `Last active: ${new Date(userData.lastAwardedAt).toLocaleString()}`
			})
		}

		return {
			embeds: [embed]
		}
	} catch (error) {
		logger.error('Error in /rank command:', error)
		return {
			embeds: [createErrorEmbed('Error', 'An unexpected error occurred while fetching rank data')],
			ephemeral: true
		}
	}
}
