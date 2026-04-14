/**
 * Prefix command types for @robojs/discordjs
 */
import type { Message, MessageReplyOptions } from 'discord.js'
import type { BaseConfig } from './common.js'

/**
 * Parsed arguments passed to prefix command handlers.
 */
export interface PrefixCommandArgs {
	/** Space-split args (respects quoted strings) */
	raw: string[]
	/** Named params mapped from config.args */
	params: Record<string, string | undefined>
	/** Full raw string after the command name */
	content: string
}

/**
 * Prefix command handler function type.
 */
export type PrefixCommandHandler = (
	message: Message,
	args: PrefixCommandArgs
) => PrefixCommandResult | Promise<PrefixCommandResult>

/**
 * Prefix command result type (what can be returned from a handler).
 */
export type PrefixCommandResult = string | MessageReplyOptions | void

/**
 * Prefix command module structure expected in handler files.
 */
export interface PrefixCommand {
	config?: PrefixCommandConfig
	default: PrefixCommandHandler
}

/**
 * Prefix command configuration options.
 */
export interface PrefixCommandConfig extends BaseConfig {
	/** Named argument definitions */
	args?: readonly PrefixCommandArg[]
	/** Aliases for the command (e.g., ['p'] for ping) */
	aliases?: string[]
	/** Cooldown in milliseconds */
	cooldown?: number
	/** Whether the command can be used in DMs (default: true) */
	dmPermission?: boolean
	/** Required permissions checked via message.member.permissions */
	requiredPermissions?: string | string[]
	/** Sage options for prefix commands */
	sage?: false | PrefixSageOptions
}

/**
 * Named argument definition.
 */
export interface PrefixCommandArg {
	name: string
	description?: string
	required?: boolean
}

/**
 * Sage options specific to prefix commands.
 */
export interface PrefixSageOptions {
	/** Show typing indicator for async handlers */
	typing?: boolean
	/** Show error replies in dev mode (default: true) */
	errorReplies?: boolean
}

/**
 * Controller for individual prefix commands via portal.discordjs.prefixCommand()
 */
export interface PrefixCommandController {
	/** Check if prefix command is enabled */
	isEnabled(): boolean
	/** Enable or disable the prefix command */
	setEnabled(value: boolean): void
	/** Restrict prefix command to specific servers */
	setServerOnly(serverIds: string | string[]): void
	/** Check if prefix command is enabled for a specific server */
	isEnabledForServer(serverId: string): boolean
	/** Get prefix command metadata */
	getMetadata(): Record<string, unknown>
}

/**
 * Namespace controller for portal.discordjs.prefixCommands
 * Provides access to all prefix commands and execution utilities.
 */
export interface PrefixCommandsNamespaceController {
	/** Get a specific prefix command handler by name */
	get(name: string): Promise<PrefixCommandHandler | null>
	/** Get all prefix command keys */
	list(): string[]
	/** Execute a prefix command programmatically */
	execute(name: string, message: Message, args?: string[]): Promise<void>
}
