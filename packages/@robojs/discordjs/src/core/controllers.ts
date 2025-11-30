/**
 * Controller factories for @robojs/discordjs
 *
 * Controllers provide plugin-specific APIs for the unified portal design.
 * Each route type has its own controller with specialized methods.
 */
import type {
	CommandController,
	ContextController,
	EventController,
	MiddlewareController,
	PluginState
} from '../types/index.js'

/**
 * Handler record type with the properties we need for controllers.
 * This matches the HandlerRecord from robo.js.
 */
interface ControllerRecord {
	enabled: boolean
	metadata: Record<string, unknown>
}

/**
 * Get or create a plugin state object.
 * The state is stored in the pluginState passed to controller factories.
 */
function ensurePluginState(pluginState: unknown): PluginState {
	const state = pluginState as PluginState | undefined
	if (!state) {
		return {
			serverRestrictions: new Map(),
			config: {}
		}
	}
	if (!state.serverRestrictions) {
		state.serverRestrictions = new Map()
	}
	return state
}

/**
 * Factory function for command controllers.
 * Called by core when user accesses portal.discord.command()
 */
export function createCommandController(
	name: string,
	record: ControllerRecord,
	pluginState: unknown
): CommandController {
	const state = ensurePluginState(pluginState)

	return {
		isEnabled() {
			return record.enabled
		},

		setEnabled(value: boolean) {
			record.enabled = value
		},

		setServerOnly(serverIds: string | string[]) {
			const ids = Array.isArray(serverIds) ? serverIds : [serverIds]
			state.serverRestrictions.set(`command:${name}`, ids)
		},

		isEnabledForServer(serverId: string) {
			if (!record.enabled) return false
			const restrictions = state.serverRestrictions.get(`command:${name}`)
			if (!restrictions) return true // No restrictions = enabled everywhere
			return restrictions.includes(serverId)
		},

		getMetadata() {
			return record.metadata
		}
	}
}

/**
 * Factory function for context menu controllers.
 * Called by core when user accesses portal.discord.context()
 */
export function createContextController(
	name: string,
	record: ControllerRecord,
	pluginState: unknown
): ContextController {
	const state = ensurePluginState(pluginState)

	return {
		isEnabled() {
			return record.enabled
		},

		setEnabled(value: boolean) {
			record.enabled = value
		},

		setServerOnly(serverIds: string | string[]) {
			const ids = Array.isArray(serverIds) ? serverIds : [serverIds]
			state.serverRestrictions.set(`context:${name}`, ids)
		},

		isEnabledForServer(serverId: string) {
			if (!record.enabled) return false
			const restrictions = state.serverRestrictions.get(`context:${name}`)
			if (!restrictions) return true
			return restrictions.includes(serverId)
		},

		getMetadata() {
			return record.metadata
		}
	}
}

/**
 * Factory function for event controllers.
 * Called by core when user accesses portal.discord.event()
 */
export function createEventController(
	name: string,
	record: ControllerRecord,
	pluginState: unknown
): EventController {
	const state = ensurePluginState(pluginState)

	return {
		isEnabled() {
			return record.enabled
		},

		setEnabled(value: boolean) {
			record.enabled = value
		},

		setServerOnly(serverIds: string | string[]) {
			const ids = Array.isArray(serverIds) ? serverIds : [serverIds]
			state.serverRestrictions.set(`event:${name}`, ids)
		},

		isEnabledForServer(serverId: string) {
			if (!record.enabled) return false
			const restrictions = state.serverRestrictions.get(`event:${name}`)
			if (!restrictions) return true
			return restrictions.includes(serverId)
		}
	}
}

/**
 * Factory function for middleware controllers.
 * Called by core when user accesses portal.discord.middleware()
 */
export function createMiddlewareController(
	name: string,
	record: ControllerRecord,
	_pluginState: unknown
): MiddlewareController {
	return {
		isEnabled() {
			return record.enabled
		},

		setEnabled(value: boolean) {
			record.enabled = value
		},

		getOrder() {
			return (record.metadata.order as number) ?? 0
		},

		setOrder(order: number) {
			record.metadata.order = order
		}
	}
}
