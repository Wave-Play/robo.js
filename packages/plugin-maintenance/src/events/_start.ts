import type { Client } from 'discord.js'
import {
	DEFAULT_ADMIN_IDS,
	DEFAULT_MAINTENANCE_ENABLED,
	DEFAULT_MAINTENANCE_MESSAGE,
	FLASHCORE_KEY,
	PluginOptions,
	setAdminIds,
	setMaintenanceEnabled,
	setMaintenanceMessage
} from '../core/config.js'
import { Flashcore } from '@roboplay/robo.js'

export default async (_client: Client, options: PluginOptions) => {
	const {
		adminIds = DEFAULT_ADMIN_IDS,
		maintenanceEnabled = DEFAULT_MAINTENANCE_ENABLED,
		maintenanceMessage = DEFAULT_MAINTENANCE_MESSAGE
	} = options ?? {}
	const previouslyEnabled = await Flashcore.get(FLASHCORE_KEY)

	setAdminIds(adminIds)
	if (previouslyEnabled) {
		setMaintenanceEnabled(previouslyEnabled === 'true')
	} else {
		setMaintenanceEnabled(maintenanceEnabled)
	}
	setMaintenanceMessage(maintenanceMessage)
}
