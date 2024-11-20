import {
	excludeCommands,
	excludeContexts,
	excludeEvents,
	maintenanceEnabled,
	maintenanceMessage
} from '../core/config.js'
import type { MiddlewareData, MiddlewareResult } from 'robo.js'
import type { CommandInteraction, ContextMenuCommandInteraction } from 'discord.js'

export default async (data: MiddlewareData): Promise<MiddlewareResult | void> => {
	const { auto, key, plugin, type } = data.record
	const isRoboDefault = !plugin && auto
	const isSelfPlugin = plugin?.name === '@robojs/maintenance'

	// Abort if maintenance mode is disabled
	if (maintenanceEnabled && !isRoboDefault && !isSelfPlugin) {
		// Send maintenance message for commands
		if (type === 'command' || type === 'context') {
			const interaction = data.payload[0] as CommandInteraction | ContextMenuCommandInteraction
			interaction.reply(maintenanceMessage)
		}

		// Abort as long as it's not explicitly excluded
		const isExcludedCommand = type === 'command' && excludeCommands.includes(key)
		const isExcludedContext = type === 'context' && excludeContexts.includes(key)
		const isExcludedEvent = type === 'event' && excludeEvents.includes(key)

		if (!isExcludedCommand && !isExcludedContext && !isExcludedEvent) {
			return { abort: true }
		}
	}
}
