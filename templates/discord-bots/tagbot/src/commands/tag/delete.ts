import { CommandInteraction, PermissionFlagsBits } from 'discord.js'
import { getState, setState, type CommandConfig, type CommandResult } from 'robo.js'
import { dbNameSpace } from '../../consts'

export const config: CommandConfig = {
	description: 'Delete a tag you no longer need.',
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

	if (!interaction.member || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		return {
			content: "Sorry, you're not authorized to manage tags.",
			ephemeral: true
		}
	}

	const TAG = getState(tagName.trim().replaceAll(' ', '-'), {
		namespace: dbNameSpace()
	})

	if (!TAG) {
		return 'No tag exists with that name.'
	} else {
		setState(tagName.trim().toLowerCase().replaceAll(' ', '-'), '', {
			namespace: dbNameSpace()
		})
		return 'Tag has been deleted.'
	}
}
