/**
 * Command building and registration utilities for @robojs/discordjs
 *
 * Handles building Discord API payloads and registering commands.
 */
import {
	APIApplicationCommandOptionChoice,
	ApplicationIntegrationType,
	ContextMenuCommandBuilder,
	InteractionContextType,
	REST,
	Routes,
	SlashCommandBuilder,
	SlashCommandSubcommandBuilder
} from 'discord.js'
import type { ApplicationCommandOptionBase, APIApplicationCommand } from 'discord.js'
import { color, Env, Flashcore, Logger, logger } from 'robo.js'
import { Boot } from 'robo.js/unstable.js'
import { discordLogger } from './logger.js'
import type {
	CommandContext,
	CommandEntry,
	CommandIntegrationType,
	CommandOption,
	ContextEntry,
	DiscordConfig
} from '../types/index.js'

/**
 * Default configuration values.
 */
const DEFAULT_CONTEXTS: CommandContext[] = ['Guild', 'BotDM', 'PrivateChannel']
const DEFAULT_INTEGRATION_TYPES: CommandIntegrationType[] = ['GuildInstall', 'UserInstall']
const DEFAULT_REGISTRATION_TIMEOUT = 30000

/**
 * Flashcore key for tracking command registration errors.
 * Can be used to check if previous command registration failed.
 */
export const FLASHCORE_KEY_COMMAND_REGISTER_ERROR = 'robo:discordjs:commandRegisterError'

/**
 * Flashcore key prefix for caching command hashes.
 * Full key format: `robo:discordjs:commandHash:{scope}` where scope is 'global' or 'guild:{guildId}'
 */
export const FLASHCORE_KEY_COMMAND_HASH_PREFIX = 'robo:discordjs:commandHash:'

/**
 * Mutable logger reference that can be swapped in dev mode.
 */
let commandLogger: Logger = discordLogger

/**
 * Build context menu commands for Discord API.
 */
export function buildContextCommands(
	contextCommands: Record<string, ContextEntry>,
	type: 'message' | 'user',
	config?: DiscordConfig,
	dev?: boolean
): ContextMenuCommandBuilder[] {
	if (dev) {
		commandLogger = new Logger({
			enabled: true,
			level: 'info'
		}).fork('discord')
	}

	const defaultContexts = config?.defaults?.contexts ?? DEFAULT_CONTEXTS
	const defaultIntegrationTypes = config?.defaults?.integrationTypes ?? DEFAULT_INTEGRATION_TYPES

	return Object.entries(contextCommands).map(([key, entry]): ContextMenuCommandBuilder => {
		commandLogger.debug(`Building context command: ${key}`)

		const commandBuilder = new ContextMenuCommandBuilder()
			.setContexts((entry.contexts ?? defaultContexts).map(getContextType))
			.setIntegrationTypes((entry.integrationTypes ?? defaultIntegrationTypes).map(getIntegrationType))
			.setName(key)
			.setNameLocalizations(entry.nameLocalizations || {})
			.setType(type === 'message' ? 3 : 2)

		const defaultMemberPermissions = entry.defaultMemberPermissions ?? config?.defaults?.defaultMemberPermissions
		if (defaultMemberPermissions !== undefined) {
			commandBuilder.setDefaultMemberPermissions(defaultMemberPermissions)
		}
		if (entry.dmPermission !== undefined) {
			commandBuilder.setDMPermission(entry.dmPermission)
		}

		return commandBuilder
	})
}

/**
 * Build slash commands for Discord API.
 */
export function buildSlashCommands(
	commands: Record<string, CommandEntry>,
	config?: DiscordConfig,
	dev?: boolean
): SlashCommandBuilder[] {
	if (dev) {
		commandLogger = new Logger({
			enabled: true,
			level: 'info'
		}).fork('discord')
	}

	const defaultContexts = config?.defaults?.contexts ?? DEFAULT_CONTEXTS
	const defaultIntegrationTypes = config?.defaults?.integrationTypes ?? DEFAULT_INTEGRATION_TYPES

	return Object.entries(commands).map(([key, entry]): SlashCommandBuilder => {
		commandLogger.debug(`Building slash command: ${key}`)

		let commandBuilder: SlashCommandBuilder
		try {
			commandBuilder = new SlashCommandBuilder()
				.setName(key)
				.setContexts((entry.contexts ?? defaultContexts).map(getContextType))
				.setIntegrationTypes((entry.integrationTypes ?? defaultIntegrationTypes).map(getIntegrationType))
				.setNameLocalizations(entry.nameLocalizations || {})
				.setDescription(entry.description || 'No description provided')
				.setDescriptionLocalizations(entry.descriptionLocalizations || {})
		} catch (e) {
			commandLogger.error('Could not build slash command:', color.bold(`/${key}`))
			throw e
		}

		// Add subcommands
		if (entry.subcommands) {
			for (const [subcommandName, subcommandEntry] of Object.entries(entry.subcommands)) {
				// Add subcommands for this subcommand group
				if (subcommandEntry.subcommands) {
					commandBuilder.addSubcommandGroup((subcommandGroup) => {
						try {
							subcommandGroup
								.setName(subcommandName)
								.setNameLocalizations(subcommandEntry.nameLocalizations || {})
								.setDescription(subcommandEntry.description || 'No description provided')
								.setDescriptionLocalizations(subcommandEntry.descriptionLocalizations || {})
						} catch (e) {
							commandLogger.error('Could not build subcommand:', color.bold(`/${key} ${subcommandName}`))
							throw e
						}

						for (const [subcommandGroupName, subcommandGroupEntry] of Object.entries(subcommandEntry.subcommands ?? {})) {
							subcommandGroup.addSubcommand((subcommand) => {
								try {
									subcommand
										.setName(subcommandGroupName)
										.setNameLocalizations(subcommandGroupEntry.nameLocalizations || {})
										.setDescription(subcommandGroupEntry.description || 'No description provided')
										.setDescriptionLocalizations(subcommandGroupEntry.descriptionLocalizations || {})

									subcommandGroupEntry.options?.forEach((option) => {
										addOptionToCommandBuilder(subcommand, option.type, option)
									})

									return subcommand
								} catch (e) {
									commandLogger.error('Could not build subcommand group:', color.bold(`/${key} ${subcommandName} ${subcommandGroupName}`))
									throw e
								}
							})
						}

						return subcommandGroup
					})
					continue
				}

				// Just add a normal subcommand
				commandBuilder.addSubcommand((subcommand) => {
					try {
						subcommand
							.setName(subcommandName)
							.setNameLocalizations(subcommandEntry.nameLocalizations || {})
							.setDescription(subcommandEntry.description || 'No description provided')
							.setDescriptionLocalizations(subcommandEntry.descriptionLocalizations || {})

						subcommandEntry.options?.forEach((option) => {
							addOptionToCommandBuilder(subcommand, option.type, option)
						})

						return subcommand
					} catch (e) {
						commandLogger.error('Could not build subcommand:', color.bold(`/${key} ${subcommandName}`))
						throw e
					}
				})
			}
		} else {
			entry.options?.forEach((option) => {
				addOptionToCommandBuilder(commandBuilder, option.type, option)
			})

			const defaultMemberPermissions = entry.defaultMemberPermissions ?? config?.defaults?.defaultMemberPermissions
			if (defaultMemberPermissions !== undefined) {
				commandBuilder.setDefaultMemberPermissions(defaultMemberPermissions)
			}
			if (entry.dmPermission !== undefined) {
				commandBuilder.setDMPermission(entry.dmPermission)
			}
		}

		return commandBuilder
	})
}

/**
 * Add an option to a command or subcommand builder.
 */
export function addOptionToCommandBuilder(
	commandBuilder: SlashCommandBuilder | SlashCommandSubcommandBuilder,
	type: string | undefined,
	option: CommandOption
) {
	const optionPredicate = <T extends ApplicationCommandOptionBase>(builder: T) => {
		return builder
			.setName(option.name)
			.setNameLocalizations(option.nameLocalizations ?? {})
			.setDescription(option.description || 'No description provided')
			.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
			.setRequired(option.required || false)
	}

	switch (type) {
		case undefined:
		case null:
		case 'string':
			commandBuilder.addStringOption((builder) => {
				optionPredicate(builder).setAutocomplete(option.autocomplete ?? false)
				if (option.choices) {
					builder.addChoices(...(option.choices as APIApplicationCommandOptionChoice<string>[]))
				}
				if (option.max) {
					builder.setMaxLength(option.max)
				}
				if (option.min) {
					builder.setMinLength(option.min)
				}
				return builder
			})
			break
		case 'integer':
			commandBuilder.addIntegerOption((builder) => {
				optionPredicate(builder).setAutocomplete(option.autocomplete ?? false)
				if (option.choices) {
					builder.addChoices(...(option.choices as APIApplicationCommandOptionChoice<number>[]))
				}
				if (option.max) {
					builder.setMaxValue(option.max)
				}
				if (option.min) {
					builder.setMinValue(option.min)
				}
				return builder
			})
			break
		case 'number':
			commandBuilder.addNumberOption((builder) => {
				optionPredicate(builder).setAutocomplete(option.autocomplete ?? false)
				if (option.choices) {
					builder.addChoices(...(option.choices as APIApplicationCommandOptionChoice<number>[]))
				}
				if (option.max) {
					builder.setMaxValue(option.max)
				}
				if (option.min) {
					builder.setMinValue(option.min)
				}
				return builder
			})
			break
		case 'boolean':
			commandBuilder.addBooleanOption((builder) => optionPredicate(builder))
			break
		case 'attachment':
			commandBuilder.addAttachmentOption((builder) => optionPredicate(builder))
			break
		case 'channel':
			commandBuilder.addChannelOption((builder) => {
				optionPredicate(builder)
				if (option.type === 'channel' && option.channelTypes) {
					builder.addChannelTypes(...option.channelTypes)
				}
				return builder
			})
			break
		case 'mention':
			commandBuilder.addMentionableOption((builder) => optionPredicate(builder))
			break
		case 'role':
			commandBuilder.addRoleOption((builder) => optionPredicate(builder))
			break
		case 'member':
		case 'user':
			commandBuilder.addUserOption((builder) => optionPredicate(builder))
			break
		default:
			commandLogger.warn(`Invalid option type: ${type}`)
	}
}

/**
 * Retry tracking entry for telemetry/debugging.
 */
export interface RetryEntry {
	scope: string
	attempt: number
	reason: string
	delay: number
}

/**
 * Options for command registration.
 */
export interface RegisterCommandsOptions {
	/** Whether to force re-registration of all commands */
	force?: boolean
	/** Registration timeout in milliseconds */
	timeout?: number
	/** Array to track retry attempts */
	retries?: RetryEntry[]
	/** Whether the embedded app SDK is installed (for Activities support) */
	hasEmbeddedSdk?: boolean
}

/**
 * Register commands with Discord API.
 *
 * Supports:
 * - Entry command detection and re-registration for Discord Activities
 * - Retry tracking for telemetry/debugging
 * - Configurable timeout
 * - Rate limit handling with exponential backoff
 */
export async function registerCommandsToDiscord(
	rest: REST,
	clientId: string,
	guildId: string | undefined,
	commandData: unknown[],
	force: boolean,
	options?: number | RegisterCommandsOptions
): Promise<void> {
	// Handle legacy signature (timeout as number) and new options object
	const opts: RegisterCommandsOptions =
		typeof options === 'number' ? { timeout: options } : options ?? {}
	const { timeout = DEFAULT_REGISTRATION_TIMEOUT, retries, hasEmbeddedSdk } = opts

	// Get existing commands
	const existingCommands = (await rest.get(
		guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId)
	)) as APIApplicationCommand[]

	commandLogger.debug(`Found ${existingCommands.length} existing commands:`, existingCommands)

	// See if an entry command already exists (for Discord Activities)
	let entryCommand: APIApplicationCommand | undefined = existingCommands.find((command) => command.type === 4)
	commandLogger.debug('Entry command:', entryCommand)

	if (force) {
		// Start clean by forcing a deletion of all existing commands
		const deletions = existingCommands.map((command) => {
			return rest.delete(
				guildId
					? Routes.applicationGuildCommand(clientId, guildId, command.id)
					: Routes.applicationCommand(clientId, command.id)
			)
		})
		await Promise.all(deletions)
		commandLogger.debug('Successfully cleaned up existing commands')

		// Prepare entry command for re-registration
		// @ts-expect-error - This is a valid command object
		entryCommand = {
			name: 'launch',
			description: 'Launch an activity',
			contexts: [0, 1, 2],
			integration_types: [0, 1],
			type: 4,
			handler: 2
		}
	}

	// Ensure entry command is added if already there (or if reset)
	// IMPORTANT: Discord requires Entry Point commands to be included in bulk updates,
	// so we must preserve existing entry commands even if the SDK isn't installed.
	try {
		if (entryCommand && !guildId) {
			commandData.push(entryCommand)
			if (hasEmbeddedSdk) {
				commandLogger.debug('Added entry command to registration batch as @discord/embedded-app-sdk is installed')
			} else {
				commandLogger.debug('Preserving existing entry command in registration batch (SDK not installed)')
			}
		}
	} catch (e) {
		commandLogger.debug('Error checking for @discord/embedded-app-sdk package:', e)
	}

	// Register commands with retry and timeout handling
	const maxRetries = 3
	const baseDelay = 1000
	const maxDelay = 10000
	let attempt = 0

	while (attempt <= maxRetries) {
		try {
			const registerCommandsPromise = (
				guildId
					? rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData })
					: rest.put(Routes.applicationCommands(clientId), { body: commandData })
			)
				.then(() => ({ type: 'registerCommands' as const }))
				.catch(async (error) => {
					// Check for rate limit (429)
					if (isRateLimitError(error)) {
						const retryAfter = getRetryAfter(error)
						const delay = retryAfter ?? Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

						// Track retry if array provided
						if (retries) {
							retries.push({
								scope: guildId ? `guild:${guildId}` : 'global',
								attempt: attempt + 1,
								reason: 'rate_limit',
								delay
							})
						}

						throw { type: 'rate_limit' as const, delay, error }
					}
					throw error
				})

			const timeoutPromise = createTimeout<{ type: 'timeout' }>(() => ({ type: 'timeout' }), timeout)

			const result = await Promise.race([registerCommandsPromise, timeoutPromise])

			if (result.type === 'timeout') {
				throw { type: 'timeout' as const }
			}

			// Success - exit retry loop
			return
		} catch (error: unknown) {
			if (
				typeof error === 'object' &&
				error !== null &&
				'type' in error &&
				error.type === 'rate_limit' &&
				attempt < maxRetries
			) {
				// Wait and retry
				const delay =
					('delay' in error && typeof error.delay === 'number' ? error.delay : undefined) ||
					Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
				commandLogger.debug(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`)
				await sleep(delay)
				attempt++
				continue
			}

			// Max retries exceeded or other error
			if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'timeout') {
				throw new Error('Command registration timed out')
			}
			if (typeof error === 'object' && error !== null && 'error' in error) {
				throw error.error
			}
			throw error
		}
	}

	throw new Error('Max retries exceeded for rate limiting')
}

/**
 * High-level command registration function.
 *
 * Handles the full registration workflow including:
 * - Loading environment variables
 * - Building command structures
 * - Logging changes with colors
 * - Handling command deletions for removed commands
 * - Error handling and user feedback
 */
export async function registerCommands(
	dev: boolean,
	force: boolean,
	newCommands: Record<string, CommandEntry>,
	newMessageContextCommands: Record<string, ContextEntry>,
	newUserContextCommands: Record<string, ContextEntry>,
	changedCommands: string[],
	addedCommands: string[],
	removedCommands: string[],
	changedContextCommands: string[],
	addedContextCommands: string[],
	removedContextCommands: string[],
	config?: DiscordConfig
): Promise<void> {
	const envData = Env.data()
	const clientId = envData.DISCORD_CLIENT_ID
	const guildId = envData.DISCORD_GUILD_ID ?? config?.testServers?.[0]
	const token = envData.DISCORD_TOKEN
	const commandType = guildId ? 'guild' : 'global'

	if (!token || !clientId) {
		commandLogger.error(
			`${color.bold('DISCORD_TOKEN')} or ${color.bold('DISCORD_CLIENT_ID')} not found in environment variables`
		)
		return
	}

	const startTime = Date.now()
	const rest = new REST({ version: '10' }).setToken(token)

	try {
		const slashCommands = buildSlashCommands(newCommands, config, dev)
		const contextMessageCommands = buildContextCommands(newMessageContextCommands, 'message', config, dev)
		const contextUserCommands = buildContextCommands(newUserContextCommands, 'user', config, dev)

		// Log changes with colors
		const addedChanges = addedCommands.map((cmd) => color.green(`/${color.bold(cmd)} (new)`))
		const removedChanges = removedCommands.map((cmd) => color.red(`/${color.bold(cmd)} (deleted)`))
		const updatedChanges = changedCommands.map((cmd) => color.blue(`/${color.bold(cmd)} (updated)`))
		const addedContextChanges = addedContextCommands.map((cmd) => color.green(`${color.bold(cmd)} (new)`))
		const removedContextChanges = removedContextCommands.map((cmd) => color.red(`${color.bold(cmd)} (deleted)`))
		const updatedContextChanges = changedContextCommands.map((cmd) => color.blue(`${color.bold(cmd)} (updated)`))
		const allChanges = [...addedChanges, ...removedChanges, ...updatedChanges]
		const allContextChanges = [...addedContextChanges, ...removedContextChanges, ...updatedContextChanges]

		if (allChanges.length > 0) {
			commandLogger.info('Command changes: ' + allChanges.join(', '))
		}
		if (allContextChanges.length > 0) {
			commandLogger.info('Context menu changes: ' + allContextChanges.join(', '))
		}

		const commandData = [
			...slashCommands.map((command) => command.toJSON()),
			...contextMessageCommands.map((command) => command.toJSON()),
			...contextUserCommands.map((command) => command.toJSON())
		]

		// Handle command deletions for removed commands
		if (!force && removedCommands.length > 0) {
			const existingCommands = (await rest.get(
				guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId)
			)) as APIApplicationCommand[]

			const deletions = removedCommands.map((command) => {
				const existingCommand = existingCommands.find((c) => c.name === command)

				if (existingCommand) {
					commandLogger.debug(`Deleting command /${existingCommand.name}...`)
					return rest.delete(
						guildId
							? Routes.applicationGuildCommand(clientId, guildId, existingCommand.id)
							: Routes.applicationCommand(clientId, existingCommand.id)
					)
				}
			})
			await Promise.all(deletions)
			commandLogger.debug('Successfully removed deleted commands')
		}

		// Check for embedded SDK
		const hasEmbeddedSdk = hasProjectPackage('@discord/embedded-app-sdk')

		// Use the registration logic
		await registerCommandsToDiscord(rest, clientId, guildId, commandData, force, {
			timeout: config?.timeouts?.commandRegistration ?? DEFAULT_REGISTRATION_TIMEOUT,
			hasEmbeddedSdk
		})

		const endTime = Date.now() - startTime

		commandLogger.info(`Successfully updated ${commandData.length} ${color.bold(commandType + ' commands')} in ${endTime}ms`)
		commandLogger.wait(color.dim('It may take a while for the changes to reflect in Discord.'))

		// Clear any previous error state
		await Flashcore.delete(FLASHCORE_KEY_COMMAND_REGISTER_ERROR)
	} catch (error) {
		commandLogger.error('Could not register commands!', error)
		commandLogger.warn(`Run ${color.bold('robo build --force')} to try again.`)

		// Track error state for debugging/recovery
		await Flashcore.set(FLASHCORE_KEY_COMMAND_REGISTER_ERROR, true)

		// Notify user with actionable fix
		await Boot.notification({
			action: {
				command: 'npx robo build --force',
				label: 'Fix'
			},
			message: 'Command registration failed.',
			type: 'warning'
		})
	}
}

/**
 * Convert CommandContext to InteractionContextType.
 */
export function getContextType(context: CommandContext): InteractionContextType {
	if (context === 'BotDM') {
		return InteractionContextType.BotDM
	} else if (context === 'Guild') {
		return InteractionContextType.Guild
	} else if (context === 'PrivateChannel') {
		return InteractionContextType.PrivateChannel
	}
	return context
}

/**
 * Convert CommandIntegrationType to ApplicationIntegrationType.
 */
export function getIntegrationType(type: CommandIntegrationType): ApplicationIntegrationType {
	if (type === 'GuildInstall') {
		return ApplicationIntegrationType.GuildInstall
	} else if (type === 'UserInstall') {
		return ApplicationIntegrationType.UserInstall
	}
	return type
}

/**
 * Find differences between old and new command sets.
 */
export function findCommandDifferences(
	oldCommands: Record<string, CommandEntry>,
	newCommands: Record<string, CommandEntry>,
	differenceType: 'added' | 'removed' | 'changed',
	prefix = ''
): string[] {
	let differenceKeys: string[] = []
	const oldKeys = Object.keys(oldCommands)
	const newKeys = Object.keys(newCommands)

	if (differenceType === 'added') {
		differenceKeys = newKeys.filter((key) => !oldKeys.includes(key))
	} else if (differenceType === 'removed') {
		differenceKeys = oldKeys.filter((key) => !newKeys.includes(key))
	} else if (differenceType === 'changed') {
		differenceKeys = oldKeys.filter(
			(key) => newKeys.includes(key) && hasChangedFields(oldCommands[key], newCommands[key])
		)
	}

	differenceKeys = differenceKeys.map((key) => (prefix ? `${prefix} ${key}` : key))

	// Check subcommands recursively
	const allKeys = Array.from(new Set([...oldKeys, ...newKeys]))
	for (const key of allKeys) {
		if (oldCommands[key]?.subcommands || newCommands[key]?.subcommands) {
			const subDifferenceKeys = findCommandDifferences(
				oldCommands[key]?.subcommands ?? {},
				newCommands[key]?.subcommands ?? {},
				differenceType,
				prefix ? `${prefix} ${key}` : key
			)
			differenceKeys = differenceKeys.concat(subDifferenceKeys)

			if (
				(differenceType === 'removed' && oldKeys.includes(key) && !newKeys.includes(key)) ||
				(differenceType === 'added' && newKeys.includes(key) && !oldKeys.includes(key))
			) {
				differenceKeys = differenceKeys.filter((k) => k !== (prefix ? `${prefix} ${key}` : key))
			}
		}
	}

	return differenceKeys
}

/**
 * Check if command fields have changed.
 */
function hasChangedFields(obj1: CommandEntry, obj2: CommandEntry): boolean {
	const fieldsToCompare: (keyof CommandEntry)[] = ['description', 'options']

	for (const field of fieldsToCompare) {
		if (field === 'options') {
			if (JSON.stringify(obj1[field]) !== JSON.stringify(obj2[field])) {
				return true
			}
		} else if (obj1[field] !== obj2[field]) {
			return true
		}
	}
	return false
}

/**
 * Check if an error is a rate limit error.
 */
function isRateLimitError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'status' in error &&
		(error as { status: number }).status === 429
	)
}

/**
 * Get retry-after value from a rate limit error.
 */
function getRetryAfter(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) return undefined

	const headers = (error as { headers?: Record<string, string> }).headers
	if (!headers) return undefined

	const retryAfter = headers['retry-after'] || headers['x-ratelimit-reset-after']
	if (retryAfter) {
		return parseFloat(retryAfter) * 1000
	}

	return undefined
}

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Create a timeout promise that resolves with the callback result after the specified delay.
 */
function createTimeout<T>(callback: () => T, ms: number): Promise<T> {
	return new Promise<T>((resolve) =>
		setTimeout(() => {
			resolve(callback())
		}, ms)
	)
}

/**
 * Check if a package is installed in the current project.
 */
function hasProjectPackage(name: string): boolean {
	try {
		// Use dynamic import resolution to check for package existence
		require.resolve(name, { paths: [process.cwd()] })
		return true
	} catch {
		return false
	}
}

/**
 * Helper to create REST instance with mock API support.
 * Applies DISCORD_REST_API env var when set.
 */
export function createConfiguredRest(token: string): REST {
	const options: { version: '10'; api?: string } = { version: '10' }
	if (process.env.DISCORD_REST_API) {
		options.api = process.env.DISCORD_REST_API
	}
	return new REST(options).setToken(token)
}

/**
 * Convert portal records to command entry format.
 * Used by both HMR and mock mode runtime registration.
 */
export function recordsToCommands(
	records: Record<string, { metadata: Record<string, unknown> }>
): Record<string, CommandEntry> {
	const commands: Record<string, CommandEntry> = {}

	for (const [key, record] of Object.entries(records)) {
		const keyParts = key.split(' ')
		const rootName = keyParts[0]

		if (keyParts.length === 1) {
			// Top-level command
			commands[rootName] = record.metadata as CommandEntry
		} else if (keyParts.length === 2) {
			// Subcommand
			if (!commands[rootName]) {
				commands[rootName] = { subcommands: {} } as CommandEntry
			}
			if (!commands[rootName].subcommands) {
				commands[rootName].subcommands = {}
			}
			commands[rootName].subcommands![keyParts[1]] = record.metadata as CommandEntry
		} else if (keyParts.length === 3) {
			// Subcommand group
			if (!commands[rootName]) {
				commands[rootName] = { subcommands: {} } as CommandEntry
			}
			if (!commands[rootName].subcommands) {
				commands[rootName].subcommands = {}
			}
			if (!commands[rootName].subcommands![keyParts[1]]) {
				commands[rootName].subcommands![keyParts[1]] = { subcommands: {} } as CommandEntry
			}
			if (!commands[rootName].subcommands![keyParts[1]].subcommands) {
				commands[rootName].subcommands![keyParts[1]].subcommands = {}
			}
			commands[rootName].subcommands![keyParts[1]].subcommands![keyParts[2]] = record.metadata as CommandEntry
		}
	}

	return commands
}

/**
 * Convert portal records to context menu format.
 */
export function recordsToContext(
	records: Record<string, { metadata: Record<string, unknown> }>,
	type: 'user' | 'message'
): Record<string, ContextEntry> {
	const contextType = type === 'user' ? 2 : 3
	const result: Record<string, ContextEntry> = {}

	for (const [key, record] of Object.entries(records)) {
		// Check metadata first, then infer from handler path when metadata is missing
		// (e.g., during HMR when route processor hasn't run for new entries)
		let recordContextType = record.metadata.contextType
		if (recordContextType === undefined) {
			const path = (record as { path?: string }).path ?? ''
			if (path.includes('/user/')) {
				recordContextType = 2
			} else if (path.includes('/message/')) {
				recordContextType = 3
			}
		}

		if (recordContextType === contextType) {
			result[key] = record.metadata as ContextEntry
		}
	}

	return result
}

/**
 * Options for runtime command registration.
 */
export interface RuntimeRegistrationOptions {
	/** Changed keys for HMR logging (optional) */
	changedKeys?: string[]
	/** Custom timeout in milliseconds (HMR uses 10000ms) */
	timeout?: number
	/** Force register (skip hash check) - default true */
	force?: boolean
}

/**
 * Register commands at runtime.
 * Used by mock mode (start.ts) and HMR (hmr.ts).
 * Builds command data from portal and registers via REST API.
 */
export async function registerCommandsAtRuntime(options?: RuntimeRegistrationOptions): Promise<void> {
	const { changedKeys, timeout, force = true } = options ?? {}

	// Dynamic imports to reduce overhead when not used
	const { getPluginOptions, portal } = await import('robo.js')

	// Read directly from process.env to pick up runtime changes (e.g., mock token override)
	const clientId = process.env.DISCORD_CLIENT_ID
	const token = process.env.DISCORD_TOKEN
	const config = getPluginOptions('@robojs/discordjs') as DiscordConfig | undefined
	const guildId = process.env.DISCORD_GUILD_ID ?? config?.testServers?.[0]

	if (!token || !clientId) {
		discordLogger.warn('Cannot register commands: missing credentials')
		return
	}

	// Ensure routes are loaded
	await portal.ensureRoute('discordjs', 'commands')
	await portal.ensureRoute('discordjs', 'context')

	// Get command records from portal
	const commandRecords = portal.getByType('discordjs:commands') as Record<string, { metadata: Record<string, unknown> }>
	const contextRecords = portal.getByType('discordjs:context') as Record<string, { metadata: Record<string, unknown> }>

	// Build command data
	const commands = recordsToCommands(commandRecords)
	const userContext = recordsToContext(contextRecords, 'user')
	const messageContext = recordsToContext(contextRecords, 'message')

	const slashCommands = buildSlashCommands(commands, config, true)
	const userContextCommands = buildContextCommands(userContext, 'user', config, true)
	const messageContextCommands = buildContextCommands(messageContext, 'message', config, true)

	const commandData = [
		...slashCommands.map((cmd) => cmd.toJSON()),
		...userContextCommands.map((cmd) => cmd.toJSON()),
		...messageContextCommands.map((cmd) => cmd.toJSON())
	]

	if (commandData.length === 0) {
		discordLogger.debug('No commands to register')
		return
	}

	// Create REST with mock API URL if set
	const rest = createConfiguredRest(token)

	// Register with Discord/mock API
	await registerCommandsToDiscord(rest, clientId, guildId, commandData, force, {
		timeout: timeout ?? 30000
	})

	const scope = guildId ? 'guild' : 'global'
	const countInfo = changedKeys ? `${changedKeys.length} changed` : `${commandData.length}`
	discordLogger.info(`Registered ${countInfo} ${scope} command(s)`)
}
