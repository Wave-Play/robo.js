import { portal } from 'robo.js'
import type { CommandConfig } from 'robo.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	description: `Set a module's enabled state`,
	options: [
		{
			name: 'enabled',
			description: 'Whether the module should be enabled',
			type: 'boolean',
			required: true
		},
		{
			name: 'module',
			description: 'The module to disable',
			required: true
		}
	]
}

export default (interaction: CommandInteraction) => {
	const module = interaction.options.get('module')?.value as string
	portal.module(module).setEnabled(false)
	return `Disabled module: "${module}"`
}
