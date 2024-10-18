import {
	APIApplicationCommandOptionChoice,
	ContextMenuCommandBuilder,
	REST,
	Routes,
	SlashCommandBuilder,
	SlashCommandSubcommandBuilder
} from 'discord.js'
import { Logger } from '../../core/logger.js'
import { loadConfig } from '../../core/config.js'
import { DEFAULT_CONFIG, discordLogger, FLASHCORE_KEYS } from '../../core/constants.js'
import { env } from '../../core/env.js'
import { timeout } from './utils.js'
import { bold, color } from '../../core/color.js'
import { Flashcore } from '../../core/flashcore.js'
import type { APIApplicationCommand, ApplicationCommandOptionBase } from 'discord.js'
import type { CommandEntry, CommandOption, ContextEntry } from '../../types/index.js'

let logger: Logger = discordLogger

export function buildContextCommands(
	dev: boolean,
	contextCommands: Record<string, ContextEntry>,
	type: 'message' | 'user'
): ContextMenuCommandBuilder[] {
	if (dev) {
		logger = new Logger({
			enabled: true,
			level: 'info'
		}).fork('discord')
	}

	return Object.entries(contextCommands).map(([key, entry]): ContextMenuCommandBuilder => {
		logger.debug(`Building context command: ${key}`)
		const commandBuilder = new ContextMenuCommandBuilder()
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

export function buildSlashCommands(dev: boolean, commands: Record<string, CommandEntry>): SlashCommandBuilder[] {
	if (dev) {
		logger = new Logger({
			enabled: true,
			level: 'info'
		})
	}

	return Object.entries(commands).map(([key, entry]): SlashCommandBuilder => {
		logger.debug(`Building slash command:`, key)

		let commandBuilder: SlashCommandBuilder
		try {
			commandBuilder = new SlashCommandBuilder()
				.setName(key)
				.setNameLocalizations(entry.nameLocalizations || {})
				.setDescription(entry.description || 'No description provided')
				.setDescriptionLocalizations(entry.descriptionLocalizations || {})
		} catch (e) {
			logger.error('Could not build slash command:', bold(`/${key}`))
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
							logger.error('Could not build subcommand:', bold(`/${key} ${subcommandName}`))
							throw e
						}

						for (const [subcommandGroupName, subcommandGroupEntry] of Object.entries(subcommandEntry.subcommands)) {
							// Add subcommands for this subcommand group
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
									logger.error('Could not build subcommand group:', `/${key} ${subcommandName} ${subcommandGroupName}`)
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
						logger.error('Could not build subcommand:', bold(`/${key} ${subcommandName}`))
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

export function addOptionToCommandBuilder(
	commandBuilder: SlashCommandBuilder | SlashCommandSubcommandBuilder,
	type: string,
	option: CommandOption
) {
	const optionPredicate = <T extends ApplicationCommandOptionBase>(builder: T) => {
		const optionResult = builder
			.setName(option.name)
			.setNameLocalizations(option.nameLocalizations ?? {})
			.setDescription(option.description || 'No description provided')
			.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
			.setRequired(option.required || false)

		return optionResult
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
			commandBuilder.addChannelOption((builder) => optionPredicate(builder))
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
			logger.warn(`Invalid option type: ${type}`)
	}
}

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
	removedContextCommands: string[]
) {
	const config = await loadConfig()
	const clientId = env('discord.clientId')
	const guildId = env('discord.guildId')
	const token = env('discord.token')

	if (!token || !clientId) {
		logger.error(
			`${color.bold('DISCORD_TOKEN')} or ${color.bold('DISCORD_CLIENT_ID')} not found in environment variables`
		)
		return
	}

	const startTime = Date.now()
	const rest = new REST({ version: '9' }).setToken(token)

	try {
		const slashCommands = buildSlashCommands(dev, newCommands)
		const contextMessageCommands = buildContextCommands(dev, newMessageContextCommands, 'message')
		const contextUserCommands = buildContextCommands(dev, newUserContextCommands, 'user')
		const addedChanges = addedCommands.map((cmd) => color.green(`/${color.bold(cmd)} (new)`))
		const removedChanges = removedCommands.map((cmd) => color.red(`/${color.bold(cmd)} (deleted)`))
		const updatedChanges = changedCommands.map((cmd) => color.blue(`/${color.bold(cmd)} (updated)`))
		const addedContextChanges = addedContextCommands.map((cmd) => color.green(`${color.bold(cmd)} (new)`))
		const removedContextChanges = removedContextCommands.map((cmd) => color.red(`${color.bold(cmd)} (deleted)`))
		const updatedContextChanges = changedContextCommands.map((cmd) => color.blue(`${color.bold(cmd)} (updated)`))
		const allChanges = [...addedChanges, ...removedChanges, ...updatedChanges]
		const allContextChanges = [...addedContextChanges, ...removedContextChanges, ...updatedContextChanges]
		if (allChanges.length > 0) {
			logger.info('Command changes: ' + allChanges.join(', '))
		}
		if (allContextChanges.length > 0) {
			logger.info('Context menu changes: ' + allContextChanges.join(', '))
		}
		const commandData = [
			...slashCommands.map((command) => command.toJSON()),
			...contextMessageCommands.map((command) => command.toJSON()),
			...contextUserCommands.map((command) => command.toJSON())
		]

		// Inject user install if enabled
		if (config.experimental?.userInstall) {
			commandData.forEach((command) => {
				command.integration_types = [0, 1]
				command.contexts = [0, 1, 2]
			})
		}

		// Get existing commands
		const existingCommands = (await rest.get(
			guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId)
		)) as APIApplicationCommand[]
		logger.debug(`Found ${existingCommands.length} existing commands:`, existingCommands)

		// See if an entry command already exists
		let entryCommand: APIApplicationCommand = existingCommands.find((command) => command.type === 4)
		logger.debug('Entry command:', entryCommand)

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
			logger.debug('Successfully cleaned up existing commands')

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
		} else {
			// Remove only commands that are no longer in the manifest by default
			const deletions = removedCommands.map((command) => {
				const existingCommand = existingCommands.find((c) => c.name === command)

				if (existingCommand) {
					return rest.delete(
						guildId
							? Routes.applicationGuildCommand(clientId, guildId, existingCommand.id)
							: Routes.applicationCommand(clientId, existingCommand.id)
					)
				}
			})
			await Promise.all(deletions)
			logger.debug('Successfully removed deleted commands')
		}

		// Ensure entry command is added if already there (or if reset)
		if (entryCommand) {
			// @ts-expect-error - This is a valid command object
			commandData.push(entryCommand)
		}

		// Let's register the commands!
		const registerCommandsPromise = (
			guildId
				? rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData })
				: rest.put(Routes.applicationCommands(clientId), { body: commandData })
		).then(() => ({ type: 'registerCommands' }))
		const timeoutPromise = timeout(
			() => ({ type: 'timeout' }),
			config.timeouts?.commandRegistration || DEFAULT_CONFIG.timeouts.commandRegistration
		)

		const result = await Promise.race([registerCommandsPromise, timeoutPromise])
		if (result.type === 'timeout') {
			logger.warn(`Command registration timed out. Run ${color.bold('robo build --force')} later to try again.`)
			return
		}

		const endTime = Date.now() - startTime
		let commandType = guildId ? 'guild' : 'global'

		if (config.experimental?.userInstall) {
			commandType += ' and user install'
		}

		logger.info(`Successfully updated ${color.bold(commandType + ' commands')} in ${endTime}ms`)
		logger.wait(color.dim('It may take a while for the changes to reflect in Discord.'))
		await Flashcore.delete(FLASHCORE_KEYS.commandRegisterError)
	} catch (error) {
		logger.error('Could not register commands!', error)
		logger.warn(`Run ${color.bold('robo build --force')} to try again.`)
		await Flashcore.set(FLASHCORE_KEYS.commandRegisterError, true)
	}
}
