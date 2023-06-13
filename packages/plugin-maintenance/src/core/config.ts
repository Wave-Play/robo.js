import { Flashcore, logger } from '@roboplay/robo.js'

export const FLASHCORE_KEY = '__plugin_maintenance_enabled'

export const DEFAULT_ADMIN_IDS = []
export const DEFAULT_MAINTENANCE_ENABLED = process.env.ROBO_MAINTENANCE_ENABLED === 'true' ?? false
export const DEFAULT_MAINTENANCE_MESSAGE = 'The bot is currently undergoing maintenance. Please try again later.'

export let adminIds: string[] = DEFAULT_ADMIN_IDS
export let maintenanceEnabled = DEFAULT_MAINTENANCE_ENABLED
export let maintenanceMessage = DEFAULT_MAINTENANCE_MESSAGE

export function setAdminIds(ids: string[]) {
	adminIds = ids
}

export function setMaintenanceEnabled(enabled: boolean) {
	maintenanceEnabled = enabled

	if (enabled) {
		Flashcore.set(FLASHCORE_KEY, enabled)
		logger.warn('Maintenance mode enabled.')
	}
}

export function setMaintenanceMessage(message: string) {
	maintenanceMessage = message
}

export interface PluginOptions {
	adminIds?: string[]
	maintenanceEnabled?: boolean
	maintenanceMessage?: string
}
