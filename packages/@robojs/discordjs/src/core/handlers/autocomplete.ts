/**
 * Autocomplete Handler
 *
 * Executes autocomplete handlers for slash commands.
 */
import { portal, color } from 'robo.js'
import { discordLogger } from '../logger.js'
import { executeMiddleware, getHandlerPath } from '../middleware.js'
import { timeout } from '../utils.js'
import type { AutocompleteInteraction } from 'discord.js'
import type { CommandConfig } from '../../types/index.js'

/**
 * Handler module with autocomplete export
 */
type HandlerWithAutocomplete = {
	default?: unknown
	config?: CommandConfig
	autocomplete?: (
		interaction: AutocompleteInteraction
	) => Promise<Array<{ name: string; value: string | number }>>
	[key: string]: unknown
}

/**
 * Execute an autocomplete handler
 *
 * @param interaction - The Discord autocomplete interaction
 * @param commandKey - The command key (e.g., "search" or "user find")
 */
export async function executeAutocompleteHandler(
	interaction: AutocompleteInteraction,
	commandKey: string
): Promise<void> {
	const command = portal.getRecord('discord', 'commands', commandKey)
	if (!command) {
		discordLogger.error(`No command matching ${commandKey} was found.`)
		return
	}

	// Check if the command's module is enabled
	if (command.module && !portal.module(command.module).isEnabled()) {
		discordLogger.debug(`Tried to execute disabled command from module: ${color.bold(command.module)}`)
		return
	}

	// Check if the command itself is enabled
	if (!command.enabled) {
		discordLogger.debug(`Tried to execute disabled command: ${color.bold(commandKey)}`)
		return
	}

	// Execute middleware
	const shouldContinue = await executeMiddleware([interaction], command)
	if (!shouldContinue) {
		discordLogger.debug(`Middleware aborted autocomplete: ${color.bold(interaction.commandName)}`)
		return
	}

	try {
		// Import handler if needed
		if (!command.handler) {
			await portal.importHandler('discord', 'commands', commandKey)
		}

		const commandHandler = command.handler as HandlerWithAutocomplete | null

		// Check if autocomplete export exists
		if (!commandHandler?.autocomplete) {
			discordLogger.debug(`No autocomplete handler for command: ${color.bold(commandKey)}`)
			return
		}

		// Delegate to autocomplete handler
		discordLogger.debug(`Executing autocomplete handler: ${color.bold(getHandlerPath(command))}`)
		const commandConfig = commandHandler.config
		const promises: Promise<Array<{ name: string; value: string | number }>>[] = [
			commandHandler.autocomplete(interaction)
		]

		// Get timeout from command config
		const timeoutDuration = commandConfig?.timeout

		// Enforce timeout only if custom timeout is configured
		if (timeoutDuration) {
			promises.push(
				timeout(
					() =>
						[] as Array<{
							name: string
							value: string | number
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
