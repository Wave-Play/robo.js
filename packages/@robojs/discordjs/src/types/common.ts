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
	/** Channel ID to send error messages to */
	errorChannelId?: string
	/** Custom error message to show users */
	errorMessage?: string
	/** Whether to show error replies to users */
	errorReplies?: boolean
}

/**
 * Discord plugin configuration.
 */
export interface DiscordConfig {
	/** Discord.js Client options */
	clientOptions?: ClientOptions
	/** Sage (auto-defer/reply) configuration. Set to false to disable. */
	sage?: false | SageOptions
	/** Whether to register commands in development mode */
	registerOnDev?: boolean
	/** Server IDs to use as test servers for command registration */
	testServers?: string[]
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
