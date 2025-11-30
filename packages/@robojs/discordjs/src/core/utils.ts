/**
 * Utility functions for Discord handlers
 *
 * Contains helper functions for Sage mode, deferrals, option extraction, and more.
 */
import { MessageFlags } from 'discord.js'
import { getPluginConfig } from './client.js'
import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	CommandInteraction,
	InteractionDeferReplyOptions,
	InteractionReplyOptions,
	Message
} from 'discord.js'
import type { CommandConfig, SageOptions } from '../types/index.js'

/**
 * Default Sage configuration
 */
export const DEFAULT_SAGE: SageOptions = {
	defer: true,
	deferBuffer: 250,
	ephemeral: false,
	errorReplies: true
}

/**
 * Timeout marker symbols
 */
export const BUFFER = Symbol('BUFFER')
export const TIMEOUT = Symbol('TIMEOUT')

// Check if MessageFlags.Ephemeral is available (Discord.js v14.14+)
const supportsEphemeralFlag = typeof MessageFlags !== 'undefined' && MessageFlags?.Ephemeral != null

/**
 * Add ephemeral flag to defer options
 */
export function withEphemeralDefer<T extends InteractionDeferReplyOptions>(opts: T, on = true): T {
	if (!on) return opts
	if (supportsEphemeralFlag) opts.flags = MessageFlags.Ephemeral
	else opts.ephemeral = true
	return opts
}

/**
 * Add ephemeral flag to reply options
 */
export function withEphemeralReply<T extends InteractionReplyOptions>(opts: T, on = true): T {
	if (!on) return opts
	if (supportsEphemeralFlag) opts.flags = MessageFlags.Ephemeral
	else opts.ephemeral = true
	return opts
}

/**
 * Get effective Sage options from command config and plugin config
 */
export function getSage(commandConfig?: CommandConfig): SageOptions {
	const pluginConfig = getPluginConfig()

	// Disable all sage options if commandConfig.sage is disabled or if it is undefined and config.sage is disabled
	if (commandConfig?.sage === false || (commandConfig?.sage === undefined && pluginConfig?.sage === false)) {
		return {
			defer: false,
			deferBuffer: 0,
			ephemeral: false,
			errorReplies: false
		}
	}

	return {
		...DEFAULT_SAGE,
		...(pluginConfig?.sage === false ? {} : commandConfig?.sage ?? pluginConfig?.sage ?? {})
	}
}

/**
 * Create a timeout promise that resolves after the specified duration
 */
export function timeout<T = void>(callback: () => T, ms: number): Promise<T> {
	return new Promise<T>((resolve) =>
		setTimeout(() => {
			resolve(callback())
		}, ms)
	)
}

/**
 * Extract command options from a Discord interaction
 */
export function extractCommandOptions(
	interaction: ChatInputCommandInteraction,
	commandOptions: CommandConfig['options']
): Record<string, unknown> {
	const options: Record<string, unknown> = {}

	commandOptions?.forEach((option) => {
		const type = option.type ?? 'string'

		if (type === 'attachment') {
			options[option.name] = interaction.options.getAttachment(option.name, option.required) ?? undefined
		} else if (type === 'boolean') {
			options[option.name] = interaction.options.getBoolean(option.name, option.required) ?? undefined
		} else if (type === 'channel') {
			options[option.name] = interaction.options.getChannel(option.name, option.required) ?? undefined
		} else if (type === 'integer') {
			options[option.name] = interaction.options.getInteger(option.name, option.required) ?? undefined
		} else if (type === 'member') {
			options[option.name] = interaction.options.getMember(option.name) ?? undefined
		} else if (type === 'mention') {
			options[option.name] = interaction.options.getMentionable(option.name, option.required) ?? undefined
		} else if (type === 'number') {
			options[option.name] = interaction.options.getNumber(option.name, option.required) ?? undefined
		} else if (type === 'role') {
			options[option.name] = interaction.options.getRole(option.name, option.required) ?? undefined
		} else if (type === 'string') {
			options[option.name] = interaction.options.getString(option.name, option.required) ?? undefined
		} else if (type === 'user') {
			options[option.name] = interaction.options.getUser(option.name, option.required) ?? undefined
		}
	})

	return options
}

/**
 * Patch deferReply to prevent failures due to multiple deferrals
 */
export function patchDeferReply(interaction: CommandInteraction): void {
	const originalDeferReply = interaction.deferReply.bind(interaction)
	let deferredPromise: Promise<void> | Promise<Message> | undefined
	let alreadyDeferredWithMessage = false

	// @ts-expect-error - Patch the deferReply method to prevent multiple deferrals
	interaction.deferReply = async function (
		this: CommandInteraction,
		options?: InteractionDeferReplyOptions
	): Promise<void | Message> {
		// If it's already been called, just return the stored promise
		if (deferredPromise) {
			// If user requests fetchReply this time but it wasn't fetched previously, just fetch it now.
			if (options?.fetchReply && !alreadyDeferredWithMessage) {
				return this.fetchReply()
			}

			return deferredPromise
		}

		// If not called yet:
		if (options?.fetchReply) {
			// @ts-expect-error - Defer and fetch the message right away
			deferredPromise = originalDeferReply(options)
			alreadyDeferredWithMessage = true
			return deferredPromise
		} else {
			// @ts-expect-error - Defer without fetching
			deferredPromise = originalDeferReply(options)
			return deferredPromise
		}
	}
}

/**
 * Get the command key from an interaction (including subcommands)
 */
export function getCommandKey(
	interaction: ChatInputCommandInteraction | AutocompleteInteraction | { commandName: string; options: { getSubcommandGroup?: () => string; getSubcommand?: () => string } }
): string {
	const commandKeys = [interaction.commandName]

	if (typeof interaction.options?.getSubcommandGroup === 'function') {
		try {
			const group = interaction.options.getSubcommandGroup()
			if (group) commandKeys.push(group)
		} catch {
			// Ignore - no subcommand group
		}
	}

	if (typeof interaction.options?.getSubcommand === 'function') {
		try {
			const subcommand = interaction.options.getSubcommand()
			if (subcommand) commandKeys.push(subcommand)
		} catch {
			// Ignore - no subcommand
		}
	}

	return commandKeys.filter(Boolean).join(' ')
}
