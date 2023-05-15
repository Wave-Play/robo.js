import { registerProcessEvents } from './process.js'
import chalk from 'chalk'
import { Client, Collection, Events } from 'discord.js'
import path from 'node:path'
import { getConfig, loadConfig } from './config.js'
import { logger } from './logger.js'
import { getManifest, loadManifest } from '../cli/utils/manifest.js'
import { env } from './env.js'
import { stateLoad } from './process.js'
import { pathToFileURL } from 'node:url'
import { executeAutocompleteHandler, executeCommandHandler, executeEventHandler } from './handlers.js'
import { hasProperties } from '../cli/utils/utils.js'
import type { CommandRecord, EventRecord, Handler, PluginData } from '../types/index.js'

export const Robo = { restart, start, stop }

// Each Robo instance has its own client, exported for convenience
export let client: Client

// Oh yeah, you probably want to export these too!
export let commands: Collection<string, CommandRecord>
export let events: Collection<string, EventRecord[]>

// Don't export plugin, as they may contain sensitive data in their options
let plugins: Collection<string, PluginData>

interface StartOptions {
	awaitState?: boolean
	client?: Client
}

async function start(options?: StartOptions) {
	const { awaitState, client: optionsClient } = options ?? {}

	// Important! Register process events before doing anything else
	// This ensures the "ready" signal is sent to the parent process
	registerProcessEvents()

	// Load config and manifest up next!
	// This makes them available globally via getConfig() and getManifest()
	const [config] = await Promise.all([loadConfig(), loadManifest()])
	logger({
		enabled: config?.logger?.enabled,
		level: config?.logger?.level
	}).debug('Starting Robo...')

	// Wait for states to be loaded
	if (awaitState) {
		await stateLoad
	}

	// Load plugin options
	plugins = loadPluginData()

	// Create the new client instance
	client = optionsClient ?? new Client(config.clientOptions)

	// Load command and event modules
	commands = await loadHandlerModules<CommandRecord>('commands')
	events = await loadHandlerModules<EventRecord[]>('events')

	// Notify lifecycle event handlers
	await executeEventHandler(plugins, '_start', client)

	// Define event handlers
	for (const key of events.keys()) {
		const onlyAuto = events.get(key).every((event) => event.auto)
		client.on(key, async (...args) => {
			if (!onlyAuto) {
				logger.event(`Event received: ${chalk.bold(key)}`)
			}
			logger.trace('Event args:', args)

			// Notify event handler
			executeEventHandler(plugins, key, ...args)
		})
	}

	// Forward command interactions to our fancy handlers
	client.on(Events.InteractionCreate, async (interaction) => {
		if (interaction.isChatInputCommand()) {
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
			const commandKey = commandKeys.filter(Boolean).join(' ')
			logger.event(`Received slash command interaction: ${chalk.bold('/' + commandKey)}`)
			logger.trace('Chat input command:', interaction.toJSON())
			await executeCommandHandler(interaction, commandKey)
		} else if (interaction.isAutocomplete()) {
			logger.event(`Received autocomplete interaction`)
			logger.trace('Autocomplete interaction:', interaction.toJSON())
			await executeAutocompleteHandler(interaction)
		}
	})

	// Log in to Discord with your client's token
	await client.login(env.discord.token)
}

async function stop(exitCode = 0) {
	// Notify lifecycle handler
	await executeEventHandler(plugins, '_stop', client)
	client?.destroy()
	logger.debug(`Stopped Robo at ` + new Date().toLocaleString())
	process.exit(exitCode)
}

async function restart() {
	// Notify lifecycle handler
	await executeEventHandler(plugins, '_restart', client)
	client?.destroy()
	logger.debug(`Restarted Robo at ` + new Date().toLocaleString())
	process.exit(0)
}

interface ScanOptions<T> {
	manifestEntries: Record<string, T | T[]>
	recursionKeys?: string[]
}

async function scanEntries<T>(predicate: (entry: T, entryKeys: string[]) => Promise<void>, options: ScanOptions<T>) {
	const { manifestEntries, recursionKeys = [] } = options
	const promises: Promise<unknown>[] = []

	for (const entryName in manifestEntries) {
		const entryItem = manifestEntries[entryName]
		const entries = Array.isArray(entryItem) ? entryItem : [entryItem]

		entries.forEach((entry) => {
			const entryKeys = [...recursionKeys, entryName]
			promises.push(predicate(entry, entryKeys))

			if (hasProperties<{ subcommands: Record<string, T> }>(entry, ['subcommands']) && entry.subcommands) {
				const resursion = scanEntries(predicate, {
					manifestEntries: entry.subcommands,
					recursionKeys: entryKeys
				})
				promises.push(resursion)
			}
		})
	}

	return Promise.all(promises)
}

async function loadHandlerModules<T extends Handler | Handler[]>(type: 'commands' | 'events') {
	const collection = new Collection<string, T>()
	const manifest = getManifest()

	// Log manifest objects as debug info
	const color = type === 'commands' ? chalk.blue.bold : chalk.magenta.bold
	const formatCommand = (command: string) => color(`/${command}`)
	const formatEvent = (event: string) => color(`${event} (${manifest.events[event].length})`)
	const handlers = Object.keys(manifest[type]).map(type === 'commands' ? formatCommand : formatEvent)
	logger.debug(`Loading ${type}: ${handlers.join(', ')}`)

	await scanEntries(
		async (entry, entryKeys) => {
			// Skip for nested entries (no __path)
			if (!entry.__path) {
				return
			}

			// Load the module
			const basePath = path.join(process.cwd(), entry.__plugin?.path ?? '.', `.robo/build/${type}`)
			const importPath = pathToFileURL(path.join(basePath, entry.__path)).toString()

			const handler = {
				auto: entry.__auto,
				handler: await import(importPath),
				path: entry.__path,
				plugin: entry.__plugin
			}

			// Assign the handler to the collection, handling difference between types
			if (type === 'events') {
				const eventKey = entryKeys[0]
				if (!collection.has(eventKey)) {
					collection.set(eventKey, [] as T)
				}
				const handlers = collection.get(eventKey) as Handler[]
				handlers.push(handler)
			} else {
				const commandKey = entryKeys.join(' ')
				collection.set(commandKey, handler as T)
			}
		},
		{
			manifestEntries: manifest[type]
		}
	)

	return collection
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
