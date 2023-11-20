import { PermissionFlagsBits } from 'discord.js'
import type { CommandConfig, CommandResult } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
	description: `Audit a member's activity in the server`,
	dmPermission: false,
	options: [
		{
			name: 'member',
			description: 'The @member to audit',
			type: 'user',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	return 'Not implemented yet'
}
