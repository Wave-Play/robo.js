/**
 * Build complete hook for @robojs/discordjs
 *
 * Runs after manifest generation. Handles:
 * - Command/context menu registration with Discord API
 * - Intent inference and validation
 * - Metadata aggregation
 */
import type { BuildCompleteContext, ProcessedEntry } from 'robo.js'
import { Env } from 'robo.js'
import { discordLogger } from '../../../core/logger.js'
import { inferIntents, getIntentNames } from '../../../core/intents.js'
import { buildSlashCommands, buildContextCommands, registerCommandsToDiscord } from '../../../core/commands.js'
import { REST } from 'discord.js'
import type { DiscordConfig } from '../../../types/index.js'

export default async function (context: BuildCompleteContext) {
	const { entries, mode, store } = context
	const discordConfig = context.config as unknown as DiscordConfig | undefined
	const envData = Env.data()

	// Get command and context menu entries from the manifest
	const commandEntries = entries.get('discord', 'commands') ?? []
	const contextEntries = entries.get('discord', 'context') ?? []
	const eventEntries = entries.get('discord', 'events') ?? []

	discordLogger.debug(`Found ${commandEntries.length} commands, ${contextEntries.length} context menus, ${eventEntries.length} events`)

	// Analyze and validate intents
	const eventNames = eventEntries.map((e: ProcessedEntry) => e.key)
	const inferredIntents = inferIntents(eventNames)

	if (inferredIntents.size > 0) {
		const intentNames = getIntentNames(inferredIntents)
		discordLogger.debug(`Inferred intents from events: ${intentNames.join(', ')}`)

		// Store inferred intents for runtime use
		store.set('discord:inferredIntents', Array.from(inferredIntents))
	}

	// Determine if we should register commands
	const shouldRegister = mode === 'production' || discordConfig?.registerOnDev === true
	const hasToken = store.get<boolean>('discord:hasToken')
	const hasClientId = store.get<boolean>('discord:hasClientId')

	if (!shouldRegister) {
		discordLogger.debug('Skipping command registration (dev mode)')
		return
	}

	if (!hasClientId || !hasToken) {
		discordLogger.warn('Cannot register commands: missing DISCORD_CLIENT_ID or DISCORD_TOKEN')
		return
	}

	// Build command structures
	const clientId = envData.DISCORD_CLIENT_ID!
	const token = envData.DISCORD_TOKEN!
	const guildId = envData.DISCORD_GUILD_ID ?? discordConfig?.testServers?.[0]

	try {
		// Convert entries to command format
		const commands = entriesToCommands(commandEntries)
		const userContext = entriesToContext(contextEntries, 'user')
		const messageContext = entriesToContext(contextEntries, 'message')

		// Build Discord API command structures
		const slashCommands = buildSlashCommands(commands, discordConfig)
		const userContextCommands = buildContextCommands(userContext, 'user', discordConfig)
		const messageContextCommands = buildContextCommands(messageContext, 'message', discordConfig)

		const commandData = [
			...slashCommands.map((cmd) => cmd.toJSON()),
			...userContextCommands.map((cmd) => cmd.toJSON()),
			...messageContextCommands.map((cmd) => cmd.toJSON())
		]

		if (commandData.length === 0) {
			discordLogger.debug('No commands to register')
			return
		}

		// Register with Discord API
		const rest = new REST({ version: '10' }).setToken(token)
		await registerCommandsToDiscord(rest, clientId, guildId, commandData, false)

		const scope = guildId ? `guild ${guildId}` : 'global'
		discordLogger.info(`Registered ${commandData.length} ${scope} commands`)
	} catch (error) {
		discordLogger.error('Failed to register Discord commands:', error)
	}
}

/**
 * Convert processed entries to command entry format.
 */
function entriesToCommands(entries: ProcessedEntry[]) {
	const commands: Record<string, Record<string, unknown>> = {}

	for (const entry of entries) {
		const keyParts = entry.key.split(' ')
		const rootName = keyParts[0]

		if (keyParts.length === 1) {
			// Top-level command
			commands[rootName] = {
				...entry.metadata
			}
		} else if (keyParts.length === 2) {
			// Subcommand
			if (!commands[rootName]) {
				commands[rootName] = { subcommands: {} }
			}
			if (!commands[rootName].subcommands) {
				commands[rootName].subcommands = {}
			}
			(commands[rootName].subcommands as Record<string, unknown>)[keyParts[1]] = entry.metadata
		} else if (keyParts.length === 3) {
			// Subcommand group
			if (!commands[rootName]) {
				commands[rootName] = { subcommands: {} }
			}
			if (!commands[rootName].subcommands) {
				commands[rootName].subcommands = {}
			}
			const subcommands = commands[rootName].subcommands as Record<string, Record<string, unknown>>
			if (!subcommands[keyParts[1]]) {
				subcommands[keyParts[1]] = { subcommands: {} }
			}
			if (!subcommands[keyParts[1]].subcommands) {
				subcommands[keyParts[1]].subcommands = {}
			}
			(subcommands[keyParts[1]].subcommands as Record<string, unknown>)[keyParts[2]] = entry.metadata
		}
	}

	return commands
}

/**
 * Convert processed entries to context menu format.
 */
function entriesToContext(entries: ProcessedEntry[], type: 'user' | 'message') {
	const contextType = type === 'user' ? 2 : 3
	const result: Record<string, Record<string, unknown>> = {}

	for (const entry of entries) {
		if (entry.metadata.contextType === contextType) {
			result[entry.key] = entry.metadata
		}
	}

	return result
}
