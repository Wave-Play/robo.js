import { maintenanceEnabled, maintenanceMessage } from '../core/config.js'
import type { MiddlewareData, MiddlewareResult } from '@roboplay/robo.js'
import type { CommandInteraction, ContextMenuCommandInteraction } from 'discord.js'

export default async (data: MiddlewareData): Promise<MiddlewareResult | void> => {
	const { auto, plugin, type } = data.record
	const isRoboDefault = !plugin && auto
	const isSelfPlugin = plugin?.name === '@roboplay/plugin-maintenance'

	// Abort if maintenance mode is disabled
	if (maintenanceEnabled && !isRoboDefault && !isSelfPlugin) {
		// Send maintenance message for commands
		if (type === 'command' || type === 'context') {
			const interaction = data.payload[0] as CommandInteraction | ContextMenuCommandInteraction
			interaction.reply(maintenanceMessage)
		}

		return { abort: true }
	}
}
