import chalk from 'chalk'
import { Client, Collection, Events } from 'discord.js'
import path from 'node:path'
import { getConfig, loadConfig } from '../cli/utils/config.js'
import { logger } from './logger.js'
import { getManifest, loadManifest } from '../cli/utils/manifest.js'
import { env } from './env.js'
import { pathToFileURL } from 'node:url'
import { executeAutocompleteHandler, executeCommandHandler, executeEventHandler } from './handlers.js'
import type { CommandRecord, EventRecord, Handler, PluginData, RoboMessage } from '../types/index.js'

export const Robo = { restart, start, stop }

// Each Robo instance has its own client, exported for convenience
export let client: Client

// Oh yeah, you probably want to export these too!
export let commands: Collection<string, CommandRecord>
export let events: Collection<string, EventRecord[]>

// Don't export plugin, as they may contain sensitive data in their options
let plugins: Collection<string, PluginData>

async function start() {
	// Load config and manifest right away
	// This makes them available globally via getConfig() and getManifest()
	const [config] = await Promise.all([loadConfig(), loadManifest()])
	logger({
		enabled: config?.logger?.enabled,
		level: config?.logger?.level
	}).debug('Starting Robo...')

	// Load plugin options
	plugins = loadPluginData()

	// Create the new client instance
	client = new Client(config.clientOptions)

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
			logger.event(`Received slash command interaction: ${chalk.bold('/' + interaction.commandName)}`)
			logger.trace('Chat input command:', interaction.toJSON())
			await executeCommandHandler(interaction)
		} else if (interaction.isAutocomplete()) {
			logger.event(`Received autocomplete interaction`)
			logger.trace('Autocomplete interaction:', interaction.toJSON())
			await executeAutocompleteHandler(interaction)
		}
	})

	// Log in to Discord with your client's token
	await client.login(env.discord.token)
}

async function stop() {
	// Notify lifecycle handler
	await executeEventHandler(plugins, '_stop', client)
	client?.destroy()
	logger.debug(`Stopped Robo`)
	process.exit(0)
}

async function restart() {
	// Notify lifecycle handler
	await executeEventHandler(plugins, '_restart', client)
	client?.destroy()
	process.exit(0)
}

process.on('SIGINT', () => {
	logger.debug('Received SIGINT signal.')
	stop()
})

process.on('SIGTERM', () => {
	logger.debug('Received SIGTERM signal.')
	stop()
})

process.on('message', (message: RoboMessage) => {
	logger.debug('Received message from parent:', message)
	if (message?.type === 'restart') {
		restart()
	} else {
		logger.debug('Unknown message:', message)
	}
})

async function loadHandlerModules<T extends Handler | Handler[]>(type: 'commands' | 'events') {
	const collection = new Collection<string, T>()
	const manifest = getManifest()

	// Log manifest objects as debug info
	const color = type === 'commands' ? chalk.blue.bold : chalk.magenta.bold
	const formatCommand = (command: string) => color(`/${command}`)
	const formatEvent = (event: string) => color(`${event} (${manifest.events[event].length})`)
	const handlers = Object.keys(manifest[type]).map(type === 'commands' ? formatCommand : formatEvent)
	logger.debug(`Loading ${type}: ${handlers.join(', ')}`)

	for (const itemName in manifest[type]) {
		const itemConfig = manifest[type][itemName]
		const items = Array.isArray(itemConfig) ? itemConfig : [itemConfig]

		await Promise.all(
			items.map(async (itemConfig) => {
				const basePath = path.join(process.cwd(), itemConfig.__plugin?.path ?? '.', `.robo/build/${type}`)
				const importPath = pathToFileURL(path.join(basePath, itemConfig.__path)).toString()

				const handler = {
					auto: itemConfig.__auto,
					handler: await import(importPath),
					path: itemConfig.__path,
					plugin: itemConfig.__plugin
				}

				if (type === 'events') {
					if (!collection.has(itemName)) {
						collection.set(itemName, [] as T)
					}
					const handlers = collection.get(itemName) as Handler[]
					if (handlers) {
						handlers.push(handler)
					}
				} else {
					collection.set(itemName, handler as T)
				}
			})
		)
	}

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
