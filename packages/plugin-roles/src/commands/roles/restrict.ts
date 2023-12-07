// imports
import { portal, type CommandConfig, CommandResult } from '@roboplay/robo.js'
import type { CommandInteraction, AutocompleteInteraction } from 'discord.js'
import { hasPerm } from '../../core/utils'

export const config: CommandConfig = {
	description: 'Restrict Commands',
	options: [
		{
			name: 'command',
			description: 'Command to be restricted',
			type: 'string',
			autocomplete: true,
			required: true
		},
		{
			name: 'role',
			description: 'Restricted To?',
			type: 'role',
			required: true
		},
		{
			name: 'restrict',
			description: 'Change Status',
			type: 'boolean'
		}
	]
}

/**
 * Autocomplete bot commands
 */
export const autocomplete = (interaction: AutocompleteInteraction) => {
	const query = (interaction.options.get('command')?.value as string).toString().toLowerCase().trim()
	const collection = portal.commands.filter((x) => x.key.toLowerCase().includes(query))
	let results: Array<{ name: string; value: string }> = []
	collection.forEach((x) => results.push({ name: x.key.toUpperCase(), value: x.key.toLowerCase() }))
	return results.map((r) => r)
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	// values
	const command = interaction.options.get('command')?.value
	const role = interaction.options.get('role')?.value
	const restrict = interaction.options.get('restrict')?.value

	// check
	if (!hasPerm(interaction, 'ManagePermissions')) {
		return {
			content: `You don't have permission to use this.`,
			ephemeral: true
		}
	}
	console.log(command, role, restrict)
}
