import { CommandInteraction, Guild, GuildMember } from 'discord.js'
import { getState, type CommandConfig, type CommandResult } from 'robo.js'
import { dbNameSpace, tagScriptIntrepreter } from '../../consts'
import {
	ChannelTransformer,
	GuildChannel,
	GuildTransformer,
	InteractionTransformer,
	MemberTransformer,
	UserTransformer
} from '@tagscript/plugin-discord'

export const config: CommandConfig = {
	description: 'Access a saved tag',
	dmPermission: false,
	options: [
		{
			name: 'tag',
			description: 'Enter tag name',
			type: 'string',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const tagName = (interaction.options.get('tag')?.value as string) ?? ''
	const TAG = getState(tagName.trim().toLowerCase().replaceAll(' ', '-'), {
		namespace: dbNameSpace()
	})

	if (!TAG) {
		return 'No tag exists with that name.'
	} else {
		const res = await tagScriptIntrepreter.run(TAG, {
			interaction: new InteractionTransformer(interaction),
			member: new MemberTransformer(interaction.member as GuildMember),
			user: new UserTransformer(interaction.user),
			guild: new GuildTransformer(interaction.guild as Guild),
			channel: new ChannelTransformer(interaction.channel as GuildChannel)
		})
		return (
			res.body ?? {
				content: 'No direct response available for the specified tag',
				ephemeral: true
			}
		)
	}
}
