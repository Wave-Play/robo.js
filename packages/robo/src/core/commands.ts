import { ContextMenuCommandBuilder, REST, SlashCommandBuilder } from 'discord.js'
import { buildSlashCommands, buildContextCommands, registerCommandsToDiscord } from '../cli/utils/commands.js'
import { DEFAULT_CONFIG } from './constants.js'
import { env } from './env.js'
import { getConfig } from './config.js'
import { logger } from './logger.js'
import type {
	CommandEntry,
	ContextEntry,
	RegisterSlashCommandsEntries,
	RegisterSlashCommandsOptions,
	RegisterCommandsResult,
	RegisterCommandsError,
	RegisterCommandsRetry
} from '../types/index.js'

/**
 * Internal helper to parse Discord 400 validation errors and add them to the errors array.
 * Extracts field-level validation errors from Discord API responses and maps them to specific commands.
 *
 * @returns true if validation errors were found and added, false otherwise
 */
function collectDiscordValidationErrors(
	commandData: { name?: string }[],
	error: unknown,
	errors: RegisterCommandsError[]
): boolean {
	// Check for 400 validation errors from Discord API
	if (
		error &&
		typeof error === 'object' &&
		'status' in error &&
		error.status === 400 &&
		'rawError' in error &&
		error.rawError &&
		typeof error.rawError === 'object' &&
		'errors' in error.rawError
	) {
		// Parse Discord error response and map field errors to command names
		const discordErrors = error.rawError.errors
		for (const [index, fieldErrors] of Object.entries(discordErrors)) {
			const commandIndex = parseInt(index)
			const commandName = commandData[commandIndex]?.name || `command_${commandIndex}`

			const errorObj: RegisterCommandsError = {
				command: commandName,
				error: JSON.stringify(fieldErrors),
				type: 'validation'
			}
			errors.push(errorObj)
		}
		return true
	}
	return false
}

/**
 * Registers slash commands and context menu commands with Discord.
 *
 * This function allows you to dynamically register your bot's commands at runtime.
 * It supports both global and guild-specific registration, with built-in rate limit
 * handling and detailed error reporting.
 *
 * @param entries - An object containing manifest entries for commands and context menus to register
 * @param options - Configuration options for registration
 * @returns A structured result object with registration status and details
 *
 * @example
 * ```ts
 * import { getManifest, registerSlashCommands } from 'robo.js'
 *
 * const manifest = getManifest()
 *
 * // Register all commands
 * const result = await registerSlashCommands({
 *   commands: manifest.commands,
 *   messageContext: manifest.context.message,
 *   userContext: manifest.context.user
 * }, {
 *   guildIds: ['123456789'], // Optional: register to specific guilds
 *   force: true // Optional: force clean re-registration
 * })
 *
 * // Register only specific commands
 * const result = await registerSlashCommands({
 *   commands: {
 *     ping: manifest.commands.ping,
 *     help: manifest.commands.help
 *   }
 * })
 * ```
 */
export async function registerSlashCommands(
	entries: RegisterSlashCommandsEntries,
	options: RegisterSlashCommandsOptions = {}
): Promise<RegisterCommandsResult> {
	const { guildIds, force = false, clientId: customClientId, token: customToken } = options

	// Validate required parameters
	const clientId = customClientId || env.get('discord.clientId')
	const token = customToken || env.get('discord.token')

	if (!clientId || !token) {
		const error: RegisterCommandsError = {
			command: 'N/A',
			error: 'Missing required DISCORD_CLIENT_ID or DISCORD_TOKEN',
			type: 'validation'
		}
		return {
			success: false,
			registered: 0,
			errors: [error]
		}
	}

	// Initialize result tracking
	const errors: RegisterCommandsError[] = []
	const retries: RegisterCommandsRetry[] = []
	let registered = 0

	try {
		// Destructure entries and validate at least one entry type is provided
		const { commands = {}, messageContext = {}, userContext = {} } = entries

		if (Object.keys(commands).length === 0 && Object.keys(messageContext).length === 0 && Object.keys(userContext).length === 0) {
			const error: RegisterCommandsError = {
				command: 'N/A',
				error: 'No commands provided for registration',
				type: 'validation'
			}
			return {
				success: false,
				registered: 0,
				errors: [error]
			}
		}

		// Use the entries directly
		const slashCommands: Record<string, CommandEntry> = commands
		const messageContextCommands: Record<string, ContextEntry> = messageContext
		const userContextCommands: Record<string, ContextEntry> = userContext

		// Load config for defaults and timeouts
		const config = getConfig() ?? DEFAULT_CONFIG

		// Build Discord.js command builders with validation error tracking
		let slashCommandBuilders: SlashCommandBuilder[] = []
		let messageContextBuilders: ContextMenuCommandBuilder[] = []
		let userContextBuilders: ContextMenuCommandBuilder[] = []

		try {
			slashCommandBuilders = buildSlashCommands(false, slashCommands, config)
		} catch (error) {
			const errorObj: RegisterCommandsError = {
				command: 'slash_commands',
				error: error instanceof Error ? error.message : String(error),
				type: 'validation'
			}
			errors.push(errorObj)
			logger.error('Failed to build slash commands:', error)
		}

		try {
			messageContextBuilders = buildContextCommands(false, messageContextCommands, 'message', config)
		} catch (error) {
			const errorObj: RegisterCommandsError = {
				command: 'message_context_commands',
				error: error instanceof Error ? error.message : String(error),
				type: 'validation'
			}
			errors.push(errorObj)
			logger.error('Failed to build message context commands:', error)
		}

		try {
			userContextBuilders = buildContextCommands(false, userContextCommands, 'user', config)
		} catch (error) {
			const errorObj: RegisterCommandsError = {
				command: 'user_context_commands',
				error: error instanceof Error ? error.message : String(error),
				type: 'validation'
			}
			errors.push(errorObj)
			logger.error('Failed to build user context commands:', error)
		}

		// If we had validation errors, return early
		if (errors.length > 0) {
			return {
				success: false,
				registered: 0,
				errors
			}
		}

		// Convert all builders to JSON format
		const commandData = [
			...slashCommandBuilders.map((command) => command.toJSON()),
			...messageContextBuilders.map((command) => command.toJSON()),
			...userContextBuilders.map((command) => command.toJSON())
		]

		logger.debug(`Prepared ${commandData.length} commands for registration`)

		// Create REST client
		const rest = new REST({ version: '10' }).setToken(token)

		// Handle registration based on scope (global vs guild)
		if (guildIds && guildIds.length > 0) {
			// Register to specific guilds
			for (const guildId of guildIds) {
				try {
					await registerCommandsToDiscord(rest, clientId, guildId, commandData, force, config, retries)
					registered += commandData.length
					logger.debug(`Registered ${commandData.length} commands to guild ${guildId}`)
				} catch (error: unknown) {
					// Detect timeout errors
					const isTimeout = error instanceof Error && error.message.includes('timed out')

					// Try to collect Discord validation errors, otherwise add a general error
					const hasValidationErrors = collectDiscordValidationErrors(commandData, error, errors)
					if (!hasValidationErrors) {
						const errorObj: RegisterCommandsError = {
							command: `guild:${guildId}`,
							error: error instanceof Error ? error.message : String(error),
							type: isTimeout ? 'timeout' : 'api'
						}
						errors.push(errorObj)
					}
					logger.error(`Failed to register commands to guild ${guildId}:`, error)
				}
			}
		} else {
			// Register globally
			try {
				await registerCommandsToDiscord(rest, clientId, undefined, commandData, force, config, retries)
				registered = commandData.length
				logger.debug(`Registered ${commandData.length} commands globally`)
			} catch (error: unknown) {
				// Detect timeout errors
				const isTimeout = error instanceof Error && error.message.includes('timed out')

				// Try to collect Discord validation errors, otherwise add a general error
				const hasValidationErrors = collectDiscordValidationErrors(commandData, error, errors)
				if (!hasValidationErrors) {
					const errorObj: RegisterCommandsError = {
						command: 'global',
						error: error instanceof Error ? error.message : String(error),
						type: isTimeout ? 'timeout' : 'api'
					}
					errors.push(errorObj)
				}
				logger.error('Failed to register commands globally:', error)
			}
		}

		// Return final result
		const hasRetries = retries.length > 0
		return {
			success: errors.length === 0,
			registered,
			errors,
			...(hasRetries && { retries })
		}
	} catch (error) {
		logger.error('Unexpected error during command registration:', error)
		// Detect timeout errors
		const isTimeout = error instanceof Error && error.message.includes('timed out')
		const errorObj: RegisterCommandsError = {
			command: 'N/A',
			error: error instanceof Error ? error.message : String(error),
			type: isTimeout ? 'timeout' : 'api'
		}
		return {
			success: false,
			registered,
			errors: [errorObj]
		}
	}
}
