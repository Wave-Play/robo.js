import chalk from 'chalk'
import { client, commands, events } from './robo.js'
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Colors,
	CommandInteraction,
	Message
} from 'discord.js'
import path from 'node:path'
import { getSage, timeout } from '../cli/utils/utils.js'
import { getConfig } from '../cli/utils/config.js'
import { logger } from './logger.js'
import { BUFFER, DEFAULT_CONFIG, TIMEOUT } from './constants.js'
import fs from 'node:fs/promises'
import type {
	APIEmbed,
	APIEmbedField,
	APIMessage,
	AutocompleteInteraction,
	InteractionResponse,
	MessageComponentInteraction,
	BaseMessageOptions
} from 'discord.js'
import type { CommandConfig, EventRecord, PluginData } from '../types/index.js'
import type { Collection } from 'discord.js'
import { env } from './env.js'
import { DEBUG_MODE } from './debug.js'

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

async function printErrorResponse(error: unknown, interaction: unknown, details?: string, event?: EventRecord) {
	const { errorReplies = true } = getSage()

	// Don't print errors in production - they may contain sensitive information
	if (!DEBUG_MODE || !errorReplies) {
		return
	}

	// Return if interaction is not a Discord command interaction or a message directed at the bot
	if (!(interaction instanceof CommandInteraction) && !(interaction instanceof Message)) {
		return
	}

	try {
		const { logs, message, stack } = await formatError({ error, interaction, details, event })

		// Send response as follow-up if the command has already been replied to
		let reply: Message | APIMessage | InteractionResponse
		if (interaction instanceof CommandInteraction) {
			if (interaction.replied || interaction.deferred) {
				reply = await interaction.followUp(message)
			} else {
				reply = await interaction.reply(message)
			}
		} else if (interaction instanceof Message) {
			reply = await interaction.channel.send(message)
		}

		handleDebugButtons(reply as Message, stack, logs)
	} catch (error) {
		// This had one job... and it failed
		logger.debug('Error printing error response:', error)
	}
}

export async function sendDebugError(error: unknown) {
	try {
		// Find the guild by its ID
		const guild = client.guilds.cache.get(env.discord.guildId)
		const channel = guild?.channels?.cache?.get(env.discord.debugChannelId)
		if (!guild || !channel) {
			logger.info(
				`Fix the error or set DISCORD_GUILD_ID and DISCORD_DEBUG_CHANNEL_ID to prevent your Robo from stopping.`
			)
			return false
		}

		// Ensure the channel is a text-based channel
		if (channel.type !== ChannelType.GuildText) {
			logger.warn(`Debug channel specified is not a text-based channel.`)
			return false
		}

		// Send the message to the channel
		const { logs, message, stack } = await formatError({ error })
		const reply = await channel.send(message)
		handleDebugButtons(reply, stack, logs)
		logger.debug(`Message sent to channel ${env.discord.debugChannelId} in guild ${env.discord.guildId}.`)
		return true
	} catch (error) {
		logger.error('Error sending message:', error)
		return false
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
		const fileContent = await fs.readFile(path.resolve(file), 'utf-8')
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

interface FormatErrorOptions {
	details?: string
	error: unknown
	event?: EventRecord
	interaction?: unknown
}

interface FormatErrorResult {
	logs: string[]
	message: BaseMessageOptions
	stack?: string
}

async function formatError(options: FormatErrorOptions): Promise<FormatErrorResult> {
	const { details, error, event, interaction } = options

	// Extract readable error message or assign default
	let message = 'There was an error while executing this command!'
	if (error instanceof Error) {
		message = error.message
	} else if (typeof error === 'string') {
		message = error
	}
	message += '\n\u200b'

	// Try to get code at fault from stack trace
	const logs = logger.getRecentLogs().map((log) => log.message())
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
			label: 'Show stack trace',
			style: ButtonStyle.Danger,
			customId: 'stack_trace'
		}),
		new ButtonBuilder({
			label: 'Show logs',
			style: ButtonStyle.Primary,
			customId: 'logs'
		})
	)

	return {
		logs: logs,
		message: {
			content: message,
			embeds: [response],
			components: [row]
		},
		stack: stack
	}
}

/**
 * Wait for user to click on the button bar and handle the response
 */
function handleDebugButtons(reply: Message, stack: string, logs: string[]) {
	reply
		.awaitMessageComponent({
			filter: (i: MessageComponentInteraction) => {
				return i.customId === 'stack_trace' || i.customId === 'logs'
			}
		})
		.then(async (i) => {
			try {
				const stackButtonDisabled = i.message.components[0].components[0].disabled
				const logsButtonDisabled = i.message.components[0].components[1].disabled

				if (i.customId === 'stack_trace') {
					// Make button disabled
					await i.update({
						components: [
							new ActionRowBuilder<ButtonBuilder>().addComponents(
								new ButtonBuilder({
									label: 'Show stack trace',
									style: ButtonStyle.Danger,
									customId: 'stack_trace',
									disabled: true
								}),
								new ButtonBuilder({
									label: 'Show logs',
									style: ButtonStyle.Primary,
									customId: 'logs',
									disabled: logsButtonDisabled
								})
							)
						]
					})

					const stackTrace = stack
						.replace('/.robo/build/commands', '')
						.replace('/.robo/build/events', '')
						.replaceAll('\n', '\n> ')
					await i.followUp('> ```js\n> ' + stackTrace + '\n> ```')
					handleDebugButtons(reply, stack, logs)
				} else if (i.customId === 'logs') {
					// Make button disabled
					await i.update({
						components: [
							new ActionRowBuilder<ButtonBuilder>().addComponents(
								new ButtonBuilder({
									label: 'Show stack trace',
									style: ButtonStyle.Danger,
									customId: 'stack_trace',
									disabled: stackButtonDisabled
								}),
								new ButtonBuilder({
									label: 'Show logs',
									style: ButtonStyle.Primary,
									customId: 'logs',
									disabled: true
								})
							)
						]
					})

					await handleLogButtons(logs, 0, i)
					handleDebugButtons(reply, stack, logs)
				}
			} catch (error) {
				// Error-ception!! T-T
				logger.debug('Error sending stack trace:', error)
			}
		})
}

const LOG_INCREMENT = 10

async function handleLogButtons(logs: string[], startIndex: number, interaction: MessageComponentInteraction) {
	const filteredLogs = logs.filter(Boolean)
	const endIndex = startIndex + LOG_INCREMENT
	const hasOlderLogs = endIndex < filteredLogs.length
	const hasNewerLogs = startIndex > 0

	const logsToShow = filteredLogs.slice(startIndex, endIndex).reverse().join('\n> ')

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder({
			label: 'Older',
			style: ButtonStyle.Secondary,
			customId: 'older_logs',
			disabled: !hasOlderLogs
		}),
		new ButtonBuilder({
			label: 'Newer',
			style: ButtonStyle.Secondary,
			customId: 'newer_logs',
			disabled: !hasNewerLogs
		})
	)
	await interaction.followUp({ content: '> ```\n> ' + logsToShow + '\n> ```', components: [row] })
	interaction.channel
		.awaitMessageComponent({
			filter: (i: MessageComponentInteraction) => {
				return i.customId === 'older_logs' || i.customId === 'newer_logs'
			}
		})
		.then(async (i) => {
			if (i.customId === 'older_logs') {
				await i.deferUpdate()
				await handleLogButtons(logs, startIndex + LOG_INCREMENT, i)
			} else if (i.customId === 'newer_logs') {
				await i.deferUpdate()
				await handleLogButtons(logs, startIndex - LOG_INCREMENT, i)
			}
		})
}
