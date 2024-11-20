import { Flashcore, logger } from 'robo.js'

const env = {
	excludeCommands: process.env.ROBO_MAINTENANCE_EXCLUDE_COMMANDS,
	excludeContexts: process.env.ROBO_MAINTENANCE_EXCLUDE_CONTEXTS,
	excludeEvents: process.env.ROBO_MAINTENANCE_EXCLUDE_EVENTS,
	maintenanceEnabled: process.env.ROBO_MAINTENANCE_ENABLED
}

export const FLASHCORE_KEY = '__plugin_maintenance_enabled'

export const DEFAULT_EXCLUDE_COMMANDS = env.excludeCommands ? env.excludeCommands.split(',').map((x) => x.trim()) : []
export const DEFAULT_EXCLUDE_CONTEXTS = env.excludeEvents ? env.excludeEvents.split(',').map((x) => x.trim()) : []
export const DEFAULT_EXCLUDE_EVENTS = env.excludeEvents ? env.excludeEvents.split(',').map((x) => x.trim()) : ['_start']
export const DEFAULT_MAINTENANCE_ENABLED = env.maintenanceEnabled === 'true'
export const DEFAULT_MAINTENANCE_MESSAGE = 'The bot is currently undergoing maintenance. Please try again later.'

export let excludeCommands: string[] = DEFAULT_EXCLUDE_COMMANDS
export let excludeContexts: string[] = DEFAULT_EXCLUDE_CONTEXTS
export let excludeEvents: string[] = DEFAULT_EXCLUDE_EVENTS
export let maintenanceEnabled = DEFAULT_MAINTENANCE_ENABLED
export let maintenanceMessage = DEFAULT_MAINTENANCE_MESSAGE

export function setExcludeCommands(commands: string[]) {
	excludeCommands = commands
}

export function setExcludeContexts(contexts: string[]) {
	excludeContexts = contexts
}

export function setExcludeEvents(events: string[]) {
	excludeEvents = events
}

export function setMaintenanceEnabled(enabled: boolean) {
	maintenanceEnabled = enabled

	if (enabled) {
		Flashcore.set(FLASHCORE_KEY, enabled)
		logger.warn('Maintenance mode enabled.')
	} else {
		logger.info('Maintenance mode disabled.')
	}
}

export function setMaintenanceMessage(message: string) {
	maintenanceMessage = message
}

export interface PluginOptions {
	excludeCommands?: string[]
	excludeContexts?: string[]
	excludeEvents?: string[]
	maintenanceEnabled?: boolean
	maintenanceMessage?: string
}
