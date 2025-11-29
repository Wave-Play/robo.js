import type { Interaction } from 'discord.js'
import { xpLogger } from '../../core/logger.js'
import { getConfig } from '../../config.js'
import { createErrorEmbed, getEmbedColor, requireGuild, safeReply } from '../../core/utils.js'
import {
	REWARDS_NAMESPACE,
	REWARDS_PER_PAGE,
	buildRewardsEmbed,
	buildRewardsPaginationButtons,
	calculateTotalPages,
	validatePage
} from '../../core/rewards-ui.js'

export default async function handleRewardsPagination(interaction: Interaction): Promise<void> {
	if (!interaction.isButton()) {
		return
	}

	const parts = interaction.customId.split('@')
	const prefix = parts[0]
	const action = parts[1]
	const rawPage = parts[2]
	const userId = parts[3]

	if (prefix !== REWARDS_NAMESPACE || !action || !userId) {
		return
	}

	if (userId !== interaction.user.id) {
		await safeReply(interaction, {
			content: "This is not your rewards list. Use `/xp rewards` to view rewards.",
			ephemeral: true
		})
		return
	}

	try {
		const guildCheck = requireGuild(interaction)
		if (typeof guildCheck === 'string') {
			await safeReply(interaction, {
				embeds: [createErrorEmbed('Error', guildCheck)],
				ephemeral: true
			})
			return
		}

		const { guildId } = guildCheck
		const guildConfig = await getConfig(guildId)
		const rewards = [...guildConfig.roleRewards].sort((a, b) => a.level - b.level)
		const embedColor = getEmbedColor(guildConfig)

		const totalPages = calculateTotalPages(rewards.length)
		let page = parseInt(rawPage, 10)
		if (Number.isNaN(page)) {
			page = 0
		}
		page = validatePage(page, totalPages)

		if (action === 'previous' && page > 0) {
			page--
		} else if (action === 'next' && page < totalPages - 1) {
			page++
		}

		page = validatePage(page, totalPages)

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

		await interaction.update({
			embeds: [embed],
			components: buttonRow ? [buttonRow] : []
		})
	} catch (error) {
		xpLogger.error('Error handling XP rewards pagination:', error)
		await safeReply(interaction, {
			embeds: [
				createErrorEmbed('Error', 'Something went wrong while updating the rewards list. Please try again.')
			],
			ephemeral: true
		})
	}
}
