import { REST, Routes, SlashCommandBuilder } from 'discord.js'
import { logger as globalLogger, Logger } from '../../core/logger.js'
import { performance } from 'node:perf_hooks'
import chalk from 'chalk'
import { CommandEntry, CommandOption } from '../../types/index.js'
import { loadConfig } from '../../core/config.js'
import { DEFAULT_CONFIG } from '../../core/constants.js'
import { env } from '../../core/env.js'
import { timeout } from './utils.js'
import type { ApplicationCommandOptionBase } from 'discord.js'

// @ts-expect-error - Global logger is overriden by dev mode
let logger: Logger = globalLogger

export function buildSlashCommands(dev: boolean, commands: Record<string, CommandEntry>): SlashCommandBuilder[] {
	if (dev) {
		logger = new Logger({
			enabled: true,
			level: 'info'
		})
	}

	return Object.entries(commands).map(([key, config]): SlashCommandBuilder => {
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

export function addOptionToCommandBuilder(commandBuilder: SlashCommandBuilder, type: string, option: CommandOption) {
	const optionPredicate = <T extends ApplicationCommandOptionBase>(optionBuilder: T) =>
		optionBuilder
			.setName(option.name)
			.setNameLocalizations(option.nameLocalizations ?? {})
			.setDescription(option.description || 'No description provided')
			.setDescriptionLocalizations(option.descriptionLocalizations ?? {})
			.setRequired(option.required || false)

	switch (type) {
		case undefined:
		case null:
		case 'string':
			commandBuilder.addStringOption(optionPredicate)
			break
		case 'integer':
			commandBuilder.addIntegerOption(optionPredicate)
			break
		case 'boolean':
			commandBuilder.addBooleanOption(optionPredicate)
			break
		case 'attachment':
			commandBuilder.addAttachmentOption(optionPredicate)
			break
		case 'channel':
			commandBuilder.addChannelOption(optionPredicate)
			break
		case 'mention':
			commandBuilder.addMentionableOption(optionPredicate)
			break
		case 'role':
			commandBuilder.addRoleOption(optionPredicate)
			break
		case 'user':
			commandBuilder.addUserOption(optionPredicate)
			break
		default:
			logger.warn(`Invalid option type: ${type}`)
	}
}

export function findChangedCommands(
	currentCommands: Record<string, CommandEntry>,
	newCommands: Record<string, CommandEntry>
): string[] {
	const commonKeys = Object.keys(currentCommands).filter((key) => key in newCommands)
	const fieldsToCompare: (keyof CommandEntry)[] = ['description', 'options']
	const changedKeys = commonKeys.filter((key) =>
		hasChangedFields(currentCommands[key], newCommands[key], fieldsToCompare)
	)
	return changedKeys
}

function hasChangedFields(obj1: CommandEntry, obj2: CommandEntry, fields: (keyof CommandEntry)[]): boolean {
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
	dev: boolean,
	newCommands: Record<string, CommandEntry>,
	changedCommands: string[],
	addedCommands: string[],
	removedCommands: string[]
) {
	const config = await loadConfig()
	const { clientId, guildId, token } = env.discord

	if (!token || !clientId) {
		logger.error(
			`${chalk.bold('DISCORD_TOKEN')} or ${chalk.bold('DISCORD_CLIENT_ID')} not found in environment variables`
		)
		return
	}

	const startTime = performance.now()
	const rest = new REST({ version: '9' }).setToken(token)

	try {
		const slashCommands = buildSlashCommands(dev, newCommands)
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
			config.timeouts?.commandRegistration || DEFAULT_CONFIG.timeouts.commandRegistration
		)

		const result = await Promise.race([registerCommandsPromise, timeoutPromise])
		if (result.type === 'timeout') {
			logger.warn(`Command registration timed out. Run ${chalk.bold('robo build --force')} later to try again.`)
			return
		}

		const endTime = Math.round(performance.now() - startTime)
		const commandType = guildId ? 'guild' : 'global'
		logger.info(`Successfully updated ${chalk.bold(commandType + ' commands')} in ${endTime}ms`)
	} catch (error) {
		logger.error('Could not register commands!', error)
		logger.warn(`Run ${chalk.bold('robo build --force')} to try again.`)
	}
}
