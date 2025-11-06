import { type ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { removeXP, getUserData } from '../../core/xp.js'
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
	description: 'Remove XP from a user',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'user',
			type: 'user',
			required: true,
			description: 'User to remove XP from'
		},
		{
			name: 'amount',
			type: 'integer',
			required: true,
			description: 'Amount of XP to remove',
			min: 1,
			max: 1000000
		},
		{
			name: 'reason',
			type: 'string',
			required: false,
			description: 'Reason for removing XP'
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
				embeds: [createErrorEmbed('Invalid Target', 'Cannot remove XP from bots')],
				ephemeral: true
			}
		}

		// Check if user has XP record
		const userData = await getUserData(guildId, user.id)
		if (!userData) {
			return {
				embeds: [createErrorEmbed('User Not Found', `${formatUser(user.id)} has no XP to remove`)],
				ephemeral: true
			}
		}

		// Remove XP
		const result = await removeXP(guildId, user.id, amount, { reason: reason ?? 'Admin removal' })

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

		if (result.leveledDown) {
			fields.push({ name: 'Level Down', value: '⚠️ User lost levels', inline: false })
		}

		return {
			embeds: [
				createSuccessEmbed(
					'XP Removed',
					`Successfully removed ${formatXP(amount, xpLabel)} from ${formatUser(user.id)}`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp remove command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while removing XP'
				)
			],
			ephemeral: true
		}
	}
}
