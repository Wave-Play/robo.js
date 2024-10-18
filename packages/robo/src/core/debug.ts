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
	Message,
	PartialGroupDMChannel,
	TextChannel
} from 'discord.js'
import { getSage } from '../cli/utils/utils.js'
import { client } from './robo.js'
import { logger } from './logger.js'
import { env } from './env.js'
import { URL } from 'node:url'
import { getState, setState } from './state.js'
import { isMainThread, parentPort } from 'node:worker_threads'
import { STATE_KEYS, discordLogger } from './constants.js'
import path from 'node:path'
import { color } from './color.js'
import type { CommandConfig, Event, HandlerRecord } from '../types/index.js'
import type { APIEmbed, APIEmbedField, BaseMessageOptions, MessageComponentInteraction } from 'discord.js'

const DEBUG_ID_PREFIX = 'robo_debug_'

const LOG_INCREMENT = 10

export const DEBUG_MODE = process.env.NODE_ENV !== 'production'

// eslint-disable-next-line no-control-regex
export const ANSI_REGEX = /\x1b\[.*?m/g

interface ErrorData {
	logIndex?: number
	logs: string[]
	stack?: string
}

export const devLogCommand = async (interaction: CommandInteraction) => {
	await interaction.deferReply()

	// Increment session error counter
	const logs = logger.getRecentLogs().map((log) => log.message())
	const errorCounter = getState<number>(DEBUG_ID_PREFIX + 'error_counter') ?? -1
	const errorId = errorCounter + 1
	setState(DEBUG_ID_PREFIX + 'error_counter', errorId)
	setState(`${DEBUG_ID_PREFIX}_error_${errorId}`, { logs })

	handleLogs(errorId, 0, interaction as unknown as MessageComponentInteraction, 'new')
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
	setState(STATE_KEYS.restart, {
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
	const { errorChannelId, errorMessage, errorReplies = true } = getSage()
	discordLogger.debug('Error response:', error)

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
		const { message } = await formatError({ error, interaction, details, event })

		if (errorChannelId) {
			// Send to custom error channel
			const channel = client.channels.cache.get(errorChannelId) as TextChannel
			if (!channel) {
				discordLogger.error('No error channel found with ID:', errorChannelId)
				return
			}

			await channel.send(message)
			if (errorMessage) {
				await sendReply({ content: errorMessage }, interaction)
			} else {
				discordLogger.warn(
					`Set ${color.bold('errorMessage')} in your Sage config to send a default error reply to the user`
				)
			}
		} else {
			await sendReply(message, interaction)
		}
	} catch (error) {
		// This had one job... and it failed
		discordLogger.debug('Error printing error response:', error)
	}
}

// Send response as follow-up if the command has already been replied to
async function sendReply(message: BaseMessageOptions, interaction: unknown) {
	if (interaction instanceof CommandInteraction || interaction instanceof ButtonInteraction) {
		if (interaction.replied || interaction.deferred) {
			return interaction.followUp(message)
		} else {
			return interaction.reply(message)
		}
	} else if (interaction instanceof Message && !(interaction.channel instanceof PartialGroupDMChannel)) {
		return interaction.channel.send(message)
	}
}

export async function sendDebugError(error: unknown) {
	try {
		// Find the guild by its ID
		const { errorChannelId } = getSage()
		const guild = client.guilds.cache.get(env('discord.guildId'))
		const channel = guild?.channels?.cache?.get(env('discord.debugChannelId') ?? errorChannelId)
		if (!guild || !channel) {
			discordLogger.warn(
				`Fix the error or set ${color.bold('DISCORD_GUILD_ID')} and ${color.bold(
					'DISCORD_DEBUG_CHANNEL_ID'
				)} environment variables to prevent your Robo from stopping.`
			)
			return false
		}

		// Ensure the channel is a text-based channel
		if (channel.type !== ChannelType.GuildText) {
			discordLogger.warn(`Debug channel specified is not a text-based channel.`)
			return false
		}

		// Send the message to the channel
		const { message } = await formatError({ error })
		await channel.send(message)
		discordLogger.debug(`Message sent to channel ${env('discord.debugChannelId')} in guild ${env('discord.guildId')}.`)
		return true
	} catch (error) {
		discordLogger.error('Error sending message:', error)
		return true
	}
}

const stackLineRegex = /at .* \((.*):(\d+):(\d+)\)/

async function getCodeCodeAtFault(err: Error, type: 'dependency' | 'source') {
	try {
		// Parse out lines from stack trace, removing the first line
		const stackLines = err.stack?.split('\n')
		stackLines?.shift()
		if (!stackLines) {
			throw new Error('No stack trace found')
		}

		// Find first module line, removing if not the first and Robo.js to avoid underlying framework caller
		const deps = path.sep + 'node_modules' + path.sep
		const depIndex = stackLines.findIndex((line) => line.includes(deps))
		if (type === 'dependency' && depIndex > 0 && stackLines[depIndex].includes(deps + 'robo.js/')) {
			return null
		}

		// Find stack line to analyze
		const projectPredicate = (line: string) => {
			const x = line.trim()
			return x && !x.includes(deps) && !x.includes('node:') && x.includes(':') && x.includes(path.sep)
		}
		const stackLine = type === 'dependency' ? stackLines[depIndex] : stackLines.find(projectPredicate)
		const [, filePath, line, column] = stackLine.match(stackLineRegex) || []

		if (!filePath || !line || !column) {
			throw new Error('Could not parse stack trace')
		}

		// Find original source file path
		const file = filePath.replaceAll('/.robo/build/commands', '').replaceAll('/.robo/build/events', '')
		let normalizedPath = file.startsWith('file:') ? decodeURI(new URL(file).pathname) : file
		if (normalizedPath.startsWith('/') && process.platform === 'win32') {
			normalizedPath = normalizedPath.slice(1)
		}

		// Read file contents
		const fileContent = await fs.readFile(normalizedPath, 'utf-8')
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

		// Truncate entire data set presented if too long (includes decorators + safe offset)
		const extraLength = normalizedPath.length + type.length + 10 + 5
		const length = result.length + extraLength
		if (length > 1024) {
			result = result.slice(0, 1021 - extraLength) + '...'
		}

		return {
			code: result,
			file: normalizedPath,
			type: file.endsWith('.ts') ? 'ts' : 'js'
		}
	} catch (error) {
		discordLogger.debug('Error getting code at fault:', error)
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
	const { errorChannelId } = getSage()

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
	const dependencySource = error instanceof Error ? await getCodeCodeAtFault(error, 'dependency') : null
	const source = error instanceof Error ? await getCodeCodeAtFault(error, 'source') : null

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

		// Include channel and user if replying in different channel
		if (errorChannelId) {
			fields.push({
				name: 'Channel',
				value: `<#${interaction.channelId}>`
			})

			fields.push({
				name: 'User',
				value: `<@${interaction.user.id}>`
			})
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
		const filepath = source?.file?.replace(process.cwd(), '') ?? event.path
		fields.push({
			name: 'Event',
			value: '`' + filepath + '`'
		})
	}
	if (dependencySource) {
		const file = dependencySource.file.replace(process.cwd(), '')
		fields.push({
			name: 'Dependency Source',
			value: `\`${file}\`\n` + '```' + `${dependencySource.type}\n` + dependencySource.code + '\n```'
		})
	}
	if (source) {
		const file = source.file.replace(process.cwd(), '')
		fields.push({
			name: 'Project Source',
			value: `\`${file}\`\n` + '```' + `${source.type}\n` + source.code + '\n```'
		})
	}

	// Sort fields alphabetically
	fields.sort((a, b) => a.name.localeCompare(b.name))

	// Assemble response as an embed
	const response: APIEmbed = {
		color: Colors.Red,
		fields: fields
	}

	// Increment session error counter
	const errorCounter = getState<number>(DEBUG_ID_PREFIX + 'error_counter') ?? -1
	const errorId = errorCounter + 1
	setState(DEBUG_ID_PREFIX + 'error_counter', errorId)
	setState(`${DEBUG_ID_PREFIX}_error_${errorId}`, { logs, stack })

	// Assemble button bar
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder({
			label: 'Show stack trace',
			style: ButtonStyle.Danger,
			customId: `${DEBUG_ID_PREFIX}stack_trace_${errorId}`
		}),
		new ButtonBuilder({
			label: 'Show logs',
			style: ButtonStyle.Primary,
			customId: `${DEBUG_ID_PREFIX}logs_${errorId}`
		})
	)

	return {
		logs: logs,
		message: {
			content: message,
			embeds: fields.length ? [response] : [],
			components: [row]
		},
		stack: stack
	}
}

/**
 * Wait for user to click on the button bar and handle the response
 */
export async function handleDebugButton(interaction: ButtonInteraction) {
	// Only handle debug buttons made by Robo.js
	if (!interaction.isButton() || !interaction.customId.startsWith(DEBUG_ID_PREFIX)) {
		return
	}

	// Parse button ID alongside existing disabled states
	const id = interaction.customId.replace(DEBUG_ID_PREFIX, '')
	const stackButtonDisabled = interaction.message.components[0].components[0].disabled
	const logsButtonDisabled = interaction.message.components[0].components[1].disabled

	if (id.startsWith('stack_trace')) {
		const errorId = id.replace('stack_trace_', '')
		const { stack } = getState<ErrorData>(`${DEBUG_ID_PREFIX}_error_${errorId}`)

		// Make button disabled
		await interaction.update({
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder({
						label: 'Show stack trace',
						style: ButtonStyle.Danger,
						customId: `${DEBUG_ID_PREFIX}stack_trace_${errorId}`,
						disabled: true
					}),
					new ButtonBuilder({
						label: 'Show logs',
						style: ButtonStyle.Primary,
						customId: `${DEBUG_ID_PREFIX}logs_${errorId}`,
						disabled: logsButtonDisabled
					})
				)
			]
		})

		const stackTrace = stack
			.replace('/.robo/build/commands', '')
			.replace('/.robo/build/events', '')
			.replaceAll('\n', '\n> ')
		await interaction.followUp('> ```js\n> ' + stackTrace + '\n> ```')
	} else if (id.startsWith('logs')) {
		const errorId = parseInt(id.replace('logs_', ''))

		// Make button disabled
		await interaction.update({
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder({
						label: 'Show stack trace',
						style: ButtonStyle.Danger,
						customId: `${DEBUG_ID_PREFIX}stack_trace_${errorId}`,
						disabled: stackButtonDisabled
					}),
					new ButtonBuilder({
						label: 'Show logs',
						style: ButtonStyle.Primary,
						customId: `${DEBUG_ID_PREFIX}logs_${errorId}`,
						disabled: true
					})
				)
			]
		})

		handleLogs(errorId, 0, interaction, 'new')
	} else if (id.startsWith('older_logs')) {
		const errorId = parseInt(id.replace('older_logs_', ''))
		const { logIndex = 0, ...rest } = getState<ErrorData>(`${DEBUG_ID_PREFIX}_error_${errorId}`)
		setState(`${DEBUG_ID_PREFIX}_error_${errorId}`, { ...rest, logIndex: logIndex + LOG_INCREMENT })
		handleLogs(errorId, logIndex + LOG_INCREMENT, interaction, 'existing')
	} else if (id.startsWith('newer_logs')) {
		const errorId = parseInt(id.replace('newer_logs_', ''))
		const { logIndex = 0, ...rest } = getState<ErrorData>(`${DEBUG_ID_PREFIX}_error_${errorId}`)
		setState(`${DEBUG_ID_PREFIX}_error_${errorId}`, { ...rest, logIndex: logIndex - LOG_INCREMENT })
		handleLogs(errorId, logIndex - LOG_INCREMENT, interaction, 'existing')
	}
}

async function handleLogs(
	errorId: number,
	startIndex: number,
	interaction: MessageComponentInteraction,
	type: 'existing' | 'new'
) {
	const { logs } = getState<ErrorData>(`${DEBUG_ID_PREFIX}_error_${errorId}`)
	const filteredLogs = logs.filter(Boolean)
	const endIndex = startIndex + LOG_INCREMENT
	const hasOlderLogs = endIndex < filteredLogs.length
	const hasNewerLogs = startIndex > 0

	// Cap logs such that they don't exceed 2000 character limit
	const logsToShow = filteredLogs.slice(startIndex, endIndex).reverse().join('\n> ').substring(0, 1986)

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder({
			label: 'Older',
			style: ButtonStyle.Secondary,
			customId: `${DEBUG_ID_PREFIX}older_logs_${errorId}`,
			disabled: !hasOlderLogs
		}),
		new ButtonBuilder({
			label: 'Newer',
			style: ButtonStyle.Secondary,
			customId: `${DEBUG_ID_PREFIX}newer_logs_${errorId}`,
			disabled: !hasNewerLogs
		})
	)

	if (type === 'new') {
		await interaction.followUp({ content: '> ```\n> ' + logsToShow + '\n> ```', components: [row] })
	} else if (type === 'existing') {
		await interaction.update({ content: '> ```\n> ' + logsToShow + '\n> ```', components: [row] })
	}
}
