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
 * Build context menu commands for Discord API.
 */
export function buildContextCommands(
	contextCommands: Record<string, ContextEntry>,
	type: 'message' | 'user',
	config?: DiscordConfig
): ContextMenuCommandBuilder[] {
	return Object.entries(contextCommands).map(([key, entry]): ContextMenuCommandBuilder => {
		discordLogger.debug(`Building context command: ${key}`)

		const commandBuilder = new ContextMenuCommandBuilder()
			.setContexts((entry.contexts ?? DEFAULT_CONTEXTS).map(getContextType))
			.setIntegrationTypes((entry.integrationTypes ?? DEFAULT_INTEGRATION_TYPES).map(getIntegrationType))
			.setName(key)
			.setNameLocalizations(entry.nameLocalizations || {})
			.setType(type === 'message' ? 3 : 2)

		if (entry.defaultMemberPermissions !== undefined) {
			commandBuilder.setDefaultMemberPermissions(entry.defaultMemberPermissions)
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
	config?: DiscordConfig
): SlashCommandBuilder[] {
	return Object.entries(commands).map(([key, entry]): SlashCommandBuilder => {
		discordLogger.debug(`Building slash command: ${key}`)

		let commandBuilder: SlashCommandBuilder
		try {
			commandBuilder = new SlashCommandBuilder()
				.setName(key)
				.setContexts((entry.contexts ?? DEFAULT_CONTEXTS).map(getContextType))
				.setIntegrationTypes((entry.integrationTypes ?? DEFAULT_INTEGRATION_TYPES).map(getIntegrationType))
				.setNameLocalizations(entry.nameLocalizations || {})
				.setDescription(entry.description || 'No description provided')
				.setDescriptionLocalizations(entry.descriptionLocalizations || {})
		} catch (e) {
			discordLogger.error(`Could not build slash command: /${key}`)
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
							discordLogger.error(`Could not build subcommand: /${key} ${subcommandName}`)
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
									discordLogger.error(`Could not build subcommand group: /${key} ${subcommandName} ${subcommandGroupName}`)
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
						discordLogger.error(`Could not build subcommand: /${key} ${subcommandName}`)
						throw e
					}
				})
			}
		} else {
			entry.options?.forEach((option) => {
				addOptionToCommandBuilder(commandBuilder, option.type, option)
			})

			if (entry.defaultMemberPermissions !== undefined) {
				commandBuilder.setDefaultMemberPermissions(entry.defaultMemberPermissions)
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
			discordLogger.warn(`Invalid option type: ${type}`)
	}
}

/**
 * Register commands with Discord API.
 */
export async function registerCommandsToDiscord(
	rest: REST,
	clientId: string,
	guildId: string | undefined,
	commandData: unknown[],
	force: boolean,
	timeout: number = DEFAULT_REGISTRATION_TIMEOUT
): Promise<void> {
	// Get existing commands
	const existingCommands = (await rest.get(
		guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId)
	)) as APIApplicationCommand[]

	discordLogger.debug(`Found ${existingCommands.length} existing commands`)

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
		discordLogger.debug('Successfully cleaned up existing commands')
	}

	// Register commands with retry and timeout handling
	const maxRetries = 3
	const baseDelay = 1000
	const maxDelay = 10000
	let attempt = 0

	while (attempt <= maxRetries) {
		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), timeout)

			try {
				await (guildId
					? rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData })
					: rest.put(Routes.applicationCommands(clientId), { body: commandData }))

				clearTimeout(timeoutId)
				return
			} catch (error: unknown) {
				clearTimeout(timeoutId)

				// Check for rate limit (429)
				if (isRateLimitError(error)) {
					const retryAfter = getRetryAfter(error)
					const delay = retryAfter ?? Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

					if (attempt < maxRetries) {
						discordLogger.debug(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`)
						await sleep(delay)
						attempt++
						continue
					}
				}

				throw error
			}
		} catch (error) {
			if (attempt >= maxRetries) {
				throw error
			}
			attempt++
		}
	}

	throw new Error('Max retries exceeded for rate limiting')
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
