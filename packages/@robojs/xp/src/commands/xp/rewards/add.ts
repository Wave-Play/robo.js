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
	formatRole,
	formatLevel
} from '../../../core/utils.js'

export const config: CommandConfig = {
	description: 'Add a role reward at a specific level',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'level',
			type: 'integer',
			required: true,
			description: 'Level to award role at',
			min: 1,
			max: 1000
		},
		{
			name: 'role',
			type: 'role',
			required: true,
			description: 'Role to award'
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

		// Get options
		const level = interaction.options.getInteger('level', true)
		const role = interaction.options.getRole('role', true)

		// Validate role is not managed
		if ('managed' in role && role.managed) {
			return {
				embeds: [createErrorEmbed('Invalid Role', 'Cannot use managed roles as rewards')],
				ephemeral: true
			}
		}

		// Validate role is not @everyone
		if (role.id === guildId) {
			return {
				embeds: [createErrorEmbed('Invalid Role', 'Cannot use @everyone as reward')],
				ephemeral: true
			}
		}

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Check if level already has a reward
		const existingAtLevel = guildConfig.roleRewards.find((r) => r.level === level)
		if (existingAtLevel) {
			return {
				embeds: [
					createErrorEmbed(
						'Level Already Configured',
						`${formatLevel(level)} already has a role reward. Remove it first or use a different level.`
					)
				],
				ephemeral: true
			}
		}

		// Check if role already used
		const existingRole = guildConfig.roleRewards.find((r) => r.roleId === role.id)
		if (existingRole) {
			// Just a warning, allow adding it again
			logger.warn(
				`Role ${role.id} is already a reward at level ${existingRole.level}, adding it again at level ${level}`
			)
		}

		// Add new reward and sort by level
		const updatedRewards = [...guildConfig.roleRewards, { level, roleId: role.id }].sort((a, b) => a.level - b.level)

		// Update config
		await setConfig(guildId, { roleRewards: updatedRewards })

		// Create success embed
		const fields = [
			{ name: 'Role', value: `${'name' in role ? role.name : 'Unknown'} (${formatRole(role.id)})`, inline: true },
			{ name: 'Level', value: `${level}`, inline: true },
			{ name: 'Mode', value: `${guildConfig.rewardsMode}`, inline: true },
			{ name: 'Total Rewards', value: `${updatedRewards.length}`, inline: false }
		]

		return {
			embeds: [
				createSuccessEmbed(
					'Role Reward Added',
					`${formatRole(role.id)} will now be awarded at ${formatLevel(level)}`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp rewards add command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error ? error.message : 'An unexpected error occurred while adding role reward'
				)
			],
			ephemeral: true
		}
	}
}
