import { Colors, PermissionFlagsBits } from 'discord.js'
import type { CommandConfig, CommandResult } from '@roboplay/robo.js'
import type { CommandInteraction, GuildMember } from 'discord.js'

export const config: CommandConfig = {
	defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
	dmPermission: false,
	description: `Times out a member for a specified amount of time`,
	options: [
		{
			name: 'user',
			description: 'The user to timeout',
			type: 'user',
			required: true
		},
		{
			name: 'duration',
			description: 'How long they should be timed out for',
			type: 'integer',
			choices: [
				{
					name: '60 secs',
					value: 60
				},
				{
					name: '5 mins',
					value: 300
				},
				{
					name: '10 mins',
					value: 600
				},
				{
					name: '1 hour',
					value: 3600
				},
				{
					name: '1 day',
					value: 86400
				},
				{
					name: '1 week',
					value: 604800
				}
			],
			required: true
		},
		{
			name: 'reason',
			description: 'The reason for timing them out, if any',
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const duration = interaction.options.get('duration')?.value as number
	const reason = interaction.options.get('reason')?.value as string
	const user = interaction.options.get('user')?.member as GuildMember

	user.timeout(duration, reason)

	return {
		embeds: [
			{
				title: 'Timed out member',
				description: `**${user.user.tag}** has been timed out for ${duration} seconds`,
				color: Colors.Yellow
			}
		]
	}
}
