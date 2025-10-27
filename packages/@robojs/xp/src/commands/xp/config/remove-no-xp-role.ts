import { type ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { getConfig, setConfig } from '../../../config.js'
import {
	hasAdminPermission,
	getRequiredPermissionBit,
	requireGuild,
	createSuccessEmbed,
	createErrorEmbed,
	createPermissionError,
	formatRole
} from '../../../core/utils.js'

export const config: CommandConfig = {
	description: 'Remove a role from No-XP list',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'role',
			type: 'role',
			required: true,
			description: 'Role to allow XP gain'
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

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Check if role in list
		if (!guildConfig.noXpRoleIds.includes(role.id)) {
			return {
				embeds: [createErrorEmbed('Role Not Found', 'This role is not in the No-XP list')],
				ephemeral: true
			}
		}

		// Remove role from list
		const updatedList = guildConfig.noXpRoleIds.filter((id) => id !== role.id)

		// Update config
		await setConfig(guildId, { noXpRoleIds: updatedList })

		// Create success embed
		const fields = [
			{ name: 'Role', value: `${'name' in role ? role.name : 'Unknown'} (${formatRole(role.id)})`, inline: true },
			{ name: 'Remaining No-XP Roles', value: `${updatedList.length}`, inline: true },
			{ name: 'Effect', value: 'Users with this role will now earn XP from messages', inline: false }
		]

		return {
			embeds: [
				createSuccessEmbed(
					'No-XP Role Removed',
					`Users with ${formatRole(role.id)} can now gain XP`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp config remove-no-xp-role command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error
						? error.message
						: 'An unexpected error occurred while removing No-XP role'
				)
			],
			ephemeral: true
		}
	}
}
