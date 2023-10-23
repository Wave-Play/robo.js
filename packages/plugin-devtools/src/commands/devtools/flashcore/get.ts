import { logger } from '../../../core/helpers.js'
import { Flashcore } from '@roboplay/robo.js'
import { Colors } from 'discord.js'
import type { CommandConfig, CommandResult } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	options: [
		{
			name: 'key',
			description: 'The key to get',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const key = interaction.options.get('key')?.value as string

	// Get the value (and time it)
	const start = Date.now()
	const value = await Flashcore.get(key)

	// Log the result
	logger.custom('dev', `Flashcore.get(${key}):`, value, `- Time: ${Date.now() - start}ms - Type: ${typeof value}`)

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
						name: 'Type',
						value: typeof value
					}
				]
			}
		]
	}
}
