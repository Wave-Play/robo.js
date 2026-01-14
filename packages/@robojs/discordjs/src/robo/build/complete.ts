/**
 * Build complete hook for @robojs/discordjs
 *
 * Runs after manifest generation. Handles:
 * - Metadata aggregation for permissions, intents, scopes
 * - Command/context menu registration with Discord API (with hash-based caching)
 * - Intent inference and validation
 * - Discord build summary output
 */
import crypto from 'node:crypto'
import type { BuildCompleteContext, HandlerEntry, ProcessedEntry } from 'robo.js'
import { color, Env, Flashcore, Mode } from 'robo.js'
import { GatewayIntentBits, REST } from 'discord.js'
import { discordLogger } from '../../core/logger.js'
import { inferIntents, getIntentNames, REQUIRED_INTENTS } from '../../core/intents.js'
import {
	buildSlashCommands,
	buildContextCommands,
	registerCommandsToDiscord,
	FLASHCORE_KEY_COMMAND_HASH_PREFIX
} from '../../core/commands.js'
import type { DiscordConfig, DiscordjsAggregatedMetadata } from '../../types/index.js'

// Indigo color for context menus
const indigo = (text: string) => `\x1b[38;2;83;109;254m${text}\x1b[0m`

/**
 * Privileged intents that require special approval from Discord.
 */
const PRIVILEGED_INTENTS = new Set([
	GatewayIntentBits.GuildMembers,
	GatewayIntentBits.GuildPresences,
	GatewayIntentBits.MessageContent
])

/**
 * Reverse mapping from intent bits to their names.
 */
const intentBitToName = Object.fromEntries(
	Object.entries(GatewayIntentBits)
		.filter(([key]) => isNaN(Number(key)))
		.map(([key, value]) => [value, key])
) as Record<number, string>

/**
 * Recursively sorts object keys for deterministic JSON output.
 * Also converts BigInt values to strings since JSON.stringify cannot serialize BigInt.
 */
function sortObjectKeys(obj: unknown): unknown {
	if (obj === null || typeof obj !== 'object') {
		// Convert BigInt to string for JSON serialization
		if (typeof obj === 'bigint') {
			return obj.toString()
		}
		return obj
	}
	if (Array.isArray(obj)) {
		return obj.map(sortObjectKeys)
	}
	const sorted: Record<string, unknown> = {}
	for (const key of Object.keys(obj).sort()) {
		sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key])
	}
	return sorted
}

/**
 * Compute a hash of command data from manifest entries.
 * Includes credentials to ensure hash differs when switching bots.
 */
export function computeCommandHash(
	commandEntries: ProcessedEntry[],
	contextEntries: ProcessedEntry[],
	defaults: DiscordConfig['defaults'] | undefined,
	clientId: string,
	token: string,
	guildId: string | undefined
): string {
	const data = {
		clientId,
		token,
		guildId: guildId ?? null,
		defaults: defaults ?? {},
		commands: commandEntries.map((e) => ({ key: e.key, metadata: e.metadata })),
		context: contextEntries.map((e) => ({ key: e.key, metadata: e.metadata }))
	}

	// Sort keys recursively for deterministic output
	const hashInput = JSON.stringify(sortObjectKeys(data))

	return crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 16)
}

/**
 * Get the Flashcore key for storing command hash.
 */
function getCommandHashKey(guildId: string | undefined): string {
	const scope = guildId ? `guild:${guildId}` : 'global'
	return `${FLASHCORE_KEY_COMMAND_HASH_PREFIX}${scope}`
}

export default async function (context: BuildCompleteContext) {
	const { entries, mode, store, registerMetadataAggregator } = context
	const discordConfig = context.config as unknown as DiscordConfig | undefined
	const envData = Env.data() ?? {}

	// Register metadata aggregator for discordjs namespace
	registerMetadataAggregator<DiscordjsAggregatedMetadata>('discordjs', (handlerEntries, pluginDefaults) => {
		return aggregateDiscordMetadata(handlerEntries, pluginDefaults as DiscordConfig | undefined)
	})

	// Get command and context menu entries from the manifest
	const commandEntries = entries.get('discordjs', 'commands') ?? []
	const contextEntries = entries.get('discordjs', 'context') ?? []
	const eventEntries = entries.get('discordjs', 'events') ?? []

	discordLogger.debug(`Found ${commandEntries.length} commands, ${contextEntries.length} context menus, ${eventEntries.length} events`)

	// Print Discord build summary (skip in dev mode)
	if (!Mode.isDev()) {
		printDiscordSummary(commandEntries, contextEntries, eventEntries)
	}

	// Analyze and validate intents
	const eventNames = eventEntries.map((e: ProcessedEntry) => e.key)
	const inferredIntents = inferIntents(eventNames)

	if (inferredIntents.size > 0) {
		const intentNames = getIntentNames(inferredIntents)
		discordLogger.debug(`Inferred intents from events: ${intentNames.join(', ')}`)

		// Store inferred intents for runtime use
		store.set('discord:inferredIntents', Array.from(inferredIntents))
	}

	// Skip registration in mock mode - commands will be registered to mock server at runtime
	if (process.env.ROBO_MOCK_MODE === 'true') {
		discordLogger.debug('Mock mode - deferring registration to start hook')
		return
	}

	// Determine if we should register commands based on autoRegisterCommands config
	const autoRegister = discordConfig?.autoRegisterCommands
	let shouldRegister: boolean

	if (autoRegister === false) {
		// Explicitly disabled
		shouldRegister = false
	} else if (Array.isArray(autoRegister)) {
		// Only register in specified modes
		shouldRegister = autoRegister.includes(mode)
	} else {
		// Default: always register (true or undefined)
		shouldRegister = true
	}

	const hasToken = store.get<boolean>('discord:hasToken')
	const hasClientId = store.get<boolean>('discord:hasClientId')

	if (!shouldRegister) {
		discordLogger.debug(`Skipping command registration (autoRegisterCommands: ${JSON.stringify(autoRegister)}, mode: ${mode})`)
		return
	}

	if (!hasClientId || !hasToken) {
		discordLogger.warn('Cannot register commands: missing DISCORD_CLIENT_ID or DISCORD_TOKEN')
		return
	}

	// Get credentials
	// Fallback to process.env for tools like Doppler that inject directly
	const clientId = envData.DISCORD_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID
	const token = envData.DISCORD_TOKEN ?? process.env.DISCORD_TOKEN
	const guildId = envData.DISCORD_GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? discordConfig?.testServers?.[0]

	if (!clientId || !token) {
		discordLogger.warn('Cannot register commands: missing DISCORD_CLIENT_ID or DISCORD_TOKEN')
		return
	}
	const scope = guildId ? `guild ${guildId}` : 'global'

	// Compute hash from manifest data (includes credentials to detect bot changes)
	const currentHash = computeCommandHash(
		commandEntries,
		contextEntries,
		discordConfig?.defaults,
		clientId,
		token,
		guildId
	)
	discordLogger.debug(`Command hash: ${currentHash} (scope: ${scope})`)

	// Ensure Flashcore is initialized for build-time use
	// (normally initialized at runtime, but we need it during build for caching)
	try {
		await Flashcore.$init({})
	} catch {
		// Already initialized or failed - continue anyway
	}

	// Check cached hash to skip registration if unchanged
	const hashKey = getCommandHashKey(guildId)
	const cachedHash = await Flashcore.get<string>(hashKey)

	// Allow forcing re-registration via CLI flag (--force) or environment variable
	const forceRegister = process.env.DISCORD_FORCE_REGISTER === 'true'

	if (cachedHash === currentHash && !forceRegister) {
		discordLogger.debug('Cached hash matches, skipping registration')
		return
	}

	if (forceRegister) {
		discordLogger.info('Force registration requested via --force flag')
	}

	// Hash differs or no cached hash - need to register
	const reason = cachedHash ? 'Commands changed' : 'No cached commands'
	discordLogger.info(`${reason}, registering with Discord...`)

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
			// Still store hash so subsequent builds with no commands hit cache
			await Flashcore.set(hashKey, currentHash)
			return
		}

		// Register with Discord API
		const rest = new REST({ version: '10' }).setToken(token)
		await registerCommandsToDiscord(rest, clientId, guildId, commandData, false)

		discordLogger.info(`Registered ${commandData.length} ${scope} commands`)

		// Store hash after successful registration
		await Flashcore.set(hashKey, currentHash)
		discordLogger.debug(`Stored command hash: ${currentHash}`)
	} catch (error) {
		// Don't store hash on failure - retry on next build
		discordLogger.error('Failed to register Discord commands:', error)
	}
}

/**
 * Print a Discord-specific build summary showing commands, context menus, and events.
 */
function printDiscordSummary(
	commandEntries: ProcessedEntry[],
	contextEntries: ProcessedEntry[],
	eventEntries: ProcessedEntry[]
) {
	// Skip if there's nothing to show
	if (commandEntries.length === 0 && contextEntries.length === 0 && eventEntries.length === 0) {
		return
	}

	// Calculate max lengths for formatting
	const allKeys = [
		...commandEntries.map((c) => '/' + c.key),
		...contextEntries.map((c) => c.key),
		...eventEntries.map((e) => e.key)
	]
	const maxLength = Math.min(Math.max(...allKeys.map((k) => k.length), 15), 30)
	const maxTypeNameLength = Math.max(
		...['Command', 'Subcommand', 'Subcommand Group', 'Context', 'Event'].map((type) => type.length)
	)

	const headerType = 'Type'
	const headerName = 'Name'
	const headerDescription = 'Description'

	// +4 to account for autoSymbol spacing, +1 for a space between type and name
	const headerTypeSpacing = ' '.repeat(maxTypeNameLength - headerType.length + 4)
	const headerNameSpacing = ' '.repeat(maxLength - headerName.length + 1)

	let summary = color.bold(`\n${headerType}${headerTypeSpacing}${headerName}${headerNameSpacing}${headerDescription}`)
	summary += '\n' + `─`.repeat(maxLength + maxTypeNameLength + headerDescription.length + 5)

	let autoGeneratedExists = false

	// Log commands
	for (const entry of commandEntries) {
		const isAuto = entry.metadata?.auto === true
		const autoSymbol = isAuto ? '  Δ ' : '    '
		if (isAuto) autoGeneratedExists = true

		// Determine type based on key structure (space-separated for subcommands)
		const keyParts = entry.key.split(' ')
		let type = 'Command'
		if (keyParts.length === 2) type = 'Subcommand'
		if (keyParts.length >= 3) type = 'Subcommand Group'

		const typeSpacing = ' '.repeat(maxTypeNameLength - type.length + 1)
		const description = (entry.metadata?.description as string) ?? ''

		summary +=
			'\n' +
			color.bold(color.blue(type + typeSpacing + autoSymbol)) +
			`${color.bold(('/' + entry.key).padEnd(maxLength + 1))} ${description}`
	}

	// Log context menus
	for (const entry of contextEntries) {
		const isAuto = entry.metadata?.auto === true
		const autoSymbol = isAuto ? '  Δ ' : '    '
		if (isAuto) autoGeneratedExists = true

		const type = 'Context'
		const typeSpacing = ' '.repeat(maxTypeNameLength - type.length + 1)

		summary +=
			'\n' + color.bold(indigo(type + typeSpacing + autoSymbol)) + color.bold(entry.key.padEnd(maxLength + 1))
	}

	// Log events
	for (const entry of eventEntries) {
		const isAuto = entry.metadata?.auto === true
		const autoSymbol = isAuto ? '  Δ ' : '    '
		if (isAuto) autoGeneratedExists = true

		const type = 'Event'
		const typeSpacing = ' '.repeat(maxTypeNameLength - type.length + 1)

		summary +=
			'\n' + color.bold(color.magenta(type + typeSpacing + autoSymbol)) + `${color.bold(entry.key).padEnd(maxLength + 1)}`
	}

	if (autoGeneratedExists) {
		summary += '\n' + color.cyan(`\n${color.bold('Δ')} = Automatically generated`)
	}

	discordLogger.log(summary)
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

/**
 * Aggregate Discord metadata from all handler entries.
 * Creates the structure for metadata/discordjs.json per the architecture spec.
 */
function aggregateDiscordMetadata(
	entries: HandlerEntry[],
	pluginDefaults?: DiscordConfig
): DiscordjsAggregatedMetadata {
	const intents = new Set<number>()
	const permissions = new Set<string>()
	const scopes = new Set<string>(['bot', 'applications.commands'])

	const intentsByHandler: Record<string, string[]> = {}
	const permissionsByHandler: Record<string, string[]> = {}
	const intentsBySource: Record<string, { inferred: string[]; explicit: string[] }> = {}
	const permissionsBySource: Record<string, string[]> = {}
	const scopesBySource: Record<string, string[]> = {}
	const commandsBySource: Record<string, number> = {}
	const contextMenusBySource: Record<string, number> = {}

	// Track sources
	const sources = new Set<string>()

	for (const entry of entries) {
		const source = entry.plugin ?? 'project'
		sources.add(source)

		// Initialize source tracking
		if (!intentsBySource[source]) {
			intentsBySource[source] = { inferred: [], explicit: [] }
		}
		if (!permissionsBySource[source]) {
			permissionsBySource[source] = []
		}
		if (!scopesBySource[source]) {
			scopesBySource[source] = []
		}
		if (!commandsBySource[source]) {
			commandsBySource[source] = 0
		}
		if (!contextMenusBySource[source]) {
			contextMenusBySource[source] = 0
		}

		// Count commands and context menus
		const routeType = entry.path?.includes('/commands/') ? 'commands' : entry.path?.includes('/context/') ? 'context' : null
		if (routeType === 'commands') {
			commandsBySource[source]++
		} else if (routeType === 'context') {
			contextMenusBySource[source]++
		}

		// Extract permissions from defaultMemberPermissions
		const metadata = entry.metadata as Record<string, unknown>
		if (metadata?.defaultMemberPermissions) {
			const perms = parsePermissions(metadata.defaultMemberPermissions)
			perms.forEach((p) => {
				permissions.add(p)
				permissionsBySource[source].push(p)
				if (!permissionsByHandler[p]) {
					permissionsByHandler[p] = []
				}
				permissionsByHandler[p].push(entry.path)
			})
		}

		// Infer intents from event handlers
		if (entry.path?.includes('/events/')) {
			const eventName = entry.key
			const requiredBits = REQUIRED_INTENTS[eventName]
			if (requiredBits) {
				const bits = Array.isArray(requiredBits) ? requiredBits : [requiredBits]
				bits.forEach((bit) => {
					intents.add(bit)
					const intentName = intentBitToName[bit]
					if (intentName) {
						intentsBySource[source].inferred.push(intentName)
						if (!intentsByHandler[intentName]) {
							intentsByHandler[intentName] = []
						}
						intentsByHandler[intentName].push(entry.path)
					}
				})
			}
		}
	}

	// Add explicit intents from plugin config (intents are in clientOptions)
	const configuredIntents = pluginDefaults?.clientOptions?.intents
	if (configuredIntents) {
		// Discord.js intents can be a number (bitfield), array, or GatewayIntentBits enum values
		const intentValues: number[] = []

		if (typeof configuredIntents === 'number') {
			// Single bitfield value - extract individual intent bits
			for (const [name, bit] of Object.entries(GatewayIntentBits)) {
				if (!isNaN(Number(name))) continue // Skip numeric keys
				if ((configuredIntents & (bit as number)) === bit) {
					intentValues.push(bit as number)
				}
			}
		} else if (Array.isArray(configuredIntents)) {
			for (const intent of configuredIntents) {
				if (typeof intent === 'number') {
					intentValues.push(intent)
				} else if (typeof intent === 'string' && intent in GatewayIntentBits) {
					intentValues.push(GatewayIntentBits[intent as keyof typeof GatewayIntentBits] as number)
				}
			}
		}

		intentValues.forEach((bit) => {
			intents.add(bit)
			const intentName = intentBitToName[bit]
			if (intentName) {
				const pluginSource = '@robojs/discordjs'
				if (!intentsBySource[pluginSource]) {
					intentsBySource[pluginSource] = { inferred: [], explicit: [] }
				}
				intentsBySource[pluginSource].explicit.push(intentName)
			}
		})
	}

	// Convert intent bits to names for output
	const intentNames = Array.from(intents).map((bit) => intentBitToName[bit]).filter(Boolean)
	const requiredIntents = intentNames.filter((name) => {
		const bit = Object.entries(intentBitToName).find(([, n]) => n === name)?.[0]
		return bit && PRIVILEGED_INTENTS.has(Number(bit))
	})
	const optionalIntents = intentNames.filter((name) => !requiredIntents.includes(name))

	return {
		namespace: 'discordjs',
		sources: Array.from(sources),
		intents: {
			required: requiredIntents,
			optional: optionalIntents,
			bySource: intentsBySource,
			byHandler: intentsByHandler
		},
		permissions: {
			bot: Array.from(permissions),
			bySource: permissionsBySource,
			byHandler: permissionsByHandler
		},
		scopes: {
			required: Array.from(scopes),
			optional: [],
			bySource: scopesBySource
		},
		registration: {
			commands: {
				total: Object.values(commandsBySource).reduce((a, b) => a + b, 0),
				bySource: commandsBySource
			},
			contextMenus: {
				total: Object.values(contextMenusBySource).reduce((a, b) => a + b, 0),
				bySource: contextMenusBySource
			}
		}
	}
}

/**
 * Parse permissions from various formats (string, number, bigint).
 */
function parsePermissions(value: unknown): string[] {
	if (typeof value === 'string') {
		// Could be a single permission name or comma-separated
		return value.split(',').map((s) => s.trim()).filter(Boolean)
	}
	if (typeof value === 'number' || typeof value === 'bigint') {
		// Permission bitfield - would need Discord.js PermissionFlagsBits mapping
		// For now, return empty as parsing bitfields is complex
		return []
	}
	if (Array.isArray(value)) {
		return value.filter((v) => typeof v === 'string')
	}
	return []
}
