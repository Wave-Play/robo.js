import { REST, Routes, SlashCommandBuilder } from 'discord.js'
import { logger as globalLogger, Logger } from './logger.js'
import { performance } from 'node:perf_hooks'
import chalk from 'chalk'
import { CommandConfig, CommandOption } from '../../types/index.js'
import { loadConfig } from './config.js'
import { DEFAULT } from '../../core/constants.js'
import { env } from '../../core/env.js'
import { timeout } from './utils.js'

// @ts-expect-error - Global logger is overriden by dev mode
let logger: Logger = globalLogger

export function buildSlashCommands(dev: boolean, commands: Record<string, CommandConfig>): SlashCommandBuilder[] {
	if (dev) {
		logger = new Logger({
			enabled: true,
			level: 'info'
		})
	}

	return Object.entries(commands).map(([key, config]) => {
		logger.debug(`Building slash command: ${key}`)
		const commandBuilder = new SlashCommandBuilder()
			.setName(key)
			.setNameLocalizations(config.nameLocalizations || {})
			.setDescription(config.description || 'No description provided')
			.setDescriptionLocalizations(config.descriptionLocalizations || {})

		if (config.options) {
			for (const option of config.options) {
				addOptionToCommandBuilder(commandBuilder, option.type, option)
			}
		}

		return commandBuilder
	})
}

export function addOptionToCommandBuilder(
	commandBuilder: SlashCommandBuilder,
	type: string,
	option: CommandOption
): void {
	switch (type) {
		case undefined:
		case null:
		case 'string':
			commandBuilder.addStringOption((optionBuilder) =>
				optionBuilder
					.setName(option.name)
					.setNameLocalizations(option.nameLocalizations ?? {})
					.setDescription(option.description || 'No description provided')
					.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
					.setRequired(option.required || false)
					.setAutocomplete(option.autocomplete || false)
			)
			break
		case 'integer':
			commandBuilder.addIntegerOption((optionBuilder) =>
				optionBuilder
					.setName(option.name)
					.setNameLocalizations(option.nameLocalizations ?? {})
					.setDescription(option.description || 'No description provided')
					.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
					.setRequired(option.required || false)
			)
			break
		case 'boolean':
			commandBuilder.addBooleanOption((optionBuilder) =>
				optionBuilder
					.setName(option.name)
					.setNameLocalizations(option.nameLocalizations || {})
					.setDescription(option.description ?? 'No description provided')
					.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
					.setRequired(option.required || false)
			)
			break
		case 'attachment':
			commandBuilder.addAttachmentOption((optionBuilder) =>
				optionBuilder
					.setName(option.name)
					.setNameLocalizations(option.nameLocalizations ?? {})
					.setDescription(option.description || 'No description provided')
					.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
					.setRequired(option.required || false)
			)
			break
		case 'channel':
			commandBuilder.addChannelOption((optionBuilder) =>
				optionBuilder
					.setName(option.name)
					.setNameLocalizations(option.nameLocalizations ?? {})
					.setDescription(option.description || 'No description provided')
					.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
					.setRequired(option.required || false)
			)
			break
		case 'mention':
			commandBuilder.addMentionableOption((optionBuilder) =>
				optionBuilder
					.setName(option.name)
					.setNameLocalizations(option.nameLocalizations ?? {})
					.setDescription(option.description || 'No description provided')
					.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
					.setRequired(option.required || false)
			)
			break
		case 'role':
			commandBuilder.addRoleOption((optionBuilder) =>
				optionBuilder
					.setName(option.name)
					.setNameLocalizations(option.nameLocalizations ?? {})
					.setDescription(option.description || 'No description provided')
					.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
					.setRequired(option.required || false)
			)
			break
		case 'user':
			commandBuilder.addUserOption((optionBuilder) =>
				optionBuilder
					.setName(option.name)
					.setNameLocalizations(option.nameLocalizations ?? {})
					.setDescription(option.description || 'No description provided')
					.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
					.setRequired(option.required || false)
			)
			break
		default:
			logger.warn(`Invalid option type: ${type}`)
	}
}

export function findChangedCommands(
	currentCommands: Record<string, CommandConfig>,
	newCommands: Record<string, CommandConfig>
): string[] {
	const commonKeys = Object.keys(currentCommands).filter((key) => key in newCommands)
	const fieldsToCompare: (keyof CommandConfig)[] = ['description', 'options']
	const changedKeys = commonKeys.filter((key) =>
		hasChangedFields(currentCommands[key], newCommands[key], fieldsToCompare)
	)
	return changedKeys
}

function hasChangedFields(obj1: CommandConfig, obj2: CommandConfig, fields: (keyof CommandConfig)[]): boolean {
	for (const field of fields) {
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
	slashCommands: SlashCommandBuilder[],
	changedCommands: string[],
	addedCommands: string[],
	removedCommands: string[]
) {
	const config = await loadConfig()
	const { clientId, guildId, token } = env.discord

	if (!token || !clientId) {
		logger.error('DISCORD_TOKEN or DISCORD_CLIENT_ID not found in environment variables')
		return
	}

	const startTime = performance.now()
	const rest = new REST({ version: '9' }).setToken(token)

	try {
		const addedChanges = addedCommands.map((cmd) => chalk.green(`/${chalk.bold(cmd)} (new)`))
		const removedChanges = removedCommands.map((cmd) => chalk.red(`/${chalk.bold(cmd)} (deleted)`))
		const updatedChanges = changedCommands.map((cmd) => chalk.blue(`/${chalk.bold(cmd)} (updated)`))

		const allChanges = [...addedChanges, ...removedChanges, ...updatedChanges]
		if (allChanges.length > 0) {
			logger.info('Command changes: ' + allChanges.join(', '))
		}

		const commandData = slashCommands.map((command) => command.toJSON())
		const registerCommandsPromise = (
			guildId
				? rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData })
				: rest.put(Routes.applicationCommands(clientId), { body: commandData })
		).then(() => ({ type: 'registerCommands' }))
		const timeoutPromise = timeout(
			() => ({ type: 'timeout' }),
			config.timeouts?.commandRegistration || DEFAULT.timeouts.registerCommands
		)

		const result = await Promise.race([registerCommandsPromise, timeoutPromise])
		if (result.type === 'timeout') {
			logger.warn(`Command registration timed out. Run ${chalk.bold('robo build --force')} later to try again.`)
			return
		}

		const endTime = Math.round(performance.now() - startTime)
		const commandType = guildId ? 'guild (' + guildId + ')' : 'global'
		logger.info(`Successfully updated ${chalk.bold(commandType + ' commands')} in ${endTime}ms`)
	} catch (error) {
		logger.error('Could not register commands! ' + JSON.stringify(error))
		logger.warn(`Run ${chalk.bold('robo build --force')} to try again.`)
	}
}
