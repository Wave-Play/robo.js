import { portal } from './robo.js'
import { CommandInteraction, ContextMenuCommandInteraction } from 'discord.js'
import { getSage, timeout, withEphemeralDefer, withEphemeralReply } from '../cli/utils/utils.js'
import { getConfig } from './config.js'
import { BUFFER, DEFAULT_CONFIG, TIMEOUT, discordLogger } from './constants.js'
import { printErrorResponse } from './debug.js'
import { color } from './color.js'
import path from 'node:path'
import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	InteractionDeferReplyOptions,
	Message
} from 'discord.js'
import type {
	CommandConfig,
	ContextConfig,
	Event,
	HandlerRecord,
	PluginData,
	SmartCommandConfig
} from '../types/index.js'

/**
 * Handle an autocomplete interaction for a registered command, enforcing enablement checks, running middleware, and invoking the command's autocomplete handler.
 *
 * If the command or its module is disabled, or the command is not enabled for the interaction's server, the handler exits without responding. Middleware may abort processing. If configured, a timeout fallback of an empty name/value list is applied. Any resulting autocomplete choices are sent via the interaction response; errors are logged.
 *
 * @param interaction - The autocomplete interaction received from Discord
 * @param commandKey - The portal key identifying the command to run autocomplete for
 */
export async function executeAutocompleteHandler(interaction: AutocompleteInteraction, commandKey: string) {
	const command = portal.commands.get(commandKey)
	if (!command) {
		discordLogger.error(`No command matching ${commandKey} was found.`)
		return
	}

	// Check if the command's module is enabled
	if (command.module && !portal.module(command.module).isEnabled) {
		discordLogger.debug(`Tried to execute disabled command from module: ${color.bold(command.module)}`)
		return
	}

	// Check if the command itself is enabled
	if (!portal.command(commandKey).isEnabled) {
		discordLogger.debug(`Tried to execute disabled command: ${color.bold(commandKey)}`)
		return
	}

	if (interaction.guildId && !portal.isEnabledForServer(commandKey, interaction.guildId)) {
		discordLogger.debug(`Command ${color.bold(commandKey)} is not enabled for server ${interaction.guildId}`)
		return
	}

	// Execute middleware
	try {
		for (const middleware of portal.middleware) {
			if (!portal.middlewareController(middleware.key || String(portal.middleware.indexOf(middleware))).isEnabled) {
				continue
			}

			if (interaction.guildId && !portal.isEnabledForServer(middleware.key || String(portal.middleware.indexOf(middleware)), interaction.guildId)) {
				continue
			}
			
			discordLogger.debug(
				`Executing middleware: ${color.bold(path.join(middleware.plugin?.path ?? '.', middleware.path))}`
			)
			const result = await middleware.handler.default({
				payload: [interaction],
				record: command
			})

			if (result && result.abort) {
				discordLogger.debug(`Middleware aborted autocomplete: ${color.bold(interaction.commandName)}`)
				return
			}
		}
	} catch (error) {
		discordLogger.error('Aborting due to middleware error:', error)
		return
	}

	const config = getConfig()
	try {
		// Delegate to autocomplete handler
		discordLogger.debug(
			`Executing autocomplete handler: ${color.bold(path.join(command.plugin?.path ?? '.', command.path))}`
		)
		const promises = [command.handler.autocomplete(interaction)]
		const timeoutDuration = config?.timeouts?.autocomplete

		// Enforce timeout only if custom timeout is configured
		if (timeoutDuration) {
			promises.push(
				timeout(
					() => [] as Array<{
						name: string;
						value: string | number;
					}>,
					timeoutDuration
				)
			)
		}

		// Wait for response or timeout
		const response = await Promise.race(promises)
		if (!response) {
			throw new Error('Autocomplete timed out')
		}

		await interaction.respond(response)
	} catch (error) {
		discordLogger.error('Autocomplete error:', error)
	}
}

/**
 * Executes a slash (chat input) command: runs middleware, invokes the command handler with extracted options, handles deferral/timeouts, and sends or edits the interaction reply.
 *
 * Runs portal and server enablement checks for the command and middleware, applies Sage deferral semantics and configured timeouts, and formats the handler's return value into an interaction response. Errors are logged and converted into an error response sent to the interaction.
 *
 * @param commandKey - The portal key identifying which command to execute (e.g., 'module/command')
 */
export async function executeCommandHandler(interaction: ChatInputCommandInteraction, commandKey: string) {
	// Find command handler
	const command = portal.commands.get(commandKey)
	if (!command) {
		discordLogger.error(`No command matching "${commandKey}" was found.`)
		return
	}

	// Check if the command's module is enabled
	if (command.module && !portal.module(command.module).isEnabled) {
		discordLogger.debug(`Tried to execute disabled command from module: ${color.bold(command.module)}`)
		return
	}

	if (!portal.command(commandKey).isEnabled) {
		discordLogger.debug(`Tried to execute disabled command: ${color.bold(commandKey)}`)
		return
	}

	if (interaction.guildId && !portal.isEnabledForServer(commandKey, interaction.guildId)) {
		discordLogger.debug(`Command ${color.bold(commandKey)} is not enabled for server ${interaction.guildId}`)
		return
	}

	// Execute middleware
	try {
		for (const middleware of portal.middleware) {
			if (!portal.middlewareController(middleware.key || String(portal.middleware.indexOf(middleware))).isEnabled) {
				continue
			}

			if (interaction.guildId && !portal.isEnabledForServer(middleware.key || String(portal.middleware.indexOf(middleware)), interaction.guildId)) {
				continue
			}
			
			discordLogger.debug(
				`Executing middleware: ${color.bold(path.join(middleware.plugin?.path ?? '.', middleware.path))}`
			)
			const result = await middleware.handler.default({
				payload: [interaction],
				record: command
			})

			if (result && result.abort) {
				discordLogger.debug(`Middleware aborted command: ${color.bold(commandKey)}`)
				return
			}
		}
	} catch (error) {
		discordLogger.error('Aborting due to middleware error:', error)
		return
	}

	// Prepare options and config
	const commandConfig: CommandConfig = command.handler.config
	const config = getConfig()
	const sage = getSage(commandConfig, config)
	discordLogger.debug(`Sage options:`, sage)

	try {
		discordLogger.debug(
			`Executing command handler: ${color.bold(path.join(command.plugin?.path ?? '.', command.path))}`
		)
		if (!command.handler.default) {
			throw `Missing default export function for command: ${color.bold('/' + commandKey)}`
		}

		// Patch deferReply to prevent failures due to multiple deferrals
		patchDeferReply(interaction)

		// Delegate to command handler
		const options = extractCommandOptions(interaction, commandConfig?.options)
		const result = command.handler.default(interaction, options)
		const promises = []
		let response

		if (sage.defer && result instanceof Promise) {
			const bufferTime = timeout(() => BUFFER, sage.deferBuffer)
			const raceResult = await Promise.race([result, bufferTime])

			if (raceResult === BUFFER && !interaction.replied) {
				discordLogger.debug(`Sage is deferring async command...`)
				promises.push(result)

				if (!interaction.deferred) {
					try {
						await interaction.deferReply(withEphemeralDefer({}, sage.ephemeral))
					} catch (error) {
						const message = error instanceof Error ? error.message : (error as string)
						if (
							!message.includes('Unknown interaction') &&
							!message.includes('Interaction has already been acknowledged')
						) {
							throw error
						} else {
							discordLogger.debug(`Interaction was already handled, skipping Sage deferral`)
						}
					}
				}
			} else {
				response = raceResult
			}
		} else if (result instanceof Promise) {
			promises.push(result)
		}

		// Enforce timeout only if custom timeout is configured
		if (promises.length > 0) {
			if (config?.timeouts?.commandDeferral) {
				promises.push(timeout(() => TIMEOUT, config.timeouts.commandDeferral))
			}

			// Wait for response or timeout
			response = await Promise.race(promises)
			if (response === TIMEOUT) {
				throw new Error('Command timed out')
			}
		} else if (!(result instanceof Promise)) {
			response = result
		}

		// Stop here if command returned nothing
		if (response === undefined) {
			discordLogger.debug('Command returned void, skipping response')
			return
		}

		discordLogger.debug(`Sage is handling reply:`, response)
		const reply = typeof response === 'string' ? { content: response } : response
		const isValidReply = !reply.id
		if (isValidReply && interaction.deferred) {
			// TODO: Fix reply objects themselves being used here
			await interaction.editReply(reply)
		} else if (isValidReply) {
			await interaction.reply(withEphemeralReply(reply, sage.ephemeral))
		} else {
			const command = color.bold('/' + commandKey)
			discordLogger.warn(`Invalid return value for command ${command}. Did you accidentally return a message object?`)
		}
	} catch (error) {
		discordLogger.error(error)
		printErrorResponse(error, interaction)
	}
}

/**
 * Handles execution of a context menu command: verifies enablement, runs middleware, invokes the command handler, and sends or edits the interaction reply.
 *
 * Performs module-, command-, and server-level enablement checks and skips execution if disabled. Runs enabled middleware in sequence and aborts if any middleware signals abort. Calls the command's default export with the interaction and the resolved target (message or user). Honors configured "sage" defer and deferral timeouts: may defer the reply, wait for the handler result, or error on timeout. If the handler returns a reply value, sends it via interaction.reply or interaction.editReply depending on deferred state. Logs errors and emits an error response to the interaction on failure.
 *
 * @param interaction - The context menu interaction to handle
 * @param commandKey - The key identifying the context menu command in the portal
 */
export async function executeContextHandler(interaction: ContextMenuCommandInteraction, commandKey: string) {
	// Find command handler
	const command = portal.context.get(commandKey)
	if (!command) {
		discordLogger.error(`No context menu command matching "${commandKey}" was found.`)
		return
	}

	// Check if the context menu's module is enabled
	if (command.module && !portal.module(command.module).isEnabled) {
		discordLogger.debug(`Tried to execute disabled context menu command from module: ${color.bold(command.module)}`)
		return
	}

	if (!portal.contextController(commandKey).isEnabled) {
		discordLogger.debug(`Tried to execute disabled context menu command: ${color.bold(commandKey)}`)
		return
	}

	if (interaction.guildId && !portal.isEnabledForServer(commandKey, interaction.guildId)) {
		discordLogger.debug(`Context menu command ${color.bold(commandKey)} is not enabled for server ${interaction.guildId}`)
		return
	}

	// Execute middleware
	try {
		for (const middleware of portal.middleware) {
			if (!portal.middlewareController(middleware.key || String(portal.middleware.indexOf(middleware))).isEnabled) {
				continue
			}

			if (interaction.guildId && !portal.isEnabledForServer(middleware.key || String(portal.middleware.indexOf(middleware)), interaction.guildId)) {
				continue
			}
			
			discordLogger.debug(
				`Executing middleware: ${color.bold(path.join(middleware.plugin?.path ?? '.', middleware.path))}`
			)
			const result = await middleware.handler.default({
				payload: [interaction],
				record: command
			})

			if (result && result.abort) {
				discordLogger.debug(`Middleware aborted context command: ${color.bold(commandKey)}`)
				return
			}
		}
	} catch (error) {
		discordLogger.error('Aborting due to middleware error:', error)
		return
	}

	// Prepare options and config
	const commandConfig: ContextConfig = command.handler.config
	const config = getConfig()
	const sage = getSage(commandConfig, config)
	discordLogger.debug(`Sage options:`, sage)

	try {
		discordLogger.debug(
			`Executing context menu handler: ${color.bold(path.join(command.plugin?.path ?? '.', command.path))}`
		)
		if (!command.handler.default) {
			throw `Missing default export function for command: ${color.bold('/' + commandKey)}`
		}

		// Determine target
		let target
		if (interaction.isMessageContextMenuCommand()) {
			target = interaction.targetMessage
		} else if (interaction.isUserContextMenuCommand()) {
			target = interaction.targetUser
		}

		// Delegate to context menu handler
		const result = command.handler.default(interaction, target)
		const promises = []
		let response

		if (sage.defer && result instanceof Promise) {
			const bufferTime = timeout(() => BUFFER, sage.deferBuffer)
			const raceResult = await Promise.race([result, bufferTime])

			if (raceResult === BUFFER && !interaction.replied) {
				discordLogger.debug(`Sage is deferring async command...`)
				promises.push(result)
				if (!interaction.deferred) {
					await interaction.deferReply(withEphemeralReply({}, sage.ephemeral))
				}
			} else {
				response = raceResult
			}
		}

		// Enforce timeout only if custom timeout is configured
		if (promises.length > 0) {
			if (config?.timeouts?.commandDeferral) {
				promises.push(timeout(() => TIMEOUT, config.timeouts.commandDeferral))
			}

			// Wait for response or timeout
			response = await Promise.race(promises)
			if (response === TIMEOUT) {
				throw new Error('Context menu command timed out')
			}
		} else if (!(result instanceof Promise)) {
			response = result
		}

		// Stop here if command returned nothing
		if (response === undefined) {
			discordLogger.debug('Context menu command returned void, skipping response')
			return
		}

		discordLogger.debug(`Sage is handling reply:`, response)
		const reply = typeof response === 'string' ? { content: response } : response
		if (interaction.deferred) {
			await interaction.editReply(reply)
		} else {
			await interaction.reply(reply)
		}
	} catch (error) {
		discordLogger.error(error)
		printErrorResponse(error, interaction)
	}
}

/**
 * Dispatches an event to all registered handlers, applying module/handler/server enablement checks, middleware, lifecycle timeouts, and per-handler error reporting.
 *
 * For each handler registered for `eventName`, this will:
 * - skip handlers whose module or handler record is disabled or not enabled for the event's guild (if present),
 * - run enabled middleware in sequence and abort the handler if any middleware returns `{ abort: true }`,
 * - invoke the handler with `...eventData` plus plugin options (if provided),
 * - for lifecycle events (names starting with `_`), race the handler against the configured lifecycle timeout,
 * - catch and report handler errors (including timeout), and call `printErrorResponse` to emit error details.
 *
 * @param plugins - Map of plugin name to PluginData containing runtime options and metadata (may be `null` if not provided).
 * @param eventName - The name of the event to dispatch.
 * @param eventData - Arbitrary event payload forwarded to middleware and handlers.
 */
export async function executeEventHandler(
	plugins: Map<string, PluginData> | null,
	eventName: string,
	...eventData: unknown[]
) {
	const callbacks = portal.events.get(eventName)
	if (!callbacks?.length) {
		return Promise.resolve()
	}

	const config = getConfig()
	const isLifecycleEvent = eventName.startsWith('_')
	await Promise.all(
		callbacks.map(async (callback: HandlerRecord<Event>, index: number) => {
			try {
				discordLogger.debug(
					`Executing event handler: ${color.bold(path.join(callback.plugin?.path ?? '.', callback.path))}`
				)
				if (!callback.handler.default) {
					throw `Missing default export function for event: ${color.bold(eventName)}`
				}

				// Check if the event's module is enabled
				if (callback.module && !portal.module(callback.module).isEnabled) {
					discordLogger.debug(`Tried to execute disabled event from module: ${color.bold(callback.module)}`)
					return
				}

				const eventKey = `${eventName}:${index}`
				if (!portal.event(eventKey).isEnabled) {
					discordLogger.debug(`Tried to execute disabled event: ${color.bold(eventKey)}`)
					return
				}

				const interaction = eventData[0] as any
				const guildId = interaction?.guildId || interaction?.guild?.id
				if (guildId && !portal.isEnabledForServer(eventKey, guildId)) {
					discordLogger.debug(`Event ${color.bold(eventKey)} is not enabled for server ${guildId}`)
					return
				}

				// Execute middleware
				try {
					for (const middleware of portal.middleware) {
						if (!portal.middlewareController(middleware.key || String(portal.middleware.indexOf(middleware))).isEnabled) {
							continue
						}

						if (guildId && !portal.isEnabledForServer(middleware.key || String(portal.middleware.indexOf(middleware)), guildId)) {
							continue
						}

						discordLogger.debug(
							`Executing middleware: ${color.bold(path.join(middleware.plugin?.path ?? '.', middleware.path))}`
						)
						const result = await middleware.handler.default({
							payload: eventData,
							record: callback
						})

						if (result && result.abort) {
							discordLogger.debug(`Middleware aborted event: ${color.bold(eventName)}`)
							return
						}
					}
				} catch (error) {
					discordLogger.error('Aborting due to middleware error:', error)
					return
				}

				// Execute handler without timeout if not a lifecycle event
				const handlerPromise = callback.handler.default(...eventData, plugins?.get(callback.plugin?.name)?.options)
				if (!isLifecycleEvent) {
					return await handlerPromise
				}

				// Enforce timeouts for lifecycle events
				const timeoutPromise = timeout(() => TIMEOUT, config?.timeouts?.lifecycle || DEFAULT_CONFIG.timeouts.lifecycle)
				return await Promise.race([handlerPromise, timeoutPromise])
			} catch (error) {
				try {
					const metaOptions = plugins?.get(callback.plugin?.name)?.metaOptions ?? {}
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
					printErrorResponse(error, eventData[0], message, callback)
				} catch (nestedError) {
					discordLogger.error(`Error handling event error...`, nestedError)
				}
			}
		})
	)
}

export function createCommandConfig<C extends CommandConfig>(config: SmartCommandConfig<C>): C {
	return config as C
}

// TODO: Consider using `null` instead of `undefined` for more explicit absence of value and DJS consistency
/**
 * Extracts command options from a Discord interaction
 */
export function extractCommandOptions(
	interaction: ChatInputCommandInteraction,
	commandOptions: CommandConfig['options']
) {
	const options: Record<string, unknown> = {}

	commandOptions?.forEach((option) => {
		const type = option.type ?? 'string'

		if (type === 'attachment') {
			options[option.name] = interaction.options.getAttachment(option.name, option.required) ?? undefined
		} else if (type === 'boolean') {
			options[option.name] = interaction.options.getBoolean(option.name, option.required) ?? undefined
		} else if (type === 'channel') {
			options[option.name] = interaction.options.getChannel(option.name, option.required) ?? undefined
		} else if (type === 'integer') {
			options[option.name] = interaction.options.getInteger(option.name, option.required) ?? undefined
		} else if (type === 'member') {
			options[option.name] = interaction.options.getMember(option.name) ?? undefined
		} else if (type === 'mention') {
			options[option.name] = interaction.options.getMentionable(option.name, option.required) ?? undefined
		} else if (type === 'number') {
			options[option.name] = interaction.options.getNumber(option.name, option.required) ?? undefined
		} else if (type === 'role') {
			options[option.name] = interaction.options.getRole(option.name, option.required) ?? undefined
		} else if (type === 'string') {
			options[option.name] = interaction.options.getString(option.name, option.required) ?? undefined
		} else if (type === 'user') {
			options[option.name] = interaction.options.getUser(option.name, option.required) ?? undefined
		}
	})

	return options
}

function patchDeferReply(interaction: CommandInteraction) {
	const originalDeferReply = interaction.deferReply.bind(interaction)
	let deferredPromise: Promise<void> | Promise<Message> | undefined
	let alreadyDeferredWithMessage = false

	// @ts-expect-error - Patch the deferReply method to prevent multiple deferrals
	interaction.deferReply = async function (
		this: CommandInteraction,
		options?: InteractionDeferReplyOptions
	): Promise<void | Message> {
		// If it's already been called, just return the stored promise
		if (deferredPromise) {
			// If user requests fetchReply this time but it wasn't fetched previously, just fetch it now.
			if (options?.fetchReply && !alreadyDeferredWithMessage) {
				return this.fetchReply()
			}

			return deferredPromise
		}

		// If not called yet:
		if (options?.fetchReply) {
			// @ts-expect-error - Defer and fetch the message right away
			deferredPromise = originalDeferReply(options)
			alreadyDeferredWithMessage = true
			return deferredPromise
		} else {
			// @ts-expect-error - Defer without fetching
			deferredPromise = originalDeferReply(options)
			return deferredPromise
		}
	}
}