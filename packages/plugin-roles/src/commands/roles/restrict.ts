// imports
import { portal, type CommandConfig, CommandResult, Flashcore } from '@roboplay/robo.js'
import { type CommandInteraction, type AutocompleteInteraction, type Snowflake, PermissionFlagsBits } from 'discord.js'
import { hasPerm } from '../../core/utils.js'
import { RoleRestrictionData } from '../../core/types.js'

export const config: CommandConfig = {
	description: 'Configure restrictions for specific commands to designated roles',
	dmPermission: false,
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
			description: 'Change Restriction Status',
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
	const results: Array<{ name: string; value: string }> = []
	collection.forEach((x) => results.push({ name: x.key.toUpperCase(), value: x.key.toLowerCase() }))
	return results.map((r) => r)
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	// values
	const command = interaction.options.get('command')?.value
	const role = interaction.options.get('role')?.value
	const restrict = interaction.options.get('restrict')?.value

	// check
	if (!hasPerm(interaction, PermissionFlagsBits.ManageGuild)) {
		return {
			content: `🌡️ Insufficient permissions to use this command!`,
			ephemeral: true
		}
	}

	// get data
	const data: RoleRestrictionData[] | undefined = await Flashcore.get(`__roles_Setup_Restrict@${interaction.guild!.id}`)

	let newData: RoleRestrictionData[] = []
	// check data
	if (data) {
		newData = data
	}

	// check
	newData.forEach((x, i) => {
		if (x.command == (command as string) && x.role == role) {
			// already exist delete it
			delete newData[i]
		}
	})

	// add data
	newData.push({
		command: command as string,
		role: role as Snowflake,
		restrict: (restrict as boolean) ?? true
	})

	// filter
	newData = newData.filter((x) => x !== undefined)
	newData = newData.filter((x) => x.restrict == true)
	newData = newData.filter((x) => x.command !== 'roles/restrict')

	// save
	await Flashcore.set(`__roles_Setup_Restrict@${interaction.guild!.id}`, newData)
	return {
		content: '☑️ Restriction successfully configured!'
	}
}
