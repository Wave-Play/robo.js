import { FLASHCORE_KEY, setMaintenanceEnabled } from '../core/config.js'
import { Flashcore } from 'robo.js'
import type { CommandConfig } from 'robo.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	description: 'Set maintenance mode',
	options: [
		{
			description: 'Whether to enable or disable maintenance mode',
			name: 'enabled',
			required: true,
			type: 'boolean'
		}
	]
}

export default async (interaction: CommandInteraction) => {
	const enabled = interaction.options.get('enabled')?.value as boolean

	if (enabled) {
		setMaintenanceEnabled(true)
		await Flashcore.set(FLASHCORE_KEY, 'true')
		return 'Maintenance mode enabled.'
	} else {
		setMaintenanceEnabled(false)
		await Flashcore.set(FLASHCORE_KEY, 'false')
		return 'Maintenance mode disabled.'
	}
}
