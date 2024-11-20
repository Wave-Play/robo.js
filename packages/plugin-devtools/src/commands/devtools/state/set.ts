import { logger } from '../../../core/helpers.js'
import { setState, State } from 'robo.js'
import { Colors } from 'discord.js'
import type { CommandConfig } from 'robo.js'
import type { APIEmbedField, AutocompleteInteraction, CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	description: 'Set a state value',
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
			name: 'fork',
			description: 'The fork to get the state from',
			autocomplete: true
		},
		{
			name: 'persist',
			description: 'Whether to persist the value in Flashcore',
			type: 'boolean'
		},
		{
			name: 'type',
			description: 'The type of value to set',
			autocomplete: true
		}
	]
}

export default async (interaction: CommandInteraction) => {
	const key = interaction.options.get('key')?.value as string
	const value = interaction.options.get('value')?.value as string
	const fork = interaction.options.get('fork')?.value as string | undefined
	const persisted = interaction.options.get('persist')?.value as boolean
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

	// Set the state (and time it)
	const start = Date.now()
	if (fork) {
		State.fork(fork).setState(key, parsedValue, {
			persist: persisted
		})
	} else {
		setState(key, parsedValue, {
			persist: persisted
		})
	}

	// Create embed fields
	const fields: APIEmbedField[] = [
		{
			name: 'Key',
			value: key,
			inline: true
		},
		{
			name: 'Value',
			value: '`' + (value ?? 'undefined') + '`',
			inline: true
		},
		{
			name: '',
			value: '\u200b',
			inline: true
		},
		{
			name: 'Type',
			value: type ?? typeof value,
			inline: true
		},
		{
			name: 'Persisted',
			value: '`' + persisted + '`',
			inline: true
		},
		{
			name: '',
			value: '\u200b',
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
		`State.set(${key}): ${parsedValue} ${
			fork ? ` (Fork: ${fork})` : ''
		} - Persisted: ${persisted} - Type: ${type} - Time: ${Date.now() - start}ms`
	)

	// Render as fancy embed
	return {
		embeds: [
			{
				title: 'State.set()',
				fields: fields,
				color: Colors.DarkNavy
			}
		]
	}
}

export const autocomplete = (interaction: AutocompleteInteraction) => {
	const focus = interaction.options.getFocused(true)

	if (focus.name === 'type') {
		const focusedValue = focus.value.trim().toLowerCase()
		const options = ['string', 'number', 'boolean', 'object', 'array', 'null', 'undefined']
		const filteredOptions = options.filter((option) => option.startsWith(focusedValue))

		return filteredOptions.map((option) => ({
			name: option,
			value: option
		}))
	} else if (focus.name === 'fork') {
		const focusedValue = focus.value.trim().toLowerCase()
		return State.listForks()
			.filter((fork) => fork.includes(focusedValue))
			.map((fork) => ({ name: fork, value: fork }))
	}
}
