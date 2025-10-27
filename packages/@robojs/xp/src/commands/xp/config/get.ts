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
	formatRole,
	formatChannel
} from '../../../core/utils.js'

export const config: CommandConfig = {
	description: 'View current XP system configuration',
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

		// Format no-xp roles (show first 5)
		let noXpRolesValue: string
		if (guildConfig.noXpRoleIds.length === 0) {
			noXpRolesValue = 'None'
		} else if (guildConfig.noXpRoleIds.length <= 5) {
			noXpRolesValue = guildConfig.noXpRoleIds.map(formatRole).join(', ')
		} else {
			const first5 = guildConfig.noXpRoleIds.slice(0, 5).map(formatRole).join(', ')
			const remaining = guildConfig.noXpRoleIds.length - 5
			noXpRolesValue = `${first5}... and ${remaining} more`
		}

		// Format no-xp channels (show first 5)
		let noXpChannelsValue: string
		if (guildConfig.noXpChannelIds.length === 0) {
			noXpChannelsValue = 'None'
		} else if (guildConfig.noXpChannelIds.length <= 5) {
			noXpChannelsValue = guildConfig.noXpChannelIds.map(formatChannel).join(', ')
		} else {
			const first5 = guildConfig.noXpChannelIds.slice(0, 5).map(formatChannel).join(', ')
			const remaining = guildConfig.noXpChannelIds.length - 5
			noXpChannelsValue = `${first5}... and ${remaining} more`
		}

		// Format multipliers
		const serverMult = guildConfig.multipliers?.server ?? 1.0
		const roleMultCount = Object.keys(guildConfig.multipliers?.role ?? {}).length
		const userMultCount = Object.keys(guildConfig.multipliers?.user ?? {}).length

		// Build fields
		const fields = [
			{ name: 'Cooldown', value: `${guildConfig.cooldownSeconds} seconds`, inline: true },
			{ name: 'XP Rate', value: `${guildConfig.xpRate}x`, inline: true },
			{
				name: 'No-XP Roles',
				value: `${guildConfig.noXpRoleIds.length} role${guildConfig.noXpRoleIds.length === 1 ? '' : 's'}\n${noXpRolesValue}`,
				inline: false
			},
			{
				name: 'No-XP Channels',
				value: `${guildConfig.noXpChannelIds.length} channel${guildConfig.noXpChannelIds.length === 1 ? '' : 's'}\n${noXpChannelsValue}`,
				inline: false
			},
			{
				name: 'Role Rewards',
				value: `${guildConfig.roleRewards.length} reward${guildConfig.roleRewards.length === 1 ? '' : 's'} (use \`/xp rewards list\` for details)`,
				inline: true
			},
			{ name: 'Rewards Mode', value: guildConfig.rewardsMode, inline: true },
			{ name: 'Remove on XP Loss', value: guildConfig.removeRewardOnXpLoss ? 'Yes' : 'No', inline: true },
			{ name: 'Leaderboard Public', value: guildConfig.leaderboard.public ? 'Yes' : 'No', inline: true },
			{
				name: 'Multipliers',
				value: `Server: ${serverMult}x\nRoles: ${roleMultCount} role${roleMultCount === 1 ? '' : 's'}\nUsers: ${userMultCount} user${userMultCount === 1 ? '' : 's'}`,
				inline: false
			}
		]

		return {
			embeds: [createInfoEmbed('XP Configuration', 'Current XP system settings for this server', fields)]
		}
	} catch (error) {
		logger.error('Error in /xp config get command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error
						? error.message
						: 'An unexpected error occurred while fetching configuration'
				)
			],
			ephemeral: true
		}
	}
}
