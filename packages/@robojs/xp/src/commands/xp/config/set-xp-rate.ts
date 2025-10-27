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
	description: 'Set XP rate multiplier',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'rate',
			type: 'number',
			required: true,
			description: 'XP rate multiplier (e.g., 1.5 for 50% boost)',
			min: 0.1,
			max: 10.0
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
		const rate = interaction.options.getNumber('rate', true)

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Check if same as current
		if (guildConfig.xpRate === rate) {
			return {
				embeds: [createInfoEmbed('No Change', `XP rate is already set to ${rate}x`)]
			}
		}

		// Update config
		await setConfig(guildId, { xpRate: rate })

		// Determine effect description
		const effectDesc =
			rate < 1 ? 'Users will earn less XP per message' : rate > 1 ? 'Users will earn more XP per message' : 'Users will earn the same XP per message'

		// Create success embed
		const fields = [
			{ name: 'Previous Rate', value: `${guildConfig.xpRate}x`, inline: true },
			{ name: 'New Rate', value: `${rate}x`, inline: true },
			{ name: 'Effect', value: effectDesc, inline: false },
			{
				name: 'Example',
				value: `Base 15-25 XP becomes ${Math.floor(15 * rate)}-${Math.floor(25 * rate)} XP`,
				inline: false
			}
		]

		// Add MEE6 default note if different
		if (rate !== 1.0) {
			fields.push({ name: 'MEE6 Default', value: '1.0x', inline: false })
		}

		return {
			embeds: [
				createSuccessEmbed('XP Rate Updated', `XP rate multiplier changed to **${rate}x**`, fields)
			]
		}
	} catch (error) {
		logger.error('Error in /xp config set-xp-rate command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while updating XP rate'
				)
			],
			ephemeral: true
		}
	}
}
