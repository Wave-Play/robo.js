import chalk from 'chalk'
import { commands, events } from './robo.js'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, CommandInteraction, Message } from 'discord.js'
import path from 'node:path'
import { getSage, timeout } from '../cli/utils/utils.js'
import { getConfig } from '../cli/utils/config.js'
import { logger } from './logger.js'
import { BUFFER, DEFAULT_CONFIG, TIMEOUT } from './constants.js'
import fs from 'node:fs/promises'
import type { APIEmbed, APIEmbedField, APIMessage, AutocompleteInteraction, InteractionResponse, MessageComponentInteraction, BaseMessageOptions } from 'discord.js'
import type { CommandConfig, EventRecord, PluginData } from '../types/index.js'
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

export async function executeCommandHandler(interaction: CommandInteraction) {
	// Find command handler
	const command = commands.get(interaction.commandName)
	if (!command) {
		logger.error(`No command matching ${interaction.commandName} was found.`)
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
		logger.error('Chat input command error:', error)
		printErrorResponse(error, interaction)
	}
}

export async function executeEventHandler(plugins: Collection<string, PluginData>, eventName: string, ...eventData: unknown[]) {
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

async function printErrorResponse(error: unknown, interaction: unknown, details?: string, event?: EventRecord) {
	const { errorReplies = true } = getSage()

	// Don't print errors in production - they may contain sensitive information
	if (process.env.NODE_ENV === 'production' || !errorReplies) {
		return
	}

	// Return if interaction is not a Discord command interaction or a message directed at the bot
	if (!(interaction instanceof CommandInteraction) && !(interaction instanceof Message)) {
		return
	}

	try {
		// Extract readable error message or assign default
		let message = 'There was an error while executing this command!'
		if (error instanceof Error) {
			message = error.message
		} else if (typeof error === 'string') {
			message = error
		}
		message += '\n\u200b'

		// Try to get code at fault from stack trace
		const stack = error instanceof Error ? error.stack : null
		const source = error instanceof Error ? await getCodeCodeAtFault(error) : null

		// Assemble error response using fanceh embeds
		const fields: APIEmbedField[] = []

		// Include additional details available
		if (interaction instanceof CommandInteraction) {
			fields.push({
				name: 'Command',
				value: '`/' + interaction.commandName + '`'
			})
		}
		if (details) {
			fields.push({
				name: 'Details',
				value: details
			})
		}
		if (event) {
			fields.push({
				name: 'Event',
				value: '`' + event.path + '`'
			})
		}
		if (source) {
			fields.push({
				name: 'Source',
				value: `\`${source.file.replace(process.cwd(), '')}\`\n` + '```' + `${source.type}\n` + source.code + '\n```'
			})
		}

		// Assemble response as an embed
		const response: APIEmbed = {
			color: Colors.Red,
			fields: fields
		}

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder({
				label: 'Stack trace',
				style: ButtonStyle.Danger,
				customId: 'stack_trace'
			})
		)

		// Send response as follow-up if the command has already been replied to
		let reply: Message | APIMessage | InteractionResponse
		const content: BaseMessageOptions = {
			content: message,
			embeds: [response],
			components: [row]
		}

		if (interaction instanceof CommandInteraction) {
			if (interaction.replied || interaction.deferred) {
				reply = await interaction.followUp(content)
			} else {
				reply = await interaction.reply(content)
			}
		} else if (interaction instanceof Message) {
			reply = await interaction.channel.send(content)
		}

		// Wait for user to click on the "Stack trace" button
		(reply as Message).awaitMessageComponent({
			filter: (i: MessageComponentInteraction) => i.customId === 'stack_trace'
		}).then(async (i) => {
			try {
				// Make button disabled
				await i.update({
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder({
								label: 'Stack trace',
								style: ButtonStyle.Danger,
								customId: 'stack_trace',
								disabled: true
							})
						)
					]
				})
				const stackTrace = stack.replace('/.robo/build/commands', '').replace('/.robo/build/events', '').replaceAll('\n', '\n> ')
				await i.followUp('> ```js\n> ' + stackTrace + '\n> ```')
			} catch (error) {
				// Error-ception!! T-T
				logger.debug('Error sending stack trace:', error)
			}
		})
	} catch (error) {
		// This had one job... and it failed
		logger.debug('Error printing error response:', error)
	}
}
async function getCodeCodeAtFault(err: Error) {
	try {
		const stackLines = err.stack?.split('\n')
		if (!stackLines) {
			throw new Error('No stack trace found')
		}

		const stackLineRegex = /at .* \((.*):(\d+):(\d+)\)/
		const [, filePath, line, column] = stackLines[1].match(stackLineRegex) || []

		if (!filePath || !line || !column) {
			throw new Error('Could not parse stack trace')
		}

		// Read file contents
		const file = filePath.replaceAll('/.robo/build/commands', '').replaceAll('/.robo/build/events', '')
		const fileContent = await fs.readFile(
			path.resolve(file),
			'utf-8'
		)
		const lines = fileContent.split('\n')
		const lineNumber = parseInt(line, 10)
		const columnNumber = parseInt(column, 10)
		const maxLineNumber = Math.min(lineNumber + 2, lines.length)
		const lineNumberPadding = maxLineNumber.toString().length

		let result = ''
		for (let i = Math.max(lineNumber - 3, 0); i < maxLineNumber; i++) {
			const paddedLineNumber = (i + 1).toString().padStart(lineNumberPadding, ' ')
			result += `${paddedLineNumber} | ${lines[i]}\n`
			if (i === lineNumber - 1) {
				result += ' '.repeat(columnNumber + lineNumberPadding + 2) + '^' + '\n'
			}
		}

		return {
			code: result,
			file: file,
			type: file.endsWith('.ts') ? 'ts' : 'js'
		}
	} catch (error) {
		logger.debug('Error getting code at fault:', error)
		return null
	}
}
