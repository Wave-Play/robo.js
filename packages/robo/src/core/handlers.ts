import chalk from 'chalk'
import { commands, events } from './robo.js'
import { CommandInteraction } from 'discord.js'
import { getSage, timeout } from '../cli/utils/utils.js'
import { getConfig } from './config.js'
import { logger } from './logger.js'
import { BUFFER, DEFAULT_CONFIG, TIMEOUT } from './constants.js'
import { printErrorResponse } from './debug.js'
import type { AutocompleteInteraction } from 'discord.js'
import type { CommandConfig, PluginData } from '../types/index.js'
import type { Collection } from 'discord.js'

export async function executeAutocompleteHandler(interaction: AutocompleteInteraction) {
	const command = commands.get(interaction.commandName)
	if (!command) {
		logger.error(`No command matching ${interaction.commandName} was found.`)
		return
	}

	const config = getConfig()
	try {
		// Delegate to autocomplete handler
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
	const command = commands.get(commandKey)
	if (!command) {
		logger.error(`No command matching "${commandKey}" was found.`)
		return
	}

	// Prepare options and config
	const commandConfig: CommandConfig = command.handler.config
	const config = getConfig()
	const sage = getSage(commandConfig, config)
	logger.debug(`Sage options:`, sage)

	try {
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
				await interaction.deferReply({ ephemeral: sage.ephemeral })
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
		logger.error('Command error:', error)
		printErrorResponse(error, interaction)
	}
}

export async function executeEventHandler(
	plugins: Collection<string, PluginData>,
	eventName: string,
	...eventData: unknown[]
) {
	const callbacks = events.get(eventName)
	if (!callbacks?.length) {
		return Promise.resolve()
	}

	const config = getConfig()
	const isLifecycleEvent = eventName.startsWith('_')
	await Promise.all(
		callbacks.map(async (callback) => {
			try {
				logger.debug(`Executing event handler: ${chalk.bold(callback.path)}`)

				// Execute handler without timeout if not a lifecycle event
				const handlerPromise = callback.handler.default(...eventData, plugins.get(callback.plugin?.name)?.options)
				if (!isLifecycleEvent) {
					return await handlerPromise
				}

				// Enforce timeouts for lifecycle events
				const timeoutPromise = timeout(() => TIMEOUT, config?.timeouts?.lifecycle || DEFAULT_CONFIG.timeouts.lifecycle)
				return await Promise.race([handlerPromise, timeoutPromise])
			} catch (error) {
				const metaOptions = plugins.get(callback.plugin?.name)?.metaOptions ?? {}
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
			}
		})
	)
}
