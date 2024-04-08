import { logger } from '../../../core/helpers.js'
import { Colors } from 'discord.js'
import { Flashcore } from 'robo.js'
import type { CommandResult } from 'robo.js'

export default async (): Promise<CommandResult> => {
	// Clear all values (and time it)
	const start = Date.now()
	const result = await Flashcore.clear()

	// Log the result
	logger.custom('dev', `Flashcore.clear():`, result, `- Time: ${Date.now() - start}ms`)

	// Render as fancy embed
	return {
		embeds: [
			{
				title: 'Flashcore.clear()',
				color: Colors.DarkNavy,
				fields: [
					{
						name: 'Success',
						value: result + ''
					}
				]
			}
		]
	}
}
