import chalk from 'chalk'
import { Client, Collection, Events } from 'discord.js'
import path from 'node:path'
import { getSage, timeout } from '../cli/utils/utils.js'
import { getConfig, loadConfig } from '../cli/utils/config.js'
import { logger } from '../cli/utils/logger.js'
import { getManifest, loadManifest } from '../cli/utils/manifest.js'
import { env } from './env.js'
import { DEFAULT, TIMEOUT } from './constants.js'
import { pathToFileURL } from 'node:url'
import type { AutocompleteInteraction, CommandInteraction } from 'discord.js'
import type { CommandConfig, CommandRecord, EventRecord, Handler, PluginData, RoboMessage } from '../types/index.js'

export const RoboSocket = { start, stop }

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
	client = new Client({ intents: config.intents })

	// Load command and event modules
	commands = await loadHandlerModules<CommandRecord>('commands')
	events = await loadHandlerModules<EventRecord[]>('events')

	// Notify lifecycle event handlers
	await executeEventHandler('_start', client)

	// Define event handlers
	for (const key of events.keys()) {
		client.on(key, async (...args) => {
			logger.event(`Event received: ${key}`)
			logger.trace('Event args:', args)

			// Notify event handler
			executeEventHandler(key, ...args)
		})
	}

	// When the client is ready, run this code (only once)
	client.once(Events.ClientReady, async (c) => {
		logger.ready(`On standby as ${chalk.bold(c.user.tag)}`)

		// Ping heartbeat monitor if configured
		if (config.heartbeat?.url) {
			// Supress Fetch API experimental warning
			process.removeAllListeners('warning')

			setInterval(() => {
				if (!client?.isReady() || client?.uptime <= 0) {
					if (config.heartbeat.debug) {
						logger.warn('Robo is not ready, skipping heartbeat.')
					}
					return
				}

				// Bah-dumtz!
				if (config.heartbeat.debug) {
					logger.debug('Sending heartbeat...', new Date().toISOString())
				}
				fetch(config.heartbeat.url)
			}, config.heartbeat?.interval || DEFAULT.heartbeat.interval)
		}
	})

	client.on(Events.InteractionCreate, async (interaction) => {
		if (interaction.isChatInputCommand()) {
			logger.event(`Received chat input command`)
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
	await executeEventHandler('_stop', client)
	client?.destroy()
	logger.debug(`Stopped Robo`)
	process.exit(0)
}

process.on('SIGINT', async () => {
	logger.debug('Received SIGINT signal.')
	await stop()
})

process.on('SIGTERM', async () => {
	logger.debug('Received SIGTERM signal.')
	await stop()
})

process.on('message', async (message: RoboMessage) => {
	logger.debug('Received message from parent:', message)
	if (message?.type === 'restart') {
		await executeEventHandler('_restart', client)
		client?.destroy()
		process.exit(0)
	} else {
		logger.debug('Unknown message:', message)
	}
})

async function executeAutocompleteHandler(interaction: AutocompleteInteraction) {
	const command = commands.get(interaction.commandName)
	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`)
		return
	}

	const config = getConfig()
	try {
		// Delegate to autocomplete handler
		const promises = [command.handler.autocomplete(interaction)]
		const timeoutDuration = config?.timeouts?.autocomplete

		// Enforce timeout only if custom timeout is configured
		if (timeoutDuration) {
			promises.push(timeout(() => [], timeoutDuration))
		}

		// Wait for response or timeout
		const response = await Promise.race(promises)
		if (!response) {
			throw new Error('Autocomplete timed out')
		}

		await interaction.respond(response)
	} catch (error) {
		logger.error('Autocomplete error:', error)
	}
}

async function executeCommandHandler(interaction: CommandInteraction) {
	// Find command handler
	const command = commands.get(interaction.commandName)
	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`)
		return
	}

	// Prepare options and config
	const commandConfig: CommandConfig = command.handler.config
	const config = getConfig()
	const sage = getSage(commandConfig, config)
	logger.debug(`Sage options:`, sage)

	try {
		// Delegate to command handler
		const result = command.handler.default(interaction)
		const promises = []
		if (sage.defer && result instanceof Promise) {
			logger.debug(`Sage is deferring async command...`)
			promises.push(result)
			await interaction.deferReply({ ephemeral: sage.ephemeral })
		}

		// Enforce timeout only if custom timeout is configured
		let response
		if (promises.length > 0) {
			if (config?.timeouts?.commandDeferral) {
				promises.push(timeout(() => null, config.timeouts.commandDeferral))
			}

			// Wait for response or timeout
			response = await Promise.race(promises)
			if (!response) {
				throw new Error('Command timed out')
			}
		} else {
			response = result
		}

		// Stop here if sage mode is disabled
		if (!sage.reply) {
			return logger.debug('Sage reply is disabled, skipping response')
		}

		logger.debug(`Sage is handling reply:`, response)
		const reply = typeof response === 'string' ? { content: response } : response
		if (interaction.deferred) {
			await interaction.editReply(reply)
		} else {
			await interaction.reply(reply)
		}
	} catch (error) {
		logger.error('Chat input command error:', error)
		console.error(error)
		try {
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true })
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true })
			}
		} catch (error) {
			logger.warn('Input command error:', error)
		}
	}
}

async function executeEventHandler(eventName: string, ...eventData: unknown[]) {
	const callbacks = events.get(eventName)
	if (!callbacks?.length) {
		return Promise.resolve()
	}

	const config = getConfig()
	const isLifecycleEvent = eventName.startsWith('_')
	await Promise.all(
		callbacks.map(async (callback) => {
			try {
				// Execute handler without timeout if not a lifecycle event
				const handlerPromise = callback.handler.default(...eventData, plugins.get(callback.plugin?.name)?.options)
				if (!isLifecycleEvent) {
					return handlerPromise
				}

				// Enforce timeouts for lifecycle events
				const timeoutPromise = timeout(() => TIMEOUT, config?.timeouts?.lifecycle || DEFAULT.timeouts.lifecycle)
				return await Promise.race([handlerPromise, timeoutPromise])
			} catch (error) {
				const metaOptions = plugins.get(callback.plugin?.name)?.metaOptions ?? {}
				if (error === TIMEOUT) {
					logger.warn(`${eventName} lifecycle event handler timed out`)
				} else if (!callback.plugin) {
					logger.error(`Error executing ${eventName} event handler:`, error)
				} else if (eventName === '_start' && metaOptions.failSafe) {
					logger.warn(`${callback.plugin.name} plugin failed to start:`, error)
				} else {
					logger.error(`${callback.plugin.name} plugin error in event ${eventName}:`, error)
				}
			}
		})
	)
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

	for (const itemName in manifest[type]) {
		const itemConfig = manifest[type][itemName]
		const items = Array.isArray(itemConfig) ? itemConfig : [itemConfig]

		await Promise.all(
			items.map(async (itemConfig) => {
				const basePath = path.join(process.cwd(), itemConfig.__plugin?.path ?? '.', `.robo/build/${type}`)
				const importPath = pathToFileURL(path.join(basePath, itemConfig.__path)).toString()

				const handler = {
					handler: await import(importPath),
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
