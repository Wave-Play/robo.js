/**
 * Start Hook - Discord Client Initialization
 *
 * This hook runs during Robo.start() to:
 * 1. Create the Discord.js Client instance
 * 2. Register event listeners for gateway events
 * 3. Register interaction handler for commands/autocomplete/context menus
 * 4. Login to Discord
 */
import { Client, Events } from 'discord.js'
import { portal, getPluginOptions, color, Mode } from 'robo.js'
import { setClient, setPluginState } from '../../core/client.js'
import { discordLogger } from '../../core/logger.js'
import { getCommandKey } from '../../core/utils.js'
import { handleInteraction } from '../../core/interactions.js'
import { executeEventHandler } from '../../core/handlers/event.js'
import type { DiscordConfig, PluginState } from '../../types/index.js'
import type { Event, HandlerRecord } from 'robo.js'

/**
 * Start hook - Creates and initializes the Discord client
 */
export default async function startHook(): Promise<void> {
	// Get plugin options from config
	const options = getPluginOptions('@robojs/discordjs') as DiscordConfig | null
	const clientOptions = options?.clientOptions ?? { intents: [] }
	const mode = Mode.get()

	discordLogger.debug('Starting Discord client with options:', clientOptions)

	// Initialize plugin state
	const pluginState: PluginState = {
		serverRestrictions: new Map(),
		config: options ?? {}
	}
	setPluginState(pluginState)

	// Register plugin state with portal for controller access
	portal.registerPluginState('discord', pluginState)

	// Create the Discord client
	const client = new Client(clientOptions)
	setClient(client)

	// Production: eagerly load all routes for fastest runtime
	if (mode === 'production') {
		await eagerLoadHandlers()
	}

	// Register gateway event listeners
	await registerEventListeners(client)

	// Register special ready event handler
	registerReadyHandler(client)

	// Register interaction handler for commands/autocomplete/context menus
	registerInteractionHandler(client)

	// Get the bot token from environment
	const token = process.env.DISCORD_TOKEN
	if (!token) {
		throw new Error('Missing DISCORD_TOKEN environment variable. Set it in your .env file.')
	}

	// Login to Discord
	discordLogger.debug('Logging in to Discord...')
	await client.login(token)
	discordLogger.debug('Successfully logged in to Discord')
}

/**
 * Eagerly load all handlers in production mode for fastest runtime access
 */
async function eagerLoadHandlers(): Promise<void> {
	// Load all route manifests
	await Promise.all([
		portal.ensureRoute('discord', 'commands'),
		portal.ensureRoute('discord', 'context'),
		portal.ensureRoute('discord', 'events')
	])

	// Get all handler keys
	const commands = Object.keys(portal.getByType('discord:commands'))
	const contexts = Object.keys(portal.getByType('discord:context'))

	// Import all handlers in parallel
	await Promise.all([
		...commands.map((k) => portal.importHandler('discord', 'commands', k)),
		...contexts.map((k) => portal.importHandler('discord', 'context', k))
	])

	discordLogger.debug(`Pre-loaded ${commands.length} commands, ${contexts.length} context menus`)
}

/**
 * Register special ready event handler
 */
function registerReadyHandler(client: Client): void {
	client.once(Events.ClientReady, async (readyClient) => {
		discordLogger.ready(`On standby as ${color.bold(readyClient.user.tag)}`)

		// Dispatch to user's ready handlers
		await executeEventHandler('ready', readyClient)
	})
}

/**
 * Register event listeners for all gateway events defined in the portal
 */
async function registerEventListeners(client: Client): Promise<void> {
	// Ensure the events route is loaded
	await portal.ensureRoute('discord', 'events')

	// Get events from portal
	const events = portal.getByType('discord:events') as Record<string, HandlerRecord<Event>[]>

	for (const [eventName, eventHandlers] of Object.entries(events)) {
		// Skip lifecycle events (they're handled separately)
		if (eventName.startsWith('_')) {
			continue
		}

		// Skip ready event (handled specially above)
		if (eventName === 'ready') {
			continue
		}

		// Check if all handlers are auto-generated (for logging purposes)
		const onlyAuto = eventHandlers.every((event: HandlerRecord<Event>) => event.auto)

		// Register the event listener
		client.on(eventName, async (...args: unknown[]) => {
			if (!onlyAuto) {
				discordLogger.event(`Event received: ${color.bold(eventName)}`)
			}
			discordLogger.trace('Event args:', args)

			// Execute all event handlers
			await executeEventHandler(eventName, ...args)
		})

		discordLogger.debug(`Registered event listener: ${eventName} (${eventHandlers.length} handler(s))`)
	}
}

/**
 * Register the interaction handler for commands, autocomplete, and context menus
 */
function registerInteractionHandler(client: Client): void {
	client.on(Events.InteractionCreate, async (interaction) => {
		if (interaction.isChatInputCommand()) {
			const commandKey = getCommandKey(interaction)
			discordLogger.event(`Received slash command: ${color.bold('/' + commandKey)}`)
			discordLogger.trace('Slash command interaction:', interaction.toJSON())
			await handleInteraction(interaction, 'command', commandKey)
		} else if (interaction.isAutocomplete()) {
			const commandKey = getCommandKey(interaction)
			discordLogger.event(`Received autocomplete for: ${color.bold(interaction.commandName)}`)
			discordLogger.trace('Autocomplete interaction:', interaction.toJSON())
			await handleInteraction(interaction, 'autocomplete', commandKey)
		} else if (interaction.isContextMenuCommand()) {
			discordLogger.event(`Received context menu: ${color.bold(interaction.commandName)}`)
			discordLogger.trace('Context menu interaction:', interaction.toJSON())
			await handleInteraction(interaction, 'context', interaction.commandName)
		}
	})

	discordLogger.debug('Registered interaction handler')
}
