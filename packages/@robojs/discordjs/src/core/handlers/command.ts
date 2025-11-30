/**
 * Command Handler
 *
 * Executes slash command handlers with Sage mode support (auto-defer/reply).
 */
import { portal, color, Mode } from 'robo.js'
import { discordLogger } from '../logger.js'
import { executeMiddleware, getHandlerPath } from '../middleware.js'
import {
	BUFFER,
	TIMEOUT,
	extractCommandOptions,
	getSage,
	patchDeferReply,
	timeout,
	withEphemeralDefer,
	withEphemeralReply
} from '../utils.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandConfig } from '../../types/index.js'

/**
 * Handler module with callable default
 */
type HandlerWithDefault<T> = {
	default?: T
	config?: CommandConfig
	autocomplete?: unknown
	[key: string]: unknown
}

/**
 * Execute a slash command handler
 *
 * @param interaction - The Discord interaction
 * @param commandKey - The command key (e.g., "ping" or "user info")
 */
export async function executeCommandHandler(
	interaction: ChatInputCommandInteraction,
	commandKey: string
): Promise<void> {
	// Find command handler
	const command = portal.getRecord('discord', 'commands', commandKey)
	if (!command) {
		discordLogger.error(`No command matching "${commandKey}" was found.`)
		return
	}

	// Check if the command's module is enabled
	if (command.module && !portal.module(command.module).isEnabled()) {
		discordLogger.debug(`Tried to execute disabled command from module: ${color.bold(command.module)}`)
		return
	}

	if (!command.enabled) {
		discordLogger.debug(`Tried to execute disabled command: ${color.bold(commandKey)}`)
		return
	}

	// Execute middleware
	const shouldContinue = await executeMiddleware([interaction], command)
	if (!shouldContinue) {
		discordLogger.debug(`Middleware aborted command: ${color.bold(commandKey)}`)
		return
	}

	// Import handler if needed
	if (!command.handler) {
		await portal.importHandler('discord', 'commands', commandKey)
	}

	// Prepare options and config
	const cmdHandler = command.handler as HandlerWithDefault<
		(interaction: ChatInputCommandInteraction, options: Record<string, unknown>) => unknown
	> | null
	const commandConfig: CommandConfig = cmdHandler?.config as CommandConfig
	const sage = getSage(commandConfig)
	discordLogger.debug(`Sage options:`, sage)

	try {
		discordLogger.debug(`Executing command handler: ${color.bold(getHandlerPath(command))}`)
		if (!cmdHandler?.default) {
			throw `Missing default export function for command: ${color.bold('/' + commandKey)}`
		}

		// Patch deferReply to prevent failures due to multiple deferrals
		patchDeferReply(interaction)

		// Delegate to command handler
		const options = extractCommandOptions(interaction, commandConfig?.options)
		const result = cmdHandler.default(interaction, options)
		const promises: Promise<unknown>[] = []
		let response

		if (sage.defer && result instanceof Promise) {
			const bufferTime = timeout(() => BUFFER, sage.deferBuffer ?? 250)
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
		const timeoutConfig = commandConfig?.timeout
		if (promises.length > 0) {
			if (timeoutConfig) {
				promises.push(timeout(() => TIMEOUT, timeoutConfig))
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
		const isValidReply = !(reply as { id?: string }).id
		if (isValidReply && interaction.deferred) {
			await interaction.editReply(reply)
		} else if (isValidReply) {
			await interaction.reply(withEphemeralReply(reply, sage.ephemeral))
		} else {
			const command = color.bold('/' + commandKey)
			discordLogger.warn(`Invalid return value for command ${command}. Did you accidentally return a message object?`)
		}
	} catch (error) {
		discordLogger.error(error)
		await printErrorResponse(error, interaction, sage)
	}
}

/**
 * Print error response to Discord (development mode only)
 */
async function printErrorResponse(
	error: unknown,
	interaction: ChatInputCommandInteraction,
	sage: ReturnType<typeof getSage>
): Promise<void> {
	const DEBUG_MODE = Mode.get() === 'development'

	// Don't print errors in production - they may contain sensitive information
	if (!DEBUG_MODE || !sage.errorReplies) {
		return
	}

	try {
		const errorMessage = error instanceof Error ? error.message : String(error)
		const content = `An error occurred: ${errorMessage}`

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content, ephemeral: true })
		} else {
			await interaction.reply({ content, ephemeral: true })
		}
	} catch (replyError) {
		discordLogger.debug('Error printing error response:', replyError)
	}
}
