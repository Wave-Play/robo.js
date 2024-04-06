import { color } from './color.js'
import { registerProcessEvents } from './process.js'
import { Client, Collection, Events } from 'discord.js'
import { getConfig, loadConfig } from './config.js'
import { discordLogger } from './constants.js'
import { logger } from './logger.js'
import { loadManifest } from '../cli/utils/manifest.js'
import { env } from './env.js'
import {
	executeAutocompleteHandler,
	executeCommandHandler,
	executeContextHandler,
	executeEventHandler
} from './handlers.js'
import { hasProperties } from '../cli/utils/utils.js'
import { prepareFlashcore } from './flashcore.js'
import Portal from './portal.js'
import { isMainThread, parentPort } from 'node:worker_threads'
import type { PluginData } from '../types/index.js'
import type { AutocompleteInteraction, CommandInteraction } from 'discord.js'

export const Robo = { restart, start, stop }

// Each Robo instance has its own client, exported for convenience
export let client: Client

// A Portal is exported with each Robo to allow for dynamic controls
export let portal: Portal

// Be careful, plugins may contain sensitive data in their config
let plugins: Collection<string, PluginData>

interface StartOptions {
	client?: Client
	stateLoad?: Promise<void>
}

async function start(options?: StartOptions) {
	const { client: optionsClient, stateLoad } = options ?? {}

	// Important! Register process events before doing anything else
	// This ensures the "ready" signal is sent to the parent process
	registerProcessEvents()

	// Load config and manifest up next!
	// This makes them available globally via getConfig() and getManifest()
	const [config] = await Promise.all([loadConfig(), loadManifest()])
	logger({
		drain: config?.logger?.drain,
		enabled: config?.logger?.enabled,
		level: config?.logger?.level
	}).debug('Starting Robo...')

	// Wait for states to be loaded
	if (stateLoad) {
		logger.debug('Waiting for state...')
		await stateLoad
	}

	// Load plugin options and start up Flashcore
	const plugins = loadPluginData()
	await prepareFlashcore()

	// Create the new client instance (unless disabled)
	if (config.experimental?.disableBot !== true) {
		client = optionsClient ?? new Client(config.clientOptions)
	} else {
		logger.debug(`Bot is disabled, skipping client setup...`)
	}

	// Load the portal (commands, context, events)
	portal = await Portal.open()

	// Notify lifecycle event handlers
	await executeEventHandler(plugins, '_start', client)

	if (config.experimental?.disableBot !== true) {
		// Define event handlers
		for (const key of portal.events.keys()) {
			const onlyAuto = portal.events.get(key).every((event) => event.auto)
			client.on(key, async (...args) => {
				if (!onlyAuto) {
					discordLogger.event(`Event received: ${color.bold(key)}`)
				}
				discordLogger.trace('Event args:', args)

				// Notify event handler
				executeEventHandler(plugins, key, ...args)
			})
		}

		// Forward command interactions to our fancy handlers
		client.on(Events.InteractionCreate, async (interaction) => {
			if (interaction.isChatInputCommand()) {
				const commandKey = getCommandKey(interaction)
				discordLogger.event(`Received slash command interaction: ${color.bold('/' + commandKey)}`)
				discordLogger.trace('Slash command interaction:', interaction.toJSON())
				await executeCommandHandler(interaction, commandKey)
			} else if (interaction.isAutocomplete()) {
				const commandKey = getCommandKey(interaction)
				discordLogger.event(`Received autocomplete interaction for: ${color.bold(interaction.commandName)}`)
				discordLogger.trace('Autocomplete interaction:', interaction.toJSON())
				await executeAutocompleteHandler(interaction, commandKey)
			} else if (interaction.isContextMenuCommand()) {
				discordLogger.event(`Received context menu interaction: ${color.bold(interaction.commandName)}`)
				discordLogger.trace('Context menu interaction:', interaction.toJSON())
				await executeContextHandler(interaction, interaction.commandName)
			}
		})

		// Log in to Discord with your client's token
		await client.login(env.discord.token)
	}
}

async function stop(exitCode = 0) {
	try {
		// Notify lifecycle handler
		await executeEventHandler(plugins, '_stop', client)
		client?.destroy()
		logger.debug(`Stopped Robo at ` + new Date().toLocaleString())
	} finally {
		if (isMainThread) {
			process.exit(exitCode)
		} else {
			await logger.flush()
			parentPort?.postMessage({ event: 'stop', payload: 'exit' })
			parentPort?.close()
			process.exit(exitCode)
		}
	}
}

async function restart() {
	try {
		// Notify lifecycle handler
		await executeEventHandler(plugins, '_restart', client)
		client?.destroy()
		logger.debug(`Restarted Robo at ` + new Date().toLocaleString())
	} finally {
		if (isMainThread) {
			process.exit(0)
		} else {
			await logger.flush()
			parentPort?.postMessage({ event: 'stop', payload: 'exit' })
			parentPort?.close()
			process.exit()
		}
	}
}

function getCommandKey(interaction: AutocompleteInteraction | CommandInteraction) {
	const commandKeys = [interaction.commandName]
	if (hasProperties<{ getSubcommandGroup: () => string }>(interaction.options, ['getSubcommandGroup'])) {
		try {
			commandKeys.push(interaction.options.getSubcommandGroup())
		} catch {
			// Ignore
		}
	}
	if (hasProperties<{ getSubcommand: () => string }>(interaction.options, ['getSubcommand'])) {
		try {
			commandKeys.push(interaction.options.getSubcommand())
		} catch {
			// Ignore
		}
	}
	return commandKeys.filter(Boolean).join(' ')
}

function loadPluginData() {
	const config = getConfig()
	const collection = new Collection<string, PluginData>()
	if (!config.plugins) {
		return collection
	}

	for (const plugin of config.plugins) {
		if (typeof plugin === 'string') {
			collection.set(plugin, { name: plugin })
		} else if (Array.isArray(plugin)) {
			const [name, options, metaOptions] = plugin
			collection.set(name, { name, options, metaOptions })
		}
	}

	return collection
}
