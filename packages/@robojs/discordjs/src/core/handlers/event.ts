/**
 * Event Handler
 *
 * Executes Discord gateway event handlers.
 * Supports multiple handlers per event and middleware chain.
 */
import { portal, color, Mode, getPluginOptions } from 'robo.js'
import { discordLogger } from '../logger.js'
import { executeMiddleware, getHandlerPath } from '../middleware.js'
import { timeout, TIMEOUT } from '../utils.js'
import type { HandlerRecord, Event } from 'robo.js'
import type { EventConfig } from '../../types/index.js'

/**
 * Default timeout for lifecycle events (5 seconds)
 */
const DEFAULT_LIFECYCLE_TIMEOUT = 5 * 1000

/**
 * Handler module with callable default
 */
type HandlerWithDefault<T> = {
	default?: T
	config?: EventConfig
	[key: string]: unknown
}

/**
 * Plugin data stored in config
 */
interface PluginData {
	name: string
	options?: unknown
	metaOptions?: {
		failSafe?: boolean
	}
}

/**
 * Execute all handlers for an event
 *
 * @param eventName - The Discord event name
 * @param eventData - The event arguments
 */
export async function executeEventHandler(eventName: string, ...eventData: unknown[]): Promise<void> {
	const eventsData = portal.getByType('discord:events')
	const callbacks = eventsData[eventName] as HandlerRecord<Event>[] | undefined
	if (!callbacks?.length) {
		return
	}

	const isLifecycleEvent = eventName.startsWith('_')

	// Sort by priority (lower runs first)
	const sortedCallbacks = [...callbacks].sort((a, b) => {
		const priorityA = (a.metadata?.priority as number) ?? 0
		const priorityB = (b.metadata?.priority as number) ?? 0
		return priorityA - priorityB
	})

	await Promise.all(
		sortedCallbacks.map(async (callback: HandlerRecord<Event>, index: number) => {
			try {
				discordLogger.debug(`Executing event handler: ${color.bold(getHandlerPath(callback))}`)

				// Import handler if needed
				if (!callback.handler) {
					await portal.importHandler('discord', 'events', eventName)
				}

				if (!callback.handler?.default) {
					throw `Missing default export function for event: ${color.bold(eventName)}`
				}

				// Check if the event's module is enabled
				if (callback.module && !portal.module(callback.module).isEnabled()) {
					discordLogger.debug(`Tried to execute disabled event from module: ${color.bold(callback.module)}`)
					return
				}

				if (!callback.enabled) {
					discordLogger.debug(`Tried to execute disabled event: ${color.bold(eventName)}:${index}`)
					return
				}

				// Execute middleware
				const shouldContinue = await executeMiddleware(eventData, callback)
				if (!shouldContinue) {
					discordLogger.debug(`Middleware aborted event: ${color.bold(eventName)}`)
					return
				}

				// Get plugin options if this is a plugin handler
				let pluginOptions: unknown = undefined
				if (callback.plugin?.name) {
					pluginOptions = getPluginOptions(callback.plugin.name)
				}

				// Check if 'once' - disable after this run
				const eventModule = callback.handler as unknown as HandlerWithDefault<(...args: unknown[]) => unknown> | null
				const eventConfig = eventModule?.config
				if (eventConfig?.frequency === 'once') {
					callback.enabled = false
				}

				// Execute handler without timeout if not a lifecycle event
				const handlerPromise = eventModule!.default!(...eventData, pluginOptions)

				if (!isLifecycleEvent) {
					return await handlerPromise
				}

				// Enforce timeouts for lifecycle events
				const timeoutDuration = eventConfig?.timeout ?? DEFAULT_LIFECYCLE_TIMEOUT
				const timeoutPromise = timeout(() => TIMEOUT, timeoutDuration)
				return await Promise.race([handlerPromise, timeoutPromise])
			} catch (error) {
				try {
					const pluginData = callback.plugin?.name
						? (getPluginData(callback.plugin.name) as PluginData | undefined)
						: undefined
					const metaOptions = pluginData?.metaOptions ?? {}
					let message

					if (error === TIMEOUT) {
						message = `${eventName} lifecycle event handler timed out`
						discordLogger.warn(message)
					} else if (!callback.plugin) {
						message = `Error executing ${eventName} event handler`
						discordLogger.error(message, error)
					} else if (eventName === '_start' && metaOptions.failSafe) {
						message = `${callback.plugin.name} plugin failed to start`
						discordLogger.warn(message, error)
					} else {
						message = `${callback.plugin.name} plugin error in event ${eventName}`
						discordLogger.error(message, error)
					}

					// Print error response to Discord if in development mode
					printErrorResponse(error, eventData[0], message)
				} catch (nestedError) {
					discordLogger.error(`Error handling event error...`, nestedError)
				}
			}
		})
	)
}

/**
 * Get plugin data from configuration
 */
function getPluginData(pluginName: string): PluginData | undefined {
	// This would need to be implemented based on how plugin data is stored
	// For now, return basic data from getPluginOptions
	const options = getPluginOptions(pluginName)
	if (options) {
		return { name: pluginName, options }
	}
	return undefined
}

/**
 * Print error response to Discord (development mode only)
 */
function printErrorResponse(error: unknown, firstArg: unknown, message?: string): void {
	const DEBUG_MODE = Mode.get() === 'development'

	// Don't print errors in production
	if (!DEBUG_MODE) {
		return
	}

	// Just log for now - could be extended to send to error channel
	discordLogger.debug('Event error details:', { error, message, firstArg: typeof firstArg })
}
