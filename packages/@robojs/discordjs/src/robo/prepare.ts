/**
 * Prepare Hook - Discord Client Setup
 *
 * This hook runs during Robo.start() BEFORE the start hook to:
 * 1. Create the Discord.js Client instance
 * 2. Register event listeners for gateway events
 * 3. Register interaction handler for commands/autocomplete/context menus
 *
 * The client is NOT logged in yet - that happens in the start hook.
 * This allows other plugins to access the client during their start hooks.
 */
import { Client, Events } from 'discord.js'
import { Manifest, Mode, portal, color } from 'robo.js'
import { setClient, setPluginState } from '../core/client.js'
import { discordLogger } from '../core/logger.js'
import { getCommandKey } from '../core/utils.js'
import { handleInteraction } from '../core/interactions.js'
import { clearEventListeners, syncEventListeners } from './event-topology.js'
import { executePrefixCommandHandler, resolveCommandKey } from '../core/handlers/prefix-command.js'
import type { DiscordConfig, PluginState } from '../types/index.js'
import type { PrepareContext } from 'robo.js'

let interactionHandlerRegistered = false
let prefixHandlerRegistered = false

/**
 * Reset registration flags (for testing only).
 */
export function resetRegistrationFlags(): void {
	interactionHandlerRegistered = false
	prefixHandlerRegistered = false
}

/**
 * Prepare hook - Creates and configures the Discord client (without logging in)
 */
export default async function prepareHook(context: PrepareContext<DiscordConfig>): Promise<void> {
	interactionHandlerRegistered = false
	prefixHandlerRegistered = false
	const { pluginConfig, logger } = context
	const clientOptions = pluginConfig?.clientOptions ?? { intents: [] }

	// Support mock server REST API override via environment variable
	// This allows @robojs/mock to redirect Discord.js to the mock server
	if (process.env.DISCORD_REST_API) {
		clientOptions.rest = {
			...clientOptions.rest,
			api: process.env.DISCORD_REST_API
		}
		logger.debug('Using custom REST API:', process.env.DISCORD_REST_API)
	}

	logger.debug('Preparing Discord client with options:', clientOptions)

	// Initialize plugin state
	const pluginState: PluginState = {
		serverRestrictions: new Map(),
		config: pluginConfig ?? {}
	}
	setPluginState(pluginState)

	// Register plugin state with portal for controller access
	portal.registerPluginState('discordjs', pluginState)

	// Create the Discord client
	const client = new Client(clientOptions)
	setClient(client)

	// Non-dev: eagerly load all routes for fastest runtime
	// Note: @robojs/mock runs Robo in-process with Jest ESM. Eager handler imports can
	// trigger Jest VM module linking errors, so keep handlers lazy in mock mode.
	if (!Mode.isDev() && process.env.ROBO_MOCK_MODE !== 'true') {
		await eagerLoadHandlers()
	}

	// Register gateway event listeners
	clearEventListeners()
	syncEventListeners(client)

	// Register interaction handler for commands/autocomplete/context menus
	registerInteractionHandler(client)

	// Register prefix command handler if prefix commands exist
	registerPrefixCommandHandler(client, pluginConfig)

	logger.debug('Discord client prepared and ready for login')
}

/**
 * Eagerly load all handlers in production mode for fastest runtime access
 */
async function eagerLoadHandlers(): Promise<void> {
	// Load all route manifests
	await Promise.all([
		portal.ensureRoute('discordjs', 'commands'),
		portal.ensureRoute('discordjs', 'context'),
		portal.ensureRoute('discordjs', 'events'),
		portal.ensureRoute('discordjs', 'middleware'),
		portal.ensureRoute('discordjs', 'prefixCommands')
	])

	// Get all handler keys
	const commands = Object.keys(portal.getByType('discordjs:commands'))
	const contexts = Object.keys(portal.getByType('discordjs:context'))
	const events = Object.keys(portal.getByType('discordjs:events'))
	const middleware = Object.keys(portal.getByType('discordjs:middleware'))
	const prefixCommands = Object.keys(portal.getByType('discordjs:prefixCommands'))

	// Import all handlers in parallel
	await Promise.all([
		...commands.map((k) => portal.importHandler('discordjs', 'commands', k)),
		...contexts.map((k) => portal.importHandler('discordjs', 'context', k)),
		...events.map((k) => portal.importHandler('discordjs', 'events', k)),
		...middleware.map((k) => portal.importHandler('discordjs', 'middleware', k)),
		...prefixCommands.map((k) => portal.importHandler('discordjs', 'prefixCommands', k))
	])

	discordLogger.debug(
		`Pre-loaded ${commands.length} commands, ${contexts.length} context menus, ${events.length} events, ${middleware.length} middleware, ${prefixCommands.length} prefix commands`
	)
}

/**
 * Register the interaction handler for commands, autocomplete, and context menus
 */
function registerInteractionHandler(client: Client): void {
	if (interactionHandlerRegistered) {
		discordLogger.debug('Interaction handler already registered, skipping')
		return
	}
	interactionHandlerRegistered = true

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

/**
 * Register the messageCreate handler for prefix commands.
 * Only registers if prefix commands exist in the manifest.
 */
export function registerPrefixCommandHandler(client: Client, pluginConfig?: DiscordConfig): void {
	if (prefixHandlerRegistered) {
		discordLogger.debug('Prefix command handler already registered, skipping')
		return
	}

	// Check if prefix commands exist
	let hasPrefixCommands = false
	try {
		const summaries = Manifest.routeSummariesSync('discordjs', 'prefixCommands')
		hasPrefixCommands = summaries.length > 0
	} catch {
		// Route not in manifest — no prefix commands
	}

	if (!hasPrefixCommands) {
		discordLogger.debug('No prefix commands found, skipping prefix handler registration')
		return
	}

	prefixHandlerRegistered = true
	const prefixConfig = pluginConfig?.prefix

	client.on(Events.MessageCreate, async (message) => {
		// Ignore bots (configurable)
		const ignoreBots = prefixConfig?.ignoreBots ?? true
		if (ignoreBots && message.author.bot) return

		// Resolve the prefix
		let prefix: string | null = null
		const prefixValue = prefixConfig?.value ?? '!'

		if (typeof prefixValue === 'function') {
			prefix = await prefixValue(message.guild?.id ?? null)
		} else {
			prefix = prefixValue
		}

		// Check for bot mention as prefix
		const mentionAsPrefix = prefixConfig?.mentionAsPrefix ?? false
		let content = message.content

		if (mentionAsPrefix && client.user) {
			const mentionPattern = new RegExp(`^<@!?${client.user.id}>\\s*`)
			const mentionMatch = content.match(mentionPattern)
			if (mentionMatch) {
				content = content.slice(mentionMatch[0].length)
				// Proceed with command parsing (prefix matched via mention)
			} else if (prefix) {
				// Fall back to string prefix, respecting caseSensitive config
				const caseSensitive = prefixConfig?.caseSensitive ?? false
				if (caseSensitive) {
					if (!content.startsWith(prefix)) return
				} else {
					if (!content.toLowerCase().startsWith(prefix.toLowerCase())) return
				}
				content = content.slice(prefix.length)
			} else {
				return
			}
		} else if (prefix) {
			const caseSensitive = prefixConfig?.caseSensitive ?? false
			if (caseSensitive) {
				if (!content.startsWith(prefix)) return
			} else {
				if (!content.toLowerCase().startsWith(prefix.toLowerCase())) return
			}
			content = content.slice(prefix.length)
		} else {
			return
		}

		// Extract command name and args, supporting multi-word keys (subcommands)
		const trimmed = content.trim()
		if (!trimmed) return

		const caseSensitive = prefixConfig?.caseSensitive ?? false

		// Resolve command key (direct or alias), consuming tokens progressively
		// e.g., "admin ban @user reason" tries "admin ban" then "admin"
		await portal.ensureRoute('discordjs', 'prefixCommands')

		const tokens = trimmed.split(/\s+/)
		let commandKey: string | null = null
		let matchedTokenCount = 0

		// Try longest match first (up to 3 tokens per route config maxDepth)
		const maxTokens = Math.min(tokens.length, 3)
		for (let i = maxTokens; i >= 1; i--) {
			const candidate = tokens.slice(0, i).join(' ')
			const lookupName = caseSensitive ? candidate : candidate.toLowerCase()
			const resolved = resolveCommandKey(lookupName)
			if (resolved) {
				commandKey = resolved
				matchedTokenCount = i
				break
			}
		}

		if (!commandKey) return

		const commandName = tokens.slice(0, matchedTokenCount).join(' ')
		const rawArgs = tokens.slice(matchedTokenCount).join(' ')

		discordLogger.event(`Received prefix command: ${color.bold(prefix + commandName)}`)
		discordLogger.trace('Prefix command message:', message.content)

		await executePrefixCommandHandler(message, commandKey, rawArgs)
	})

	discordLogger.debug('Registered prefix command handler')
}
