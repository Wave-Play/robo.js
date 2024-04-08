import type { CommandConfig } from 'robo.js/types'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	description: 'Throws an error to test the error handler',
	options: [
		{
			name: 'async',
			description: 'Whether to throw the error asynchronously',
			type: 'boolean'
		}
	]
}

export default (interaction: CommandInteraction) => {
	const async = interaction.options.get('async')?.value as boolean

	if (async) {
		asyncError()
		return 'Throwing an async error...'
	}

	throw new Error('This is an error!')
}

async function asyncError() {
	const something = null
	// @ts-expect-error - This is supposed to be wrong
	something.trim()
}
