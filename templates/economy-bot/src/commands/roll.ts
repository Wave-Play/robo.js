// imports
import type { CommandConfig } from '@roboplay/robo.js'
import { CommandInteraction } from 'discord.js'
import { rollDiceGame } from '../utils.js'

/**
 * @name /roll_dice
 * @description Roll a dice to test your luck and win or lose credits.
 */
export const config: CommandConfig = {
	description: 'Roll a dice to test your luck and win or lose credits.',
	options: [
		{
			name: 'number',
			description: 'Choose any number from 1-6 to bet on...',
			type: 'number',
			required: true,
			min: 1,
			max: 6
		}
	]
}

export default async (interaction: CommandInteraction) => {
	return await rollDiceGame()
}
