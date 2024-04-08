import { logger } from '../../../core/helpers.js'
import { Colors } from 'discord.js'
import { Flashcore } from 'robo.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type { AutocompleteInteraction, CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	options: [
		{
			name: 'key',
			description: 'The key to set',
			required: true
		},
		{
			name: 'value',
			description: 'The value to set',
			required: true
		},
		{
			name: 'namespace',
			description: 'The namespace to set the value in'
		},
		{
			name: 'type',
			description: 'The type of value to set',
			autocomplete: true
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const key = interaction.options.get('key')?.value as string
	const value = interaction.options.get('value')?.value as string
	const namespace = interaction.options.get('namespace')?.value as string
	const type = interaction.options.get('type')?.value as string

	// Parse the value based on the type given
	let parsedValue: unknown = value
	if (type === 'number') {
		parsedValue = Number(value)
	} else if (type === 'boolean') {
		parsedValue = value === 'true'
	} else if (type === 'object') {
		parsedValue = JSON.parse(value)
	} else if (type === 'array') {
		parsedValue = JSON.parse(value)
	} else if (type === 'null') {
		parsedValue = null
	} else if (type === 'undefined') {
		parsedValue = undefined
	}

	// Set the value (and time it)
	const start = Date.now()
	const result = await Flashcore.set(key, parsedValue, { namespace })

	// Log the result
	logger.custom(
		'dev',
		`Flashcore.set(${key}):`,
		parsedValue,
		`- Success: ${result} - Time: ${Date.now() - start}ms - Namespace: ${namespace} - Type: ${typeof parsedValue}`
	)

	// Render as fancy embed
	return {
		embeds: [
			{
				title: 'Flashcore.set()',
				color: Colors.DarkNavy,
				fields: [
					{
						name: 'Key',
						value: key
					},
					{
						name: 'Value',
						value: '`' + (value ?? 'undefined') + '`'
					},
					{
						name: 'Namespace',
						value: namespace ?? 'none'
					},
					{
						name: 'Type',
						value: type ?? typeof value
					}
				]
			}
		]
	}
}

export const autocomplete = async (interaction: AutocompleteInteraction) => {
	const focusedValue = interaction.options.getFocused().trim().toLowerCase()
	const options = ['string', 'number', 'boolean', 'object', 'array', 'null', 'undefined']
	const filteredOptions = options.filter((option) => option.startsWith(focusedValue))

	return filteredOptions.map((option) => ({
		name: option,
		value: option
	}))
}
