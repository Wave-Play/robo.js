import { portal } from 'robo.js'
import type { CommandConfig } from 'robo.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	description: `Check if a specific module is enabled`,
	options: [
		{
			name: 'module',
			description: 'The module to check',
			required: true
		}
	]
}

export default (interaction: CommandInteraction) => {
	const module = interaction.options.get('module')?.value as string
	return `Module "${module}" is enabled: ${portal.module(module).isEnabled}`
}
