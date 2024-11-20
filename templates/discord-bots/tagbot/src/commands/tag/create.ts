import { CommandInteraction, PermissionFlagsBits } from 'discord.js'
import { setState, type CommandConfig, type CommandResult } from 'robo.js'
import { dbNameSpace } from '../../consts'

export const config: CommandConfig = {
	description: 'Save a tag for quick reference',
	dmPermission: false,
	options: [
		{
			name: 'tag',
			description: 'Enter tag name',
			type: 'string',
			required: true
		},
		{
			name: 'content',
			description: 'Content for this tag',
			type: 'string',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const tagName = (interaction.options.get('tag')?.value as string) ?? ''
	const tagContent = (interaction.options.get('content')?.value as string) ?? ''

	if (!interaction.member || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		return {
			content: "Sorry, you're not authorized to manage tags.",
			ephemeral: true
		}
	}

	setState(tagName.trim().toLowerCase().replaceAll(' ', '-'), tagContent, {
		namespace: dbNameSpace(),
		persist: true
	})
	return `Your tag has been saved. Use \`/tag use tag:${tagName}\` to display it.`
}
