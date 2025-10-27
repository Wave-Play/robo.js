import { type ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { getConfig, setConfig } from '../../../config.js'
import {
	hasAdminPermission,
	getRequiredPermissionBit,
	requireGuild,
	createSuccessEmbed,
	createInfoEmbed,
	createErrorEmbed,
	createPermissionError
} from '../../../core/utils.js'

export const config: CommandConfig = {
	description: 'Set role rewards mode (stack or replace)',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'mode',
			type: 'string',
			required: true,
			description: 'Rewards mode',
			choices: [
				{ name: 'Stack (keep all rewards)', value: 'stack' },
				{ name: 'Replace (only highest reward)', value: 'replace' }
			]
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
		const mode = interaction.options.getString('mode', true) as 'stack' | 'replace'

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Check if mode is same as current
		if (guildConfig.rewardsMode === mode) {
			return {
				embeds: [createInfoEmbed('No Change', `Rewards mode is already set to **${mode}**`)]
			}
		}

		// Update config
		await setConfig(guildId, { rewardsMode: mode })

		// Create explanation based on mode
		const explanation =
			mode === 'stack'
				? 'Users will keep all role rewards from previous levels'
				: 'Users will only have the role for their current level (previous roles removed)'

		// Create success embed
		const fields = [
			{ name: 'Previous Mode', value: guildConfig.rewardsMode, inline: true },
			{ name: 'New Mode', value: mode, inline: true },
			{ name: 'Explanation', value: explanation, inline: false },
			{
				name: 'Note',
				value: 'Existing users will be reconciled on their next level change. Use `/xp recalc` to update immediately.',
				inline: false
			}
		]

		return {
			embeds: [
				createSuccessEmbed('Rewards Mode Updated', `Role rewards mode changed to **${mode}**`, fields)
			]
		}
	} catch (error) {
		logger.error('Error in /xp rewards mode command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error
						? error.message
						: 'An unexpected error occurred while updating rewards mode'
				)
			],
			ephemeral: true
		}
	}
}
