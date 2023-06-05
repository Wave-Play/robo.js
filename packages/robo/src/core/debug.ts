import { hasProperties } from '../cli/utils/utils.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChannelType,
	Colors,
	CommandInteraction,
	Message
} from 'discord.js'
import { getSage } from '../cli/utils/utils.js'
import { client } from './robo.js'
import { logger } from './logger.js'
import type {
	APIEmbed,
	APIEmbedField,
	APIMessage,
	BaseMessageOptions,
	InteractionResponse,
	MessageComponentInteraction
} from 'discord.js'
import { env } from './env.js'
import path from 'node:path'
import { setState } from './state.js'
import { isMainThread, parentPort } from 'node:worker_threads'
import type { CommandConfig, Event, HandlerRecord } from '../types/index.js'

export const DEBUG_MODE = process.env.NODE_ENV !== 'production'

// eslint-disable-next-line no-control-regex
export const ANSI_REGEX = /\x1b\[.*?m/g

export const devLogCommand = async (interaction: CommandInteraction) => {
	await interaction.deferReply()
	const logs = logger.getRecentLogs().map((log) => log.message())
	handleLogButtons(logs, 0, interaction as unknown as MessageComponentInteraction)
}

export const devLogCommandConfig: CommandConfig = {
	description: 'View most recent logs',
	sage: {
		defer: false
	}
}

export const devRestartCommand = async (interaction: CommandInteraction) => {
	await interaction.reply({
		content: '```bash\nRestarting...\n```'
	})
	setState('__robo_restart', {
		channelId: interaction.channelId,
		guildId: interaction.guildId,
		startTime: Date.now()
	})

	if (isMainThread) {
		process.send?.({ type: 'restart' })
	} else {
		parentPort?.postMessage({ event: 'restart', payload: 'trigger' })
	}
}

export const devRestartCommandConfig: CommandConfig = {
	description: 'Restart this Robo',
	sage: {
		defer: false
	}
}

export const devStatusCommand = () => {
	let totalSeconds = client.uptime / 1000
	const days = Math.floor(totalSeconds / 86400)
	const hours = Math.floor(totalSeconds / 3600)
	totalSeconds %= 3600
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = Math.floor(totalSeconds % 60)

	let uptime = ''
	if (days > 0) uptime += `${days} days, `
	if (hours > 0) uptime += `${hours} hours, `
	if (minutes > 0) uptime += `${minutes} minutes, `
	if (seconds > 0) uptime += `${seconds} seconds`
	uptime = uptime.replace(/, $/, '')

	const cpuUsage = process.cpuUsage()
	const cpuUsagePercent = ((cpuUsage.user + cpuUsage.system) / 1000000).toFixed(2)

	const memoryUsage = process.memoryUsage().rss / (1024 * 1024)
	const totalMemory = os.totalmem() / (1024 * 1024 * 1024)
	const freeMemory = os.freemem() / (1024 * 1024 * 1024)

	return {
		embeds: [
			{
				title: 'Bot Status',
				color: Colors.Blurple,
				fields: [
					{ name: 'Uptime', value: uptime, inline: true },
					{ name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
					{ name: '\u200B', value: '\u200B', inline: true },
					{ name: 'CPU Usage', value: `${cpuUsagePercent}%`, inline: true },
					{ name: 'RAM Usage', value: `${memoryUsage.toFixed(2)} MB`, inline: true },
					{ name: '\u200B', value: '\u200B', inline: true },
					{ name: 'Total RAM', value: `${totalMemory.toFixed(2)} GB`, inline: true },
					{ name: 'Available RAM', value: `${freeMemory.toFixed(2)} GB`, inline: true },
					{ name: '\u200B', value: '\u200B', inline: true },
					{
						name: 'Operating System',
						value: `${os.platform()} ${os.version()} ${os.arch()} (${os.release()})`,
						inline: false
					}
				]
			}
		]
	}
}

export const devStatusCommandConfig: CommandConfig = {
	description: 'View status of this Robo'
}

export async function printErrorResponse(
	error: unknown,
	interaction: unknown,
	details?: string,
	event?: HandlerRecord<Event>
) {
	const { errorReplies = true } = getSage()
	logger.debug('Error response:', error)

	// Don't print errors in production - they may contain sensitive information
	if (!DEBUG_MODE || !errorReplies) {
		return
	}

	// Return if interaction is not a Discord command interaction or a message directed at the bot
	if (
		!(interaction instanceof CommandInteraction) &&
		!(interaction instanceof Message) &&
		!(interaction instanceof ButtonInteraction)
	) {
		return
	}

	try {
		const { logs, message, stack } = await formatError({ error, interaction, details, event })

		// Send response as follow-up if the command has already been replied to
		let reply: Message | APIMessage | InteractionResponse
		if (interaction instanceof CommandInteraction || interaction instanceof ButtonInteraction) {
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
	event?: HandlerRecord<Event>
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
	message = message.replace(ANSI_REGEX, '')
	message += '\n\u200b'

	// Try to get code at fault from stack trace
	const logs = logger.getRecentLogs().map((log) => log.message())
	const stack = error instanceof Error ? error.stack : null
	const source = error instanceof Error ? await getCodeCodeAtFault(error) : null

	// Assemble error response using fanceh embeds
	const fields: APIEmbedField[] = []

	// Include additional details available
	if (interaction instanceof CommandInteraction) {
		const commandKeys = [interaction.commandName]
		if (hasProperties<{ getSubcommandGroup: () => string }>(interaction.options, ['getSubcommandGroup'])) {
			try {
				commandKeys.push(interaction.options.getSubcommandGroup())
			} catch {
				// Ignore
			}
		}
		if (hasProperties<{ getSubcommand: () => string }>(interaction.options, ['getSubcommand'])) {
			try {
				commandKeys.push(interaction.options.getSubcommand())
			} catch {
				// Ignore
			}
		}

		fields.push({
			name: 'Command',
			value: '`/' + commandKeys.filter(Boolean).join(' ') + '`'
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
