/**
 * Common types shared across Discord plugin components.
 */
import type { ClientOptions } from 'discord.js'

/**
 * Base configuration shared by all handler types.
 */
export interface BaseConfig {
	/** Internal: auto-generated handler marker */
	__auto?: true
	/** Internal: module name */
	__module?: string
	/** Internal: file path */
	__path?: string
	/** Internal: plugin info */
	__plugin?: {
		name: string
		path: string
	}
	/** Handler description */
	description?: string
	/** Whether the handler is disabled */
	disabled?: boolean
	/** Restrict to specific server IDs */
	serverOnly?: string[] | string
	/** Execution timeout in milliseconds */
	timeout?: number
}

/**
 * Sage (auto-defer/reply) options for commands and context menus.
 */
export interface SageOptions {
	/** Whether to automatically defer the interaction */
	defer?: boolean
	/** Time in ms to wait before deferring (allows fast replies without defer) */
	deferBuffer?: number
	/** Whether deferred/replied messages should be ephemeral */
	ephemeral?: boolean
	/** Whether to show error replies to users */
	errorReplies?: boolean
}

/**
 * Default command/context menu configuration.
 */
export interface CommandDefaults {
	/** Default interaction contexts for commands */
	contexts?: ('Guild' | 'BotDM' | 'PrivateChannel')[]
	/** Default integration types for commands */
	integrationTypes?: ('GuildInstall' | 'UserInstall')[]
	/** Default member permissions required for commands */
	defaultMemberPermissions?: string | number | bigint
}

/**
 * Timeout configuration for various operations.
 */
export interface TimeoutConfig {
	/** Autocomplete response timeout in milliseconds (default: 3000) */
	autocomplete?: number
	/** Time before auto-deferring commands in milliseconds (default: 250, set via sage.deferBuffer) */
	commandDeferral?: number
	/** Command registration timeout in milliseconds (default: 30000) */
	commandRegistration?: number
}

/**
 * Discord plugin configuration.
 */
export interface DiscordConfig {
	/**
	 * Whether to automatically register commands with Discord API during builds.
	 * - `true` (default): Always register commands
	 * - `false`: Never register commands
	 * - `string[]`: Only register in specified modes (e.g., ['production'], ['development', 'production'])
	 */
	autoRegisterCommands?: boolean | string[]
	/** Discord.js Client options */
	clientOptions?: ClientOptions
	/** Default configuration for commands and context menus */
	defaults?: CommandDefaults
	/** Prefix command configuration */
	prefix?: PrefixConfig
	/** Sage (auto-defer/reply) configuration. Set to false to disable. */
	sage?: false | SageOptions
	/** Server IDs to use as test servers for command registration */
	testServers?: string[]
	/** Timeout configuration for various operations */
	timeouts?: TimeoutConfig
}

/**
 * Prefix command configuration.
 */
export interface PrefixConfig {
	/** Prefix string or async function returning prefix per guild (default: '!') */
	value?: string | ((guildId: string | null) => string | Promise<string>)
	/** Whether command matching is case-sensitive (default: false) */
	caseSensitive?: boolean
	/** Whether to ignore messages from bots (default: true) */
	ignoreBots?: boolean
	/** Whether bot mentions can be used as prefix (default: false) */
	mentionAsPrefix?: boolean
}

/**
 * Plugin state interface for internal storage.
 */
export interface PluginState {
	/** Server restrictions by handler key */
	serverRestrictions: Map<string, string[]>
	/** Plugin configuration */
	config: DiscordConfig
}
