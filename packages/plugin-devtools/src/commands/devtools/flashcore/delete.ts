import { logger } from '../../../core/helpers.js'
import { Flashcore } from '@roboplay/robo.js'
import { Colors } from 'discord.js'
import type { CommandConfig, CommandResult } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	options: [
		{
			name: 'key',
			description: 'The key to delete',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const key = interaction.options.get('key')?.value as string

	// Delete the value (and time it)
	const start = Date.now()
	const result = await Flashcore.delete(key)

	// Log the result
	logger.custom('dev', `Flashcore.delete(${key}):`, result, `- Time: ${Date.now() - start}ms`)

	// Render as fancy embed
	return {
		embeds: [
			{
				title: 'Flashcore.delete()',
				color: Colors.DarkNavy,
				fields: [
					{
						name: 'Key',
						value: key
					},
					{
						name: 'Success',
						value: result + ''
					}
				]
			}
		]
	}
}
