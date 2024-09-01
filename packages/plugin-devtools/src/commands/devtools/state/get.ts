import { logger } from '../../../core/helpers.js'
import { getState, State } from 'robo.js'
import { Colors } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type { APIEmbedField, AutocompleteInteraction, CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	description: 'Get a state value',
	options: [
		{
			name: 'key',
			description: 'The key to get',
			required: true
		},
		{
			name: 'fork',
			description: 'The fork to get the state from',
			autocomplete: true
		}
	]
}

export default (interaction: CommandInteraction): CommandResult => {
	const key = interaction.options.get('key')?.value as string
	const fork = interaction.options.get('fork')?.value as string | undefined

	// Get the state (and time it)
	const start = Date.now()
	const result = fork ? State.fork(fork).getState(key) : getState(key)

	// Create embed fields
	const fields: APIEmbedField[] = [
		{
			name: 'Key',
			value: key,
			inline: true
		},
		{
			name: 'Value',
			value: '`' + (result ?? 'undefined') + '`',
			inline: true
		},
		{
			name: '',
			value: '\u200b',
			inline: true
		},
		{
			name: 'Type',
			value: typeof result,
			inline: true
		}
	]

	if (fork) {
		fields.push({
			name: 'Fork',
			value: fork,
			inline: true
		})
	}

	// Log the result
	logger.custom(
		'dev',
		`State.get(${key}): ${result}${fork ? ` (Fork: ${fork})` : ''} - Type: ${typeof result} - Time: ${
			Date.now() - start
		}ms`
	)

	// Render as fancy embed
	return {
		embeds: [
			{
				title: 'State.get()',
				fields: fields,
				color: Colors.DarkNavy
			}
		]
	}
}

export function autocomplete(interaction: AutocompleteInteraction) {
	const value = interaction.options.getFocused().trim().toLowerCase()
	return State.listForks()
		.filter((fork) => fork.includes(value))
		.map((fork) => ({ name: fork, value: fork }))
}
