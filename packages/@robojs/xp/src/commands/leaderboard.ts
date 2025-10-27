/**
 * /leaderboard [page] command
 *
 * Displays paginated server XP leaderboard with top users.
 * Supports access control via config and theme customization.
 */

import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { getConfig } from '../config.js'
import { getLeaderboard } from '../runtime/service.js'
import {
	requireGuild,
	hasAdminPermission,
	createErrorEmbed,
	createInfoEmbed,
	formatXP,
	formatLevel,
	formatRank,
	formatUser,
	getEmbedColor
} from '../core/utils.js'

/**
 * Command configuration
 */
export const config: CommandConfig = {
	description: 'View the server XP leaderboard',
	dmPermission: false,
	options: [
		{
			name: 'page',
			description: 'Page number (default: 1)',
			type: 'integer',
			required: false,
			min: 1,
			max: 100
		}
	]
}

/**
 * Constants
 */
const ITEMS_PER_PAGE = 10

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

		// Get page number
		const page = interaction.options.getInteger('page') ?? 1

		// Load guild configuration
		const guildConfig = await getConfig(guildId)

		// Check access control
		if (!guildConfig.leaderboard.public && !hasAdminPermission(interaction)) {
			return {
				embeds: [
					createErrorEmbed(
						'Leaderboard Private',
						'The leaderboard is currently private. Contact a server administrator.'
					)
				],
				ephemeral: true
			}
		}

		// Calculate offset
		const offset = (page - 1) * ITEMS_PER_PAGE

		// Fetch leaderboard entries and total user count from service
		const { entries, total: totalUsers } = await getLeaderboard(guildId, offset, ITEMS_PER_PAGE)

		// Check if page exceeds available pages
		const totalPages = Math.ceil(totalUsers / ITEMS_PER_PAGE)
		if (page > totalPages && totalUsers > 0) {
			return {
				embeds: [
					createErrorEmbed(
						'Invalid Page',
						`Page ${page} exceeds available pages. There are only ${totalPages} page(s) available.`
					)
				],
				ephemeral: true
			}
		}

		// Handle empty leaderboard (prefer invalid-page error for valid deep pages with no entries)
		if (entries.length === 0) {
			// If we have users but no entries on this valid page, it's an invalid page
			if (totalUsers > 0) {
				return {
					embeds: [
						createErrorEmbed(
							'Invalid Page',
							`Page ${page} exceeds available pages. There are only ${totalPages} page(s) available.`
						)
					],
					ephemeral: true
				}
			}

			// No users have earned XP yet
			const embed = createInfoEmbed(
				'🏆 XP Leaderboard',
				'No users have earned XP yet',
				undefined,
				getEmbedColor(guildConfig)
			)
			return {
				embeds: [embed]
			}
		}

		// Build leaderboard description
		const leaderboardLines = entries.map((entry) => {
			const userMention = formatUser(entry.userId)
			const levelStr = formatLevel(entry.level)
			const xpStr = formatXP(entry.xp)
			const rankStr = formatRank(entry.rank)

			// Highlight current user (bold)
			if (entry.userId === interaction.user.id) {
				return `**${rankStr}. ${userMention} - ${levelStr} (${xpStr})**`
			}

			return `${rankStr}. ${userMention} - ${levelStr} (${xpStr})`
		})

		const description = leaderboardLines.join('\n')

		// Build embed
		const embedColor = getEmbedColor(guildConfig)
		const embed = createInfoEmbed(`🏆 XP Leaderboard - Page ${page}`, description, undefined, embedColor)

		// Add footer with pagination info
		let footerText = `Page ${page} of ${totalPages} • ${totalUsers.toLocaleString('en-US')} users tracked`
		if (totalPages > 1) {
			footerText += ' • Use /leaderboard page:<number> to navigate'
		}

		embed.setFooter({ text: footerText })

		return {
			embeds: [embed]
		}
	} catch (error) {
		logger.error('Error in /leaderboard command:', error)
		return {
			embeds: [createErrorEmbed('Error', 'An unexpected error occurred while fetching leaderboard data')],
			ephemeral: true
		}
	}
}
