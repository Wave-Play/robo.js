import { type ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { getConfig, setConfig } from '../../../config.js'
import {
	hasAdminPermission,
	getRequiredPermissionBit,
	requireGuild,
	createSuccessEmbed,
	createErrorEmbed,
	createPermissionError,
	formatRole,
	formatLevel
} from '../../../core/utils.js'

export const config: CommandConfig = {
	description: 'Remove a role reward at a specific level',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'level',
			type: 'integer',
			required: true,
			description: 'Level to remove reward from',
			min: 1,
			max: 1000
		}
	]
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

		// Get option
		const level = interaction.options.getInteger('level', true)

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Find reward at specified level
		const removedReward = guildConfig.roleRewards.find((r) => r.level === level)
		if (!removedReward) {
			return {
				embeds: [createErrorEmbed('Reward Not Found', `No role reward found at ${formatLevel(level)}`)],
				ephemeral: true
			}
		}

		// Remove reward
		const updatedRewards = guildConfig.roleRewards.filter((r) => r.level !== level)

		// Update config
		await setConfig(guildId, { roleRewards: updatedRewards })

		// Create success embed
		const fields = [
			{ name: 'Removed Role', value: formatRole(removedReward.roleId), inline: true },
			{ name: 'Level', value: `${level}`, inline: true },
			{ name: 'Remaining Rewards', value: `${updatedRewards.length}`, inline: false }
		]

		return {
			embeds: [createSuccessEmbed('Role Reward Removed', `Removed role reward from ${formatLevel(level)}`, fields)]
		}
	} catch (error) {
		logger.error('Error in /xp rewards remove command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while removing role reward'
				)
			],
			ephemeral: true
		}
	}
}
