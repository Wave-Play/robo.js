import { type ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { addXP } from '../../core/xp.js'
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
	description: 'Give XP to a user',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'user',
			type: 'user',
			required: true,
			description: 'User to give XP to'
		},
		{
			name: 'amount',
			type: 'integer',
			required: true,
			description: 'Amount of XP to give',
			min: 1,
			max: 1000000
		},
		{
			name: 'reason',
			type: 'string',
			required: false,
			description: 'Reason for giving XP'
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
				embeds: [createErrorEmbed('Invalid Target', 'Cannot give XP to bots')],
				ephemeral: true
			}
		}

		// Add XP
		const result = await addXP(guildId, user.id, amount, { reason: reason ?? 'Admin grant' })

		// Create success embed
		const fields = [
			{ name: `Previous ${xpLabel}`, value: formatXP(result.oldXp, xpLabel), inline: true },
			{ name: `New ${xpLabel}`, value: formatXP(result.newXp, xpLabel), inline: true },
			{ name: 'Previous Level', value: formatLevel(result.oldLevel), inline: true },
			{ name: 'New Level', value: formatLevel(result.newLevel), inline: true }
		]

		if (reason) {
			fields.push({ name: 'Reason', value: reason, inline: false })
		}

		if (result.leveledUp) {
			fields.push({ name: 'Level Up!', value: '🎉 User leveled up!', inline: false })
		}

		return {
			embeds: [
				createSuccessEmbed(
					'XP Given',
					`Successfully gave ${formatXP(amount, xpLabel)} to ${formatUser(user.id)}`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp give command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while giving XP'
				)
			],
			ephemeral: true
		}
	}
}
