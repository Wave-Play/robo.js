import { BanData, Buttons, ID_NAMESPACE } from '../../core/constants.js'
import { isBanned } from '../../core/utils.js'
import { Flashcore } from 'robo.js'
import { ButtonStyle, Colors, ComponentType, PermissionFlagsBits } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type { APIEmbed, CommandInteraction, Guild, GuildMember, User } from 'discord.js'

export const config: CommandConfig = {
	defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
	description: `Audit a user's activity in the server`,
	dmPermission: false,
	options: [
		{
			name: 'user',
			description: 'The user to audit',
			type: 'user',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const user = interaction.options.get('user')?.user as User
	const member = interaction.guild?.members.cache.get(user?.id) as GuildMember

	// See if this user is currently banned
	let status = 'Active'
	const banData = await Flashcore.get<BanData>('ban', {
		namespace: ID_NAMESPACE + interaction.guildId + user.id
	})
	const isUserBanned = await isBanned(interaction.guild as Guild, user.id)

	if (isUserBanned) {
		status = 'Banned for: ' + (banData?.reason ?? 'Unknown')
	}
	const infractions =
		(await Flashcore.get<number>('infractions', {
			namespace: interaction.guildId + user.id
		})) ?? 0

	return {
		embeds: [createAuditEmbed(user, member, status, infractions)],
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.Button,
						style: ButtonStyle.Danger,
						label: isUserBanned ? 'Unban' : 'Ban',
						customId: (isUserBanned ? Buttons.Unban.id : Buttons.Ban.id) + '/' + user.id
					}
				]
			}
		]
	}
}

export function createAuditEmbed(user: User, member: GuildMember, status: string, infractions: number): APIEmbed {
	return {
		color: Colors.Blurple,
		title: `Audit for ${user.username}`,
		thumbnail: {
			url: user.displayAvatarURL()
		},
		fields: [
			{
				name: 'Member',
				value: user.toString()
			},
			{
				name: 'Status',
				value: status
			},
			{
				name: 'Infractions',
				value: infractions.toString()
			}
		],
		footer: {
			text: `Joined ${member?.joinedAt?.toISOString()}`
		}
	}
}
