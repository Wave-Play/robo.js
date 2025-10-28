import { type ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { setXP } from '../../core/xp.js'
import { getConfig } from '../../config.js'
import {
	hasAdminPermission,
	getRequiredPermissionBit,
	requireGuild,
	createSuccessEmbed,
	createErrorEmbed,
	createPermissionError,
	formatXP,
	formatLevel,
	formatUser,
	getXpLabel
} from '../../core/utils.js'

export const config: CommandConfig = {
	description: 'Set absolute XP value for a user',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'user',
			type: 'user',
			required: true,
			description: 'User to set XP for'
		},
		{
			name: 'amount',
			type: 'integer',
			required: true,
			description: 'Total XP to set',
			min: 0,
			max: 1000000
		},
		{
			name: 'reason',
			type: 'string',
			required: false,
			description: 'Reason for setting XP'
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

		// Load guild config and determine custom XP label
		const guildConfig = await getConfig(guildId)
		const xpLabel = getXpLabel(guildConfig)

		// Get options
		const user = interaction.options.getUser('user', true)
		const amount = interaction.options.getInteger('amount', true)
		const reason = interaction.options.getString('reason')

		// Validate user is not a bot
		if (user.bot) {
			return {
				embeds: [createErrorEmbed('Invalid Target', 'Cannot set XP for bots')],
				ephemeral: true
			}
		}

		// Set XP
		const result = await setXP(guildId, user.id, amount, { reason: reason ?? 'Admin set' })

		// Calculate delta for clarity
		const delta = result.newXp - result.oldXp

		// Create success embed
		const fields = [
			{ name: `Previous ${xpLabel}`, value: formatXP(result.oldXp, xpLabel), inline: true },
			{ name: `New ${xpLabel}`, value: formatXP(result.newXp, xpLabel), inline: true },
			{ name: 'Change', value: delta >= 0 ? `+${formatXP(delta, xpLabel)}` : formatXP(delta, xpLabel), inline: true },
			{ name: 'Previous Level', value: formatLevel(result.oldLevel), inline: true },
			{ name: 'New Level', value: formatLevel(result.newLevel), inline: true }
		]

		if (reason) {
			fields.push({ name: 'Reason', value: reason, inline: false })
		}

		if (result.newLevel > result.oldLevel) {
			fields.push({ name: 'Level Up!', value: '🎉 User leveled up!', inline: false })
		}

		if (result.newLevel < result.oldLevel) {
			fields.push({ name: 'Level Down', value: '⚠️ User lost levels', inline: false })
		}

		return {
			embeds: [
				createSuccessEmbed(
					'XP Set',
					`Successfully set ${xpLabel} for ${formatUser(user.id)} to ${formatXP(amount, xpLabel)}`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp set command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while setting XP'
				)
			],
			ephemeral: true
		}
	}
}
