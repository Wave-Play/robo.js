/**
 * Context Menu Handler
 *
 * Executes context menu handlers (user/message) with Sage mode support.
 */
import { portal, color, Mode } from 'robo.js'
import { discordLogger } from '../logger.js'
import { executeMiddleware, getHandlerPath } from '../middleware.js'
import { BUFFER, TIMEOUT, getSage, timeout, withEphemeralReply } from '../utils.js'
import type { ContextMenuCommandInteraction, Message, User } from 'discord.js'
import type { ContextConfig } from '../../types/index.js'

/**
 * Handler module with callable default
 */
type HandlerWithDefault<T> = {
	default?: T
	config?: ContextConfig
	[key: string]: unknown
}

/**
 * Execute a context menu handler
 *
 * @param interaction - The Discord context menu interaction
 * @param commandKey - The context menu name
 */
export async function executeContextHandler(
	interaction: ContextMenuCommandInteraction,
	commandKey: string
): Promise<void> {
	// Find command handler
	const command = portal.getRecord('discord', 'context', commandKey)
	if (!command) {
		discordLogger.error(`No context menu command matching "${commandKey}" was found.`)
		return
	}

	// Check if the context menu's module is enabled
	if (command.module && !portal.module(command.module).isEnabled()) {
		discordLogger.debug(`Tried to execute disabled context menu command from module: ${color.bold(command.module)}`)
		return
	}

	if (!command.enabled) {
		discordLogger.debug(`Tried to execute disabled context menu command: ${color.bold(commandKey)}`)
		return
	}

	// Execute middleware
	const shouldContinue = await executeMiddleware([interaction], command)
	if (!shouldContinue) {
		discordLogger.debug(`Middleware aborted context command: ${color.bold(commandKey)}`)
		return
	}

	// Import handler if needed
	if (!command.handler) {
		await portal.importHandler('discord', 'context', commandKey)
	}

	// Prepare options and config
	const ctxHandler = command.handler as HandlerWithDefault<
		(interaction: ContextMenuCommandInteraction, target: User | Message) => unknown
	> | null
	const commandConfig: ContextConfig = ctxHandler?.config as ContextConfig
	const sage = getSage(commandConfig)
	discordLogger.debug(`Sage options:`, sage)

	try {
		discordLogger.debug(`Executing context menu handler: ${color.bold(getHandlerPath(command))}`)
		if (!ctxHandler?.default) {
			throw `Missing default export function for command: ${color.bold('/' + commandKey)}`
		}

		// Determine target
		let target: User | Message | undefined
		if (interaction.isMessageContextMenuCommand()) {
			target = interaction.targetMessage
		} else if (interaction.isUserContextMenuCommand()) {
			target = interaction.targetUser
		}

		// Delegate to context menu handler
		const result = ctxHandler.default(interaction, target!)
		const promises: Promise<unknown>[] = []
		let response

		if (sage.defer && result instanceof Promise) {
			const bufferTime = timeout(() => BUFFER, sage.deferBuffer ?? 250)
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
		const timeoutConfig = commandConfig?.timeout
		if (promises.length > 0) {
			if (timeoutConfig) {
				promises.push(timeout(() => TIMEOUT, timeoutConfig))
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
		await printErrorResponse(error, interaction, sage)
	}
}

/**
 * Print error response to Discord (development mode only)
 */
async function printErrorResponse(
	error: unknown,
	interaction: ContextMenuCommandInteraction,
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
