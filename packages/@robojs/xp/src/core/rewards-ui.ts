import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder
} from 'discord.js'
import type { RoleReward, RewardsMode } from '../types.js'
import { createInfoEmbed, formatRole } from './utils.js'

export const REWARDS_PER_PAGE = 25
export const REWARDS_NAMESPACE = 'xp_rewards_pagination'

export function calculateTotalPages(rewardsCount: number): number {
	return Math.ceil(rewardsCount / REWARDS_PER_PAGE)
}

export function validatePage(page: number, totalPages: number): number {
	return Math.max(0, Math.min(page, totalPages - 1))
}

export function buildRewardsEmbed(
	rewards: RoleReward[],
	page: number,
	totalPages: number,
	mode: RewardsMode,
	removeOnLoss: boolean,
	embedColor?: number
): EmbedBuilder {
	const start = page * REWARDS_PER_PAGE
	const end = start + REWARDS_PER_PAGE
	const pageRewards = rewards.slice(start, end)

	const rewardFields = pageRewards.map((reward) => ({
		name: `Level ${reward.level}`,
		value: formatRole(reward.roleId),
		inline: true
	}))

	const description = `${rewards.length} role reward${rewards.length === 1 ? '' : 's'} configured\n**Mode:** ${mode}\n**Remove on XP Loss:** ${removeOnLoss ? 'Yes' : 'No'}`

	const embed = createInfoEmbed(
		'Role Rewards',
		description,
		rewardFields,
		embedColor
	)

	if (totalPages > 1) {
		embed.setFooter({ text: `Page ${page + 1} of ${totalPages}` })
	}

	return embed
}

export function buildRewardsPaginationButtons(
	page: number,
	totalPages: number,
	userId: string
): ActionRowBuilder<ButtonBuilder> | null {
	if (totalPages <= 1) {
		return null
	}

	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${REWARDS_NAMESPACE}@previous@${page}@${userId}`)
			.setEmoji('⏪')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(page === 0),
		new ButtonBuilder()
			.setCustomId(`${REWARDS_NAMESPACE}@next@${page}@${userId}`)
			.setEmoji('⏭')
			.setStyle(ButtonStyle.Primary)
			.setDisabled(page === totalPages - 1)
	)
}
