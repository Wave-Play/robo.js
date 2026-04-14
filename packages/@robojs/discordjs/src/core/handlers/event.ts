/**
 * Event Handler
 *
 * Executes Discord gateway event handlers.
 * Supports multiple handlers per event and middleware chain.
 */
import { portal, color, Mode, getPluginOptions, getConfig } from 'robo.js'
import { discordLogger } from '../logger.js'
import { getPluginState } from '../client.js'
import { executeMiddleware, getHandlerPath } from '../middleware.js'
import { timeout, TIMEOUT } from '../utils.js'
import type { HandlerRecord } from 'robo.js'
import type { HandlerModule } from '../handler-types.js'
import type { EventConfig } from '../../types/index.js'

/**
 * Default timeout for lifecycle events (5 seconds)
 */
const DEFAULT_LIFECYCLE_TIMEOUT = 5 * 1000

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
	await portal.ensureRoute('discordjs', 'events')

	const eventsData = portal.getByType('discordjs:events')
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

				// Import handler if needed (use importRecord for multi-handler support)
				if (!callback.handler) {
					await portal.importRecord(callback)
				}

				if (!callback.handler?.default) {
					throw new Error(`Missing default export function for event: ${color.bold(eventName)}`)
				}

				// Check if the event's module is enabled
				if (callback.module && !portal.module(callback.module).isEnabled()) {
					discordLogger.debug(`Tried to execute disabled event from module: ${color.bold(callback.module)}`)
					return
				}

				if (!callback.enabled || callback.metadata?.disabled === true) {
					discordLogger.debug(`Tried to execute disabled event: ${color.bold(eventName)}:${index}`)
					return
				}

				// Check server restrictions
				const serverOnly =
					(callback.metadata?.serverOnly as string[] | string | undefined) ??
					getPluginState()?.serverRestrictions.get(`event:${eventName}`)
				if (serverOnly) {
					const allowedServers = Array.isArray(serverOnly) ? serverOnly : [serverOnly]
					const guildId = extractGuildId(eventData)
					if (!guildId || !allowedServers.includes(guildId)) {
						discordLogger.debug(`Event "${eventName}" handler restricted to specific servers`)
						return
					}
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
				const eventModule = callback.handler as unknown as HandlerModule<(...args: unknown[]) => unknown, EventConfig> | null
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
 * Extract guild ID from event data arguments.
 * Checks common Discord.js event argument shapes.
 */
function extractGuildId(eventData: unknown[]): string | undefined {
	const firstArg = eventData[0]
	if (!firstArg || typeof firstArg !== 'object') return undefined

	const obj = firstArg as Record<string, unknown>

	// Direct guildId property (interactions, messages, etc.)
	if (typeof obj.guildId === 'string') return obj.guildId

	// Guild object with id (guild events)
	if (obj.guild && typeof obj.guild === 'object') {
		const guild = obj.guild as Record<string, unknown>
		if (typeof guild.id === 'string') return guild.id
	}

	// The event arg itself might be a guild object (guildCreate, guildDelete)
	if (typeof obj.id === 'string' && typeof obj.name === 'string') return obj.id

	return undefined
}

/**
 * Get plugin data from configuration, including metaOptions for failSafe support.
 */
function getPluginData(pluginName: string): PluginData | undefined {
	const options = getPluginOptions(pluginName)

	// Look up metaOptions from the config's plugin tuples
	try {
		const config = getConfig()
		if (config?.plugins) {
			for (const plugin of config.plugins) {
				if (Array.isArray(plugin) && plugin[0] === pluginName) {
					return {
						name: pluginName,
						options,
						metaOptions: plugin[2] as { failSafe?: boolean } | undefined
					}
				}
				if (plugin === pluginName) {
					return { name: pluginName, options }
				}
			}
		}
	} catch {
		// getConfig not available, fall through
	}

	if (options) {
		return { name: pluginName, options }
	}
	return undefined
}

/**
 * Print error response to Discord (development mode only)
 */
function printErrorResponse(error: unknown, firstArg: unknown, message?: string): void {
	const DEBUG_MODE = Mode.isDev()

	// Don't print errors in production
	if (!DEBUG_MODE) {
		return
	}

	// Just log for now - could be extended to send to error channel
	discordLogger.debug('Event error details:', { error, message, firstArg: typeof firstArg })
}
