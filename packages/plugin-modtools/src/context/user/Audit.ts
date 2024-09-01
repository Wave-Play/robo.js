import { createAuditEmbed } from '../../commands/mod/audit.js'
import { hasPermission, isBanned } from '../../core/utils.js'
import { ID_NAMESPACE, BanData, Buttons } from '../../core/constants.js'
import { Flashcore, logger } from 'robo.js'
import { ButtonStyle, ComponentType } from 'discord.js'
import type { ContextConfig } from 'robo.js'
import type { Guild, GuildMember, User, UserContextMenuCommandInteraction } from 'discord.js'

export const config: ContextConfig = {
	description: 'Audit a user',
	dmPermission: false
}

export default async (interaction: UserContextMenuCommandInteraction, user: User) => {
	const member = interaction.guild?.members.cache.get(user.id) as GuildMember

	// Validate permissions
	if (!hasPermission(interaction, 'ModerateMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to unban users`)
		return interaction.followUp({
			content: `You don't have permission to use this.`,
			ephemeral: true
		})
	}

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
