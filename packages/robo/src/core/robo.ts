import { color } from './color.js'
import { registerProcessEvents } from './process.js'
import { Compiler } from './../cli/utils/compiler.js'
import { Client, Collection, Events } from 'discord.js'
import { getConfig, loadConfig } from './config.js'
import { FLASHCORE_KEYS, discordLogger } from './constants.js'
import { logger } from './logger.js'
import { env } from './env.js'
import {
	executeAutocompleteHandler,
	executeCommandHandler,
	executeContextHandler,
	executeEventHandler
} from './handlers.js'
import { hasProperties, PackageDir } from '../cli/utils/utils.js'
import { Flashcore, prepareFlashcore } from './flashcore.js'
import { loadState } from './state.js'
import Portal from './portal.js'
import path from 'node:path'
import { isMainThread, parentPort } from 'node:worker_threads'
import type { HandlerRecord, PluginData } from '../types/index.js'
import type { AutocompleteInteraction, CommandInteraction } from 'discord.js'
import { Mode } from './mode.js'
import { loadEnv } from './dotenv.js'
import { generateDefaults } from '../cli/utils/generate-defaults.js'
import { generateManifest } from '../cli/utils/manifest.js'
import { buildPublicDirectory } from '../cli/utils/public.js'
import { findCommandDifferences, registerCommands } from '../cli/utils/commands.js'

export const Robo = { restart, start, stop, build }

// Each Robo instance has its own client, exported for convenience
export let client: Client

// A Portal is exported with each Robo to allow for dynamic controls
export const portal = new Portal()

// Be careful, plugins may contain sensitive data in their config
let plugins: Collection<string, PluginData>

interface StartOptions {
	client?: Client
	shard?: string | boolean
	stateLoad?: Promise<void>
}

interface BuildOptions {
	force?: boolean;
	distDir?: string;
}


export async function build(options: BuildOptions = {}) {
	// Debugging 
	logger.debug(`Building Robo...`)
	logger.debug('Build options:', options)
	logger.debug(`Current working directory:`, process.cwd())

	// Make sure environment variables are loaded
	const defaultMode = Mode.get()
	await loadEnv({ mode: defaultMode })

	// Load the configuration file
	const config = await loadConfig()
	const distDir = options.distDir
	? path.join(process.cwd(), options.distDir)
	: path.join(process.cwd(), '.robo', 'build')

	// Initialize Flashcore to persist build error data
	await prepareFlashcore()

	// Use the Robo Compiler to generate .robo/build
	const compileTime = await Compiler.buildCode({
		distDir: distDir,
		excludePaths: config.excludePaths?.map((p) => p.replaceAll('/', path.sep)),
	})
	logger.debug(`Compiled in ${compileTime}ms`)

	// Assign default commands and events
	const generatedFiles = await generateDefaults(distDir)

	// Generate manifest.json
	const oldManifest = await Compiler.useManifest({ safe: true })
	const manifestTime = Date.now()
	const manifest = await generateManifest(generatedFiles, 'robo')
	logger.debug(`Generated manifest in ${Date.now() - manifestTime}ms`)

	// Build /public for production if available
	await buildPublicDirectory()

	// Compare the old manifest with the new one
	const oldCommands = oldManifest.commands
	const newCommands = manifest.commands
	const addedCommands = findCommandDifferences(oldCommands, newCommands, 'added')
	const removedCommands = findCommandDifferences(oldCommands, newCommands, 'removed')
	const changedCommands = findCommandDifferences(oldCommands, newCommands, 'changed')
	const hasCommandChanges = addedCommands.length > 0 || removedCommands.length > 0 || changedCommands.length > 0

	// Do the same but for context commands
	const oldContextCommands = { ...(oldManifest.context?.message ?? {}), ...(oldManifest.context?.user ?? {}) }
	const newContextCommands = { ...manifest.context.message, ...manifest.context.user }
	const addedContextCommands = findCommandDifferences(oldContextCommands, newContextCommands, 'added')
	const removedContextCommands = findCommandDifferences(oldContextCommands, newContextCommands, 'removed')
	const changedContextCommands = findCommandDifferences(oldContextCommands, newContextCommands, 'changed')
	const hasContextCommandChanges =
		addedContextCommands.length > 0 || removedContextCommands.length > 0 || changedContextCommands.length > 0

	const shouldRegister = options.force || hasCommandChanges || hasContextCommandChanges

	if (config.experimental?.disableBot !== true && options.force) {
		discordLogger.warn('Forcefully registering commands.')
	}

	if (config.experimental?.disableBot !== true && shouldRegister) {
		await registerCommands(
			false,
			options.force,
			newCommands,
			manifest.context.message,
			manifest.context.user,
			changedCommands,
			addedCommands,
			removedCommands,
			changedContextCommands,
			addedContextCommands,
			removedContextCommands
		)
	}
}

async function start(options?: StartOptions) {
	const { client: optionsClient, shard, stateLoad } = options ?? {}

	// Important! Register process events before doing anything else
	// This ensures the "ready" signal is sent to the parent process
	registerProcessEvents()

	// Load config and manifest up next!
	// This makes them available globally via getConfig() and getManifest()
	const [config] = await Promise.all([loadConfig(), Compiler.useManifest()])
	logger({
		drain: config?.logger?.drain,
		enabled: config?.logger?.enabled,
		level: config?.logger?.level
	}).debug('Starting Robo...')

	// Wanna shard? Delegate to the shard manager and await recursive call
	if (shard && config.experimental?.disableBot !== true) {
		discordLogger.debug('Sharding is enabled. Delegating start to shard manager...')
		const { ShardingManager } = await import('discord.js')
		const shardPath = typeof shard === 'string' ? shard : path.join(PackageDir, 'dist', 'cli', 'shard.js')
		const options = typeof config.experimental?.shard === 'object' ? config.experimental.shard : {}
		const manager = new ShardingManager(shardPath, { ...options, token: env('discord.token') })

		manager.on('shardCreate', (shard) => discordLogger.debug(`Launched shard`, shard.id))
		const result = await manager.spawn()
		discordLogger.debug('Spawned', result.size, 'shard(s)')
		return
	}

	// Get ready for persistent data requests
	await prepareFlashcore()

	// Wait for states to be loaded
	if (stateLoad) {
		// Await external state promise if provided
		logger.debug('Waiting for state...')
		await stateLoad
	} else {
		// Load state directly otherwise
		const stateStart = Date.now()
		const state = await Flashcore.get<Record<string, unknown>>(FLASHCORE_KEYS.state)

		if (state) {
			loadState(state)
		}
		logger.debug(`State loaded in ${Date.now() - stateStart}ms`)
	}

	// Load plugin options
	const plugins = loadPluginData()

	// Create the new client instance (unless disabled)
	if (config.experimental?.disableBot !== true) {
		client = optionsClient ?? new Client(config.clientOptions)
	} else {
		logger.debug(`Bot is disabled, skipping client setup...`)
	}

	// Load the portal (commands, context, events)
	await Portal.open()

	// Notify lifecycle event handlers
	await executeEventHandler(plugins, '_start', client)

	if (config.experimental?.disableBot !== true) {
		// Define event handlers
		for (const key of portal.events.keys()) {
			const onlyAuto = portal.events.get(key).every((event: HandlerRecord<Event>) => event.auto)
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
		await client.login(env('discord.token'))
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
