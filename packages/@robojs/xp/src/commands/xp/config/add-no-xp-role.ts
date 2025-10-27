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
	createPermissionError,
	formatRole
} from '../../../core/utils.js'

export const config: CommandConfig = {
	description: 'Add a role that prevents XP gain',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'role',
			type: 'role',
			required: true,
			description: 'Role to prevent XP gain'
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
		const role = interaction.options.getRole('role', true)

		// Validate role is not @everyone
		if (role.id === guildId) {
			return {
				embeds: [createErrorEmbed('Invalid Role', 'Cannot use @everyone as No-XP role')],
				ephemeral: true
			}
		}

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Check if role already in list
		if (guildConfig.noXpRoleIds.includes(role.id)) {
			return {
				embeds: [createInfoEmbed('Already Configured', 'This role is already a No-XP role')]
			}
		}

		// Add role to list
		const updatedList = [...guildConfig.noXpRoleIds, role.id]

		// Update config
		await setConfig(guildId, { noXpRoleIds: updatedList })

		// Create success embed
		const fields = [
			{ name: 'Role', value: `${'name' in role ? role.name : 'Unknown'} (${formatRole(role.id)})`, inline: true },
			{ name: 'Total No-XP Roles', value: `${updatedList.length}`, inline: true },
			{ name: 'Effect', value: 'Users with this role will not earn XP from messages', inline: false }
		]

		return {
			embeds: [
				createSuccessEmbed(
					'No-XP Role Added',
					`Users with ${formatRole(role.id)} will no longer gain XP`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp config add-no-xp-role command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error
						? error.message
						: 'An unexpected error occurred while adding No-XP role'
				)
			],
			ephemeral: true
		}
	}
}
