/**
 * Prefix Command Handler
 *
 * Executes prefix command handlers with argument parsing, cooldowns,
 * permissions, and Sage mode support (typing indicator).
 */
import { portal, color, Mode } from 'robo.js'
import { discordLogger } from '../logger.js'
import { getPluginState } from '../client.js'
import { executeMiddleware, getHandlerPath } from '../middleware.js'
import { TIMEOUT, timeout } from '../utils.js'
import type { Message, MessageReplyOptions, PermissionResolvable } from 'discord.js'
import type { HandlerModule } from '../handler-types.js'
import type { PrefixCommandArgs, PrefixCommandConfig, PrefixSageOptions } from '../../types/prefix-commands.js'

/**
 * In-memory cooldown tracker.
 * Key: "guildId:userId:commandKey", Value: expiry timestamp
 */
const cooldowns = new Map<string, number>()

/**
 * Lazily-built alias → command key index.
 * Invalidated on HMR.
 */
let aliasIndex: Map<string, string> | null = null

/**
 * Lazily-built lowercase key → canonical key index.
 * Used for case-insensitive command resolution.
 */
let lowercaseKeyIndex: Map<string, string> | null = null

/**
 * Periodic cleanup interval for expired cooldowns.
 */
let cooldownCleanupInterval: ReturnType<typeof setInterval> | null = null

/**
 * Start periodic cooldown cleanup (every 5 minutes).
 * Uses .unref() so it doesn't keep the process alive.
 */
function startCooldownCleanup(): void {
	if (cooldownCleanupInterval) return
	cooldownCleanupInterval = setInterval(() => {
		const now = Date.now()
		for (const [key, expiry] of cooldowns) {
			if (now >= expiry) {
				cooldowns.delete(key)
			}
		}
	}, 5 * 60 * 1000)
	cooldownCleanupInterval.unref()
}

/**
 * Stop periodic cooldown cleanup.
 */
function stopCooldownCleanup(): void {
	if (cooldownCleanupInterval) {
		clearInterval(cooldownCleanupInterval)
		cooldownCleanupInterval = null
	}
}

/**
 * Invalidate the alias index (called on HMR).
 */
export function invalidateAliasIndex(): void {
	aliasIndex = null
	lowercaseKeyIndex = null
	stopCooldownCleanup()
	cooldowns.clear()
}

/**
 * Build alias index from manifest metadata.
 */
function ensureAliasIndex(): Map<string, string> {
	if (aliasIndex) return aliasIndex

	aliasIndex = new Map()
	lowercaseKeyIndex = new Map()
	try {
		const summaries = portal.getByType('discordjs:prefixCommands')
		for (const [key, recordOrArray] of Object.entries(summaries)) {
			// Build lowercase key → canonical key mapping
			lowercaseKeyIndex.set(key.toLowerCase(), key)

			const record = Array.isArray(recordOrArray) ? recordOrArray[0] : recordOrArray
			const aliases = record?.metadata?.aliases as string[] | undefined
			if (aliases) {
				for (const alias of aliases) {
					aliasIndex.set(alias.toLowerCase(), key)
				}
			}
		}
	} catch {
		// Route not loaded yet — return empty index
	}

	return aliasIndex
}

/**
 * Resolve a command name (or alias) to the canonical command key.
 * The caller is responsible for applying case normalization before calling this.
 */
export function resolveCommandKey(name: string): string | null {
	// Direct lookup (exact case match)
	const record = portal.getRecord('discordjs', 'prefixCommands', name)
	if (record) return name

	// Build indexes if needed
	const index = ensureAliasIndex()

	// Case-insensitive key lookup (e.g., "ping" matches key "Ping")
	const canonicalKey = lowercaseKeyIndex?.get(name.toLowerCase())
	if (canonicalKey) return canonicalKey

	// Alias lookup (index is always lowercase)
	return index.get(name.toLowerCase()) ?? null
}

/**
 * Split a raw argument string into tokens, respecting quoted strings.
 * Unclosed quotes are treated as literal characters — the remaining
 * content is split normally rather than merged into one token.
 */
export function splitArgs(input: string): string[] {
	const args: string[] = []
	let current = ''
	let inQuote: '"' | "'" | null = null
	let quoteStart = -1

	for (let i = 0; i < input.length; i++) {
		const char = input[i]

		if (inQuote) {
			if (char === inQuote) {
				inQuote = null
			} else {
				current += char
			}
		} else if (char === '"' || char === "'") {
			inQuote = char
			quoteStart = i
		} else if (char === ' ') {
			if (current.length > 0) {
				args.push(current)
				current = ''
			}
		} else {
			current += char
		}
	}

	// If a quote was never closed, re-parse from the opening quote as literal text
	if (inQuote !== null) {
		// Push whatever was accumulated before the unclosed quote
		// Then re-split the remainder as plain text
		const beforeQuote = input.slice(0, quoteStart)
		const fromQuote = input.slice(quoteStart)

		const beforeArgs = beforeQuote.trim() ? beforeQuote.trim().split(/\s+/) : []
		// Include the quote character itself in the re-split
		const afterArgs = fromQuote.split(/\s+/).filter(Boolean)

		return [...beforeArgs, ...afterArgs]
	}

	if (current.length > 0) {
		args.push(current)
	}

	return args
}

/**
 * Parse raw args into named params based on config.args definitions.
 */
function parseArgs(raw: string[], argDefs: PrefixCommandConfig['args']): Record<string, string | undefined> {
	const params: Record<string, string | undefined> = {}

	if (!argDefs) return params

	for (let i = 0; i < argDefs.length; i++) {
		params[argDefs[i].name] = raw[i]
	}

	return params
}

/**
 * Get effective sage options for a prefix command.
 */
function getPrefixSage(commandConfig?: PrefixCommandConfig): PrefixSageOptions {
	if (commandConfig?.sage === false) {
		return { typing: false, errorReplies: false }
	}

	const sage = typeof commandConfig?.sage === 'object' ? commandConfig.sage : {}

	return {
		typing: sage.typing ?? false,
		errorReplies: sage.errorReplies ?? true
	}
}

/**
 * Execute a prefix command handler.
 *
 * @param message - The Discord message
 * @param commandKey - The resolved command key (e.g., "ping" or "admin ban")
 * @param rawContent - Raw string after the command name
 */
export async function executePrefixCommandHandler(
	message: Message,
	commandKey: string,
	rawContent: string
): Promise<void> {
	await portal.ensureRoute('discordjs', 'prefixCommands')

	// Find command handler
	const command = portal.getRecord('discordjs', 'prefixCommands', commandKey)
	if (!command) {
		discordLogger.error(`No prefix command matching "${commandKey}" was found.`)
		return
	}

	// Check if the command's module is enabled
	if (command.module && !portal.module(command.module).isEnabled()) {
		discordLogger.debug(`Tried to execute disabled prefix command from module: ${color.bold(command.module)}`)
		return
	}

	if (!command.enabled || command.metadata?.disabled === true) {
		discordLogger.debug(`Tried to execute disabled prefix command: ${color.bold(commandKey)}`)
		return
	}

	// Check server restrictions
	const serverOnly =
		(command.metadata?.serverOnly as string[] | string | undefined) ??
		getPluginState()?.serverRestrictions.get(`prefixCommand:${commandKey}`)
	if (serverOnly) {
		const allowedServers = Array.isArray(serverOnly) ? serverOnly : [serverOnly]
		const guildId = message.guild?.id
		if (!guildId || !allowedServers.includes(guildId)) {
			discordLogger.debug(`Prefix command "${commandKey}" is restricted to specific servers`)
			return
		}
	}

	// Check DM permission
	const dmPermission = (command.metadata?.dmPermission as boolean) ?? true
	if (!message.guild && !dmPermission) {
		discordLogger.debug(`Prefix command "${commandKey}" is not allowed in DMs`)
		return
	}

	// Check required permissions
	const requiredPermissions = command.metadata?.requiredPermissions as string | string[] | undefined
	if (requiredPermissions && message.member) {
		const perms = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions]
		const missing = perms.filter((p) => !message.member!.permissions.has(p as PermissionResolvable))
		if (missing.length > 0) {
			discordLogger.debug(`User missing permissions for "${commandKey}": ${missing.join(', ')}`)
			try {
				await message.reply(`You need the following permissions: ${missing.join(', ')}`)
			} catch {
				// Failed to reply
			}
			return
		}
	}

	// Execute middleware
	const shouldContinue = await executeMiddleware([message], command)
	if (!shouldContinue) {
		discordLogger.debug(`Middleware aborted prefix command: ${color.bold(commandKey)}`)
		return
	}

	// Import handler if needed
	if (!command.handler) {
		await portal.importHandler('discordjs', 'prefixCommands', commandKey)
	}

	const cmdHandler = command.handler as HandlerModule<
		(message: Message, args: PrefixCommandArgs) => unknown,
		PrefixCommandConfig
	> | null
	const commandConfig = cmdHandler?.config as PrefixCommandConfig | undefined
	const sage = getPrefixSage(commandConfig)

	// Check cooldown
	const cooldownMs = (command.metadata?.cooldown as number | undefined) ?? commandConfig?.cooldown
	let cooldownKey: string | undefined
	if (cooldownMs) {
		cooldownKey = `${message.guild?.id ?? 'dm'}:${message.author.id}:${commandKey}`
		const expiry = cooldowns.get(cooldownKey)

		if (expiry && Date.now() < expiry) {
			const remaining = Math.ceil((expiry - Date.now()) / 1000)
			discordLogger.debug(`Cooldown active for "${commandKey}": ${remaining}s remaining`)
			try {
				await message.reply(`Please wait ${remaining}s before using this command again.`)
			} catch {
				// Failed to reply
			}
			return
		} else if (expiry) {
			// Clean up expired entry
			cooldowns.delete(cooldownKey)
		}
	}

	try {
		discordLogger.debug(`Executing prefix command handler: ${color.bold(getHandlerPath(command))}`)
		if (!cmdHandler?.default) {
			throw new Error(`Missing default export function for prefix command: ${color.bold(commandKey)}`)
		}

		// Parse arguments
		const raw = splitArgs(rawContent)
		const argDefs = commandConfig?.args ?? (command.metadata?.args as PrefixCommandConfig['args'])
		const params = parseArgs(raw, argDefs)
		const args: PrefixCommandArgs = { raw, params, content: rawContent }

		// Validate required arguments
		if (argDefs) {
			const missingArgs = argDefs.filter((arg) => arg.required && params[arg.name] === undefined)
			if (missingArgs.length > 0) {
				const missingNames = missingArgs.map((a) => a.name).join(', ')
				const usage = argDefs.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(' ')
				try {
					await message.reply(`Missing required argument(s): ${missingNames}\nUsage: \`${commandKey} ${usage}\``)
				} catch {
					// Failed to reply
				}
				return
			}
		}

		// Show typing indicator before invoking handler
		if (sage.typing && 'sendTyping' in message.channel) {
			try {
				message.channel.sendTyping().catch(() => {})
			} catch {
				// Failed to send typing
			}
		}

		// Invoke handler
		const result = cmdHandler.default(message, args)

		// Enforce timeout for async handlers
		let response: unknown
		if (result instanceof Promise) {
			const timeoutMs = commandConfig?.timeout
			if (timeoutMs) {
				response = await Promise.race([result, timeout(() => TIMEOUT, timeoutMs)])
				if (response === TIMEOUT) {
					throw new Error('Prefix command timed out')
				}
			} else {
				response = await result
			}
		} else {
			response = result
		}

		// Stop here if command returned nothing
		if (response === undefined) {
			discordLogger.debug('Prefix command returned void, skipping response')
		} else {
			// Reply with result
			const reply = typeof response === 'string' ? { content: response } : (response as MessageReplyOptions)
			await message.reply(reply)
		}

		// Apply cooldown after successful execution
		if (cooldownMs && cooldownKey) {
			cooldowns.set(cooldownKey, Date.now() + cooldownMs)
			startCooldownCleanup()
		}
	} catch (error) {
		discordLogger.error(error)
		await printErrorResponse(error, message, sage)
	}
}

/**
 * Print error response to Discord (development mode only).
 */
async function printErrorResponse(
	error: unknown,
	message: Message,
	sage: PrefixSageOptions
): Promise<void> {
	if (!Mode.isDev() || !sage.errorReplies) {
		return
	}

	try {
		const errorMessage = error instanceof Error ? error.message : String(error)
		await message.reply(`An error occurred: ${errorMessage}`)
	} catch (replyError) {
		discordLogger.debug('Error printing error response:', replyError)
	}
}
