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
	description: 'Set cooldown between XP awards',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'seconds',
			type: 'integer',
			required: true,
			description: 'Cooldown in seconds',
			min: 0,
			max: 3600
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
		const seconds = interaction.options.getInteger('seconds', true)

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Check if same as current
		if (guildConfig.cooldownSeconds === seconds) {
			return {
				embeds: [createInfoEmbed('No Change', `Cooldown is already set to ${seconds} seconds`)]
			}
		}

		// Update config
		await setConfig(guildId, { cooldownSeconds: seconds })

		// Create success embed
		const fields = [
			{ name: 'Previous Cooldown', value: `${guildConfig.cooldownSeconds} seconds`, inline: true },
			{ name: 'New Cooldown', value: `${seconds} seconds`, inline: true },
			{ name: 'Effect', value: 'Users must wait this long between messages to earn XP', inline: false }
		]

		// Add MEE6 default note if different
		if (seconds !== 60) {
			fields.push({ name: 'MEE6 Default', value: '60 seconds', inline: false })
		}

		return {
			embeds: [createSuccessEmbed('Cooldown Updated', `XP award cooldown changed to **${seconds} seconds**`, fields)]
		}
	} catch (error) {
		logger.error('Error in /xp config set-cooldown command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while updating cooldown'
				)
			],
			ephemeral: true
		}
	}
}
