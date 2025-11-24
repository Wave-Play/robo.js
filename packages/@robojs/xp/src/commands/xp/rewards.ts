import { type ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { xpLogger } from '../../core/logger.js'
import { getConfig } from '../../config.js'
import {
	requireGuild,
	createInfoEmbed,
	createErrorEmbed,
	getEmbedColor
} from '../../core/utils.js'
import {
	buildRewardsEmbed,
	buildRewardsPaginationButtons,
	calculateTotalPages,
	REWARDS_PER_PAGE
} from '../../core/rewards-ui.js'

export const config: CommandConfig = {
	description: 'List all role rewards',
	dmPermission: false
}

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

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Get role rewards sorted by level
		const rewards = [...guildConfig.roleRewards].sort((a, b) => a.level - b.level)

		// If no rewards configured
		if (rewards.length === 0) {
			return {
				embeds: [
					createInfoEmbed(
						'No Role Rewards',
						'No role rewards configured. Ask an admin to set some via `/xp config` → Role Rewards.'
					)
				]
			}
		}

		const totalPages = calculateTotalPages(rewards.length)
		const page = 0
		const embedColor = getEmbedColor(guildConfig)
		const embed = buildRewardsEmbed(
			rewards,
			page,
			totalPages,
			guildConfig.rewardsMode,
			guildConfig.removeRewardOnXpLoss,
			embedColor
		)
		const hasPagination = rewards.length > REWARDS_PER_PAGE
		const buttonRow = hasPagination ? buildRewardsPaginationButtons(page, totalPages, interaction.user.id) : null

		return {
			embeds: [embed],
			components: buttonRow ? [buttonRow] : undefined
		}
	} catch (error) {
		xpLogger.error('Error in /xp rewards command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while listing role rewards'
				)
			],
			ephemeral: true
		}
	}
}
