import { Flashcore } from 'robo.js'
import {
	DEFAULT_EXCLUDE_COMMANDS,
	DEFAULT_EXCLUDE_CONTEXTS,
	DEFAULT_EXCLUDE_EVENTS,
	DEFAULT_MAINTENANCE_ENABLED,
	DEFAULT_MAINTENANCE_MESSAGE,
	FLASHCORE_KEY,
	PluginOptions,
	setExcludeCommands,
	setExcludeContexts,
	setExcludeEvents,
	setMaintenanceEnabled,
	setMaintenanceMessage
} from '../core/config.js'
import type { Client } from 'discord.js'

export default async (_client: Client, options: PluginOptions) => {
	const {
		excludeCommands = DEFAULT_EXCLUDE_COMMANDS,
		excludeContexts = DEFAULT_EXCLUDE_CONTEXTS,
		excludeEvents = DEFAULT_EXCLUDE_EVENTS,
		maintenanceEnabled = DEFAULT_MAINTENANCE_ENABLED,
		maintenanceMessage = DEFAULT_MAINTENANCE_MESSAGE
	} = options ?? {}
	const previouslyEnabled = await Flashcore.get(FLASHCORE_KEY)

	setExcludeCommands(excludeCommands)
	setExcludeContexts(excludeContexts)
	setExcludeEvents(excludeEvents)
	if (previouslyEnabled) {
		setMaintenanceEnabled(previouslyEnabled === 'true')
	} else {
		setMaintenanceEnabled(maintenanceEnabled)
	}
	setMaintenanceMessage(maintenanceMessage)
}
