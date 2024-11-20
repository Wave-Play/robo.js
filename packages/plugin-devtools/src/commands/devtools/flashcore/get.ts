import { logger } from '../../../core/helpers.js'
import { Flashcore } from 'robo.js'
import { Colors } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	options: [
		{
			name: 'key',
			description: 'The key to get',
			required: true
		},
		{
			name: 'namespace',
			description: 'The namespace to get the value in'
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const key = interaction.options.get('key')?.value as string
	const namespace = interaction.options.get('namespace')?.value as string

	// Get the value (and time it)
	const start = Date.now()
	const value = await Flashcore.get(key, { namespace })

	// Log the result
	logger.custom(
		'dev',
		`Flashcore.get(${key}):`,
		value,
		`- Time: ${Date.now() - start}ms - Namespace: ${namespace} - Type: ${typeof value}`
	)

	// Render as fancy embed
	return {
		embeds: [
			{
				title: 'Flashcore.get()',
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
						value: typeof value
					}
				]
			}
		]
	}
}
