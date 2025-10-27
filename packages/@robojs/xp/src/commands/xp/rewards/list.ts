import { type ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { getConfig, setConfig } from '../../../config.js'
import {
	hasAdminPermission,
	getRequiredPermissionBit,
	requireGuild,
	createInfoEmbed,
	createErrorEmbed,
	createPermissionError,
	formatRole
} from '../../../core/utils.js'

export const config: CommandConfig = {
	description: 'List all role rewards',
	defaultMemberPermissions: getRequiredPermissionBit(),
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

		// Check permissions
		if (!hasAdminPermission(interaction)) {
			return createPermissionError()
		}

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
						'No role rewards configured. Use `/xp rewards add` to create rewards.'
					)
				]
			}
		}

		// Build fields for embed (max 25 due to Discord limit)
		const fields = rewards.slice(0, 25).map((reward) => ({
			name: `Level ${reward.level}`,
			value: formatRole(reward.roleId),
			inline: true
		}))

		// Add note if more than 25 rewards
		if (rewards.length > 25) {
			fields.push({
				name: 'Note',
				value: 'Only showing first 25 rewards due to Discord limits',
				inline: false
			})
		}

		// Add settings field
		fields.push({
			name: 'Settings',
			value: `**Mode:** ${guildConfig.rewardsMode}\n**Remove on XP Loss:** ${guildConfig.removeRewardOnXpLoss ? 'Yes' : 'No'}`,
			inline: false
		})

		return {
			embeds: [
				createInfoEmbed(
					'Role Rewards',
					`${rewards.length} role reward${rewards.length === 1 ? '' : 's'} configured`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp rewards list command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error
						? error.message
						: 'An unexpected error occurred while listing role rewards'
				)
			],
			ephemeral: true
		}
	}
}
