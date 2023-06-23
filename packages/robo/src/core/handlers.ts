import { portal } from './robo.js'
import { CommandInteraction, ContextMenuCommandInteraction } from 'discord.js'
import { getSage, timeout } from '../cli/utils/utils.js'
import { getConfig } from './config.js'
import { logger } from './logger.js'
import { BUFFER, DEFAULT_CONFIG, TIMEOUT } from './constants.js'
import { printErrorResponse } from './debug.js'
import { color } from './color.js'
import path from 'node:path'
import type { AutocompleteInteraction } from 'discord.js'
import type { CommandConfig, ContextConfig, PluginData } from '../types/index.js'
import type { Collection } from 'discord.js'

export async function executeAutocompleteHandler(interaction: AutocompleteInteraction, commandKey: string) {
	const command = portal.commands.get(commandKey)
	if (!command) {
		logger.error(`No command matching ${commandKey} was found.`)
		return
	}

	// Check if the autocomplete command's module is enabled
	if (!portal.module(command.module).isEnabled) {
		logger.debug(`Tried to execute disabled command from module: ${color.bold(command.module)}`)
		return
	}

	// Execute middleware
	try {
		for (const middleware of portal.middleware) {
			logger.debug(`Executing middleware: ${color.bold(path.join(middleware.plugin?.path ?? '.', middleware.path))}`)
			const result = await middleware.handler.default({
				payload: [interaction],
				record: command
			})

			if (result && result.abort) {
				logger.debug(`Middleware aborted autocomplete: ${color.bold(interaction.commandName)}`)
				return
			}
		}
	} catch (error) {
		logger.error('Aborting due to middleware error:', error)
		return
	}

	const config = getConfig()
	try {
		// Delegate to autocomplete handler
		logger.debug(`Executing autocomplete handler: ${color.bold(path.join(command.plugin?.path ?? '.', command.path))}`)
		const promises = [command.handler.autocomplete(interaction)]
		const timeoutDuration = config?.timeouts?.autocomplete

		// Enforce timeout only if custom timeout is configured
		if (timeoutDuration) {
			promises.push(timeout(() => [], timeoutDuration))
		}

		// Wait for response or timeout
		const response = await Promise.race(promises)
		if (!response) {
			throw new Error('Autocomplete timed out')
		}

		await interaction.respond(response)
	} catch (error) {
		logger.error('Autocomplete error:', error)
	}
}

export async function executeCommandHandler(interaction: CommandInteraction, commandKey: string) {
	// Find command handler
	const command = portal.commands.get(commandKey)
	if (!command) {
		logger.error(`No command matching "${commandKey}" was found.`)
		return
	}

	// Check if the command's module is enabled
	if (!portal.module(command.module).isEnabled) {
		logger.debug(`Tried to execute disabled command from module: ${color.bold(command.module)}`)
		return
	}

	// Execute middleware
	try {
		for (const middleware of portal.middleware) {
			logger.debug(`Executing middleware: ${color.bold(path.join(middleware.plugin?.path ?? '.', middleware.path))}`)
			const result = await middleware.handler.default({
				payload: [interaction],
				record: command
			})

			if (result && result.abort) {
				logger.debug(`Middleware aborted command: ${color.bold(commandKey)}`)
				return
			}
		}
	} catch (error) {
		logger.error('Aborting due to middleware error:', error)
		return
	}

	// Prepare options and config
	const commandConfig: CommandConfig = command.handler.config
	const config = getConfig()
	const sage = getSage(commandConfig, config)
	logger.debug(`Sage options:`, sage)

	try {
		logger.debug(`Executing command handler: ${color.bold(path.join(command.plugin?.path ?? '.', command.path))}`)
		if (!command.handler.default) {
			throw `Missing default export function for command: ${color.bold('/' + commandKey)}`
		}

		// Delegate to command handler
		const result = command.handler.default(interaction)
		const promises = []
		let response

		if (sage.defer && result instanceof Promise) {
			const bufferTime = timeout(() => BUFFER, sage.deferBuffer)
			const raceResult = await Promise.race([result, bufferTime])

			if (raceResult === BUFFER && !interaction.replied) {
				logger.debug(`Sage is deferring async command...`)
				promises.push(result)
				if (!interaction.deferred) {
					try {
						await interaction.deferReply({ ephemeral: sage.ephemeral })
					} catch (error) {
						const message = error instanceof Error ? error.message : (error as string)
						if (
							!message.includes('Unknown interaction') &&
							!message.includes('Interaction has already been acknowledged')
						) {
							throw error
						} else {
							logger.debug(`Interaction was already handled, skipping Sage deferral`)
						}
					}
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
				throw new Error('Command timed out')
			}
		} else if (!(result instanceof Promise)) {
			response = result
		}

		// Stop here if command returned nothing
		if (response === undefined) {
			logger.debug('Command returned void, skipping response')
			return
		}

		logger.debug(`Sage is handling reply:`, response)
		const reply = typeof response === 'string' ? { content: response } : response
		if (interaction.deferred) {
			await interaction.editReply(reply)
		} else {
			await interaction.reply(reply)
		}
	} catch (error) {
		logger.error(error)
		printErrorResponse(error, interaction)
	}
}

export async function executeContextHandler(interaction: ContextMenuCommandInteraction, commandKey: string) {
	// Find command handler
	const command = portal.context.get(commandKey)
	if (!command) {
		logger.error(`No context menu command matching "${commandKey}" was found.`)
		return
	}

	// Check if the context menu's module is enabled
	if (!portal.module(command.module).isEnabled) {
		logger.debug(`Tried to execute disabled context menu command from module: ${color.bold(command.module)}`)
		return
	}

	// Execute middleware
	try {
		for (const middleware of portal.middleware) {
			logger.debug(`Executing middleware: ${color.bold(path.join(middleware.plugin?.path ?? '.', middleware.path))}`)
			const result = await middleware.handler.default({
				payload: [interaction],
				record: command
			})

			if (result && result.abort) {
				logger.debug(`Middleware aborted context command: ${color.bold(commandKey)}`)
				return
			}
		}
	} catch (error) {
		logger.error('Aborting due to middleware error:', error)
		return
	}

	// Prepare options and config
	const commandConfig: ContextConfig = command.handler.config
	const config = getConfig()
	const sage = getSage(commandConfig, config)
	logger.debug(`Sage options:`, sage)

	try {
		logger.debug(`Executing context menu handler: ${color.bold(path.join(command.plugin?.path ?? '.', command.path))}`)
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
				logger.debug(`Sage is deferring async command...`)
				promises.push(result)
				if (!interaction.deferred) {
					await interaction.deferReply({ ephemeral: sage.ephemeral })
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
			logger.debug('Context menu command returned void, skipping response')
			return
		}

		logger.debug(`Sage is handling reply:`, response)
		const reply = typeof response === 'string' ? { content: response } : response
		if (interaction.deferred) {
			await interaction.editReply(reply)
		} else {
			await interaction.reply(reply)
		}
	} catch (error) {
		logger.error(error)
		printErrorResponse(error, interaction)
	}
}

export async function executeEventHandler(
	plugins: Collection<string, PluginData> | null,
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
		callbacks.map(async (callback) => {
			try {
				logger.debug(`Executing event handler: ${color.bold(path.join(callback.plugin?.path ?? '.', callback.path))}`)
				if (!callback.handler.default) {
					throw `Missing default export function for event: ${color.bold(eventName)}`
				}

				// Check if the command's module is enabled
				if (!portal.module(callback.module).isEnabled) {
					logger.debug(`Tried to execute disabled event from module: ${color.bold(callback.module)}`)
					return
				}

				// Execute middleware
				try {
					for (const middleware of portal.middleware) {
						logger.debug(
							`Executing middleware: ${color.bold(path.join(middleware.plugin?.path ?? '.', middleware.path))}`
						)
						const result = await middleware.handler.default({
							payload: eventData,
							record: callback
						})

						if (result && result.abort) {
							logger.debug(`Middleware aborted event: ${color.bold(eventName)}`)
							return
						}
					}
				} catch (error) {
					logger.error('Aborting due to middleware error:', error)
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
						logger.warn(message)
					} else if (!callback.plugin) {
						message = `Error executing ${eventName} event handler`
						logger.error(message, error)
					} else if (eventName === '_start' && metaOptions.failSafe) {
						message = `${callback.plugin.name} plugin failed to start`
						logger.warn(message, error)
					} else {
						message = `${callback.plugin.name} plugin error in event ${eventName}`
						logger.error(message, error)
					}

					// Print error response to Discord if in development mode
					printErrorResponse(error, eventData[0], message, callback)
				} catch (nestedError) {
					logger.error(`Error handling event error...`, nestedError)
				}
			}
		})
	)
}
