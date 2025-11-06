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
	description: 'Set whether leaderboard is publicly visible',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'enabled',
			type: 'boolean',
			required: true,
			description: 'Make leaderboard public'
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

		// Check if same as current
		if (guildConfig.leaderboard.public === enabled) {
			return {
				embeds: [createInfoEmbed('No Change', `Leaderboard is already ${enabled ? 'public' : 'private'}`)]
			}
		}

		// Update config
		await setConfig(guildId, { leaderboard: { public: enabled } })

		// Create effect description based on setting
		const effect = enabled
			? 'All users can view the leaderboard with `/leaderboard`'
			: 'Only users with Manage Guild permission can view the leaderboard'

		// Create success embed
		const fields = [
			{ name: 'Previous Setting', value: guildConfig.leaderboard.public ? 'Public' : 'Private', inline: true },
			{ name: 'New Setting', value: enabled ? 'Public' : 'Private', inline: true },
			{ name: 'Effect', value: effect, inline: false },
			{
				name: 'Note',
				value: 'This is a config flag for future use. Leaderboard command will be implemented in next phase.',
				inline: false
			}
		]

		return {
			embeds: [
				createSuccessEmbed(
					'Leaderboard Visibility Updated',
					`Leaderboard is now **${enabled ? 'public' : 'private'}**`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp config set-leaderboard-public command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while updating leaderboard visibility'
				)
			],
			ephemeral: true
		}
	}
}
