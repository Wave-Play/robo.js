import { type ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { recalcLevel, getUserData } from '../../core/xp.js'
import {
	hasAdminPermission,
	getRequiredPermissionBit,
	requireGuild,
	createSuccessEmbed,
	createErrorEmbed,
	createPermissionError,
	formatXP,
	formatLevel,
	formatUser
} from '../../core/utils.js'

export const config: CommandConfig = {
	description: 'Recalculate user level from total XP and reconcile roles',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'user',
			type: 'user',
			required: true,
			description: 'User to recalculate'
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
		const user = interaction.options.getUser('user', true)

		// Validate user is not a bot
		if (user.bot) {
			return {
				embeds: [createErrorEmbed('Invalid Target', 'Cannot recalculate levels for bots')],
				ephemeral: true
			}
		}

		// Check if user has XP record
		const userData = await getUserData(guildId, user.id)
		if (!userData) {
			return {
				embeds: [
					createErrorEmbed(
						'User Not Found',
						`${formatUser(user.id)} has no XP record to recalculate`
					)
				],
				ephemeral: true
			}
		}

		// Recalculate level
		const result = await recalcLevel(guildId, user.id)

		// Create success embed based on whether reconciliation was needed
		if (result.reconciled) {
			// Level was corrected
			const fields = [
				{ name: 'Total XP', value: formatXP(result.totalXp), inline: false },
				{ name: 'Previous Level', value: formatLevel(result.oldLevel), inline: true },
				{ name: 'Corrected Level', value: formatLevel(result.newLevel), inline: true },
				{ name: 'Status', value: '✅ Level corrected and roles reconciled', inline: false }
			]

			return {
				embeds: [
					createSuccessEmbed(
						'Level Recalculated',
						`Recalculated level for ${formatUser(user.id)} and reconciled role rewards`,
						fields
					)
				]
			}
		} else {
			// Level was already correct
			const fields = [
				{ name: 'Total XP', value: formatXP(result.totalXp), inline: false },
				{ name: 'Current Level', value: formatLevel(result.newLevel), inline: true },
				{ name: 'Status', value: '✅ No changes needed', inline: false }
			]

			return {
				embeds: [
					createSuccessEmbed(
						'Level Verified',
						`Level for ${formatUser(user.id)} is already correct`,
						fields
					)
				]
			}
		}
	} catch (error) {
		logger.error('Error in /xp recalc command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while recalculating level'
				)
			],
			ephemeral: true
		}
	}
}
