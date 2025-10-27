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
	description: 'Set whether to remove role rewards when users lose XP/levels',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'enabled',
			type: 'boolean',
			required: true,
			description: 'Remove rewards when XP is lost'
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
		const enabled = interaction.options.getBoolean('enabled', true)

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Check if setting is same as current
		if (guildConfig.removeRewardOnXpLoss === enabled) {
			return {
				embeds: [
					createInfoEmbed(
						'No Change',
						`Remove-on-loss is already ${enabled ? 'enabled' : 'disabled'}`
					)
				]
			}
		}

		// Update config
		await setConfig(guildId, { removeRewardOnXpLoss: enabled })

		// Create behavior description based on setting
		const behavior = enabled
			? 'When users lose XP (via `/xp remove`), they will lose role rewards for levels they no longer qualify for'
			: 'Users will keep all role rewards even if they lose XP/levels'

		// Create success embed
		const fields = [
			{ name: 'Previous Setting', value: guildConfig.removeRewardOnXpLoss ? 'Enabled' : 'Disabled', inline: true },
			{ name: 'New Setting', value: enabled ? 'Enabled' : 'Disabled', inline: true },
			{ name: 'Behavior', value: behavior, inline: false },
			{
				name: 'Note',
				value: 'This setting only affects future XP losses. Existing roles are not changed.',
				inline: false
			}
		]

		return {
			embeds: [
				createSuccessEmbed(
					'Remove-on-Loss Updated',
					`Role rewards will ${enabled ? 'now' : 'no longer'} be removed when users lose XP/levels`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp rewards remove-on-loss command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error
						? error.message
						: 'An unexpected error occurred while updating remove-on-loss setting'
				)
			],
			ephemeral: true
		}
	}
}
