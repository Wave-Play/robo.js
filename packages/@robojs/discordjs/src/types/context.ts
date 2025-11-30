/**
 * Discord context menu types for @robojs/discordjs
 */
import type {
	ContextMenuCommandInteraction,
	Message,
	MessageContextMenuCommandInteraction,
	User,
	UserContextMenuCommandInteraction
} from 'discord.js'
import type { SageOptions, BaseConfig } from './common.js'
import type { CommandContext, CommandIntegrationType } from './commands.js'

/**
 * Context menu handler function type (user context).
 */
export type UserContextHandler = (
	interaction: UserContextMenuCommandInteraction,
	user: User
) => unknown | Promise<unknown>

/**
 * Context menu handler function type (message context).
 */
export type MessageContextHandler = (
	interaction: MessageContextMenuCommandInteraction,
	message: Message
) => unknown | Promise<unknown>

/**
 * Generic context handler (either user or message).
 */
export type ContextHandler = (
	interaction: ContextMenuCommandInteraction,
	target: User | Message
) => unknown | Promise<unknown>

/**
 * Context menu module structure expected in handler files.
 */
export interface Context {
	config?: ContextConfig
	default: ContextHandler
}

/**
 * Context menu configuration options.
 */
export interface ContextConfig extends BaseConfig {
	/** Interaction contexts where the command is available */
	contexts?: CommandContext[]
	/** Default member permissions required to use the command */
	defaultMemberPermissions?: string | number | bigint
	/** @deprecated Use `contexts` instead */
	dmPermission?: boolean
	/** Installation contexts for the command */
	integrationTypes?: CommandIntegrationType[]
	/** Name localizations by locale code */
	nameLocalizations?: Record<string, string>
	/** Sage (auto-defer/reply) configuration */
	sage?: false | SageOptions
	/** Execution timeout in milliseconds */
	timeout?: number
}

/**
 * Context menu entry in manifest.
 */
export type ContextEntry = ContextConfig

/**
 * Context menu controller for portal.discord.context()
 */
export interface ContextController {
	/** Check if context menu is enabled */
	isEnabled(): boolean
	/** Enable or disable the context menu */
	setEnabled(value: boolean): void
	/** Restrict context menu to specific servers */
	setServerOnly(serverIds: string | string[]): void
	/** Check if context menu is enabled for a specific server */
	isEnabledForServer(serverId: string): boolean
	/** Get context menu metadata */
	getMetadata(): Record<string, unknown>
}

/**
 * Discord ApplicationCommandType values for context menus.
 */
export const ContextType = {
	User: 2,
	Message: 3
} as const

export type ContextTypeValue = (typeof ContextType)[keyof typeof ContextType]

/**
 * Namespace controller for portal.discord.context
 * Provides access to all context menus.
 */
export interface ContextNamespaceController {
	/** Get a specific context menu handler by name */
	get(name: string): Promise<ContextHandler | null>
	/** Get all context menu keys */
	list(): string[]
}
