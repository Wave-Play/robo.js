/**
 * @robojs/discordjs - Discord.js integration plugin for Robo.js
 *
 * This plugin provides Discord.js integration including:
 * - Slash commands via /src/commands/
 * - Context menus via /src/context/
 * - Gateway events via /src/events/
 * - Middleware via /src/middleware/
 *
 * @example
 * ```ts
 * // config/plugins/discordjs.ts
 * import type { DiscordConfig } from '@robojs/discordjs'
 *
 * export default {
 *   clientOptions: {
 *     intents: ['Guilds', 'GuildMessages']
 *   }
 * } satisfies DiscordConfig
 * ```
 */

// Re-export commonly used Discord.js types
export type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	Client,
	ClientEvents,
	ClientOptions,
	ContextMenuCommandInteraction,
	Guild,
	GuildMember,
	Interaction,
	Message,
	MessageContextMenuCommandInteraction,
	Role,
	TextChannel,
	User,
	UserContextMenuCommandInteraction,
	VoiceChannel
} from 'discord.js'

// Export plugin types
export type {
	// Common
	BaseConfig,
	CommandDefaults,
	DiscordConfig,
	PluginState,
	SageOptions,
	TimeoutConfig,
	// Commands
	AutocompleteHandler,
	Command,
	CommandConfig,
	CommandContext,
	CommandController,
	CommandEntry,
	CommandHandler,
	CommandIntegrationType,
	CommandOption,
	CommandOptionTypes,
	CommandOptions,
	CommandResult,
	CommandsNamespaceController,
	SmartCommandConfig,
	// Type helpers
	BaseValueOfOption,
	ChoiceUnionOfOption,
	ChoiceValueOf,
	EnforceConfig,
	EnforceContextConfig,
	ExactConfig,
	ExactContextConfig,
	TypeNameOfOption,
	ValueOfOption,
	// Events
	DiscordEventName,
	Event,
	EventConfig,
	EventController,
	EventEntry,
	EventHandler,
	EventsNamespaceController,
	// Context menus
	Context,
	ContextConfig,
	ContextController,
	ContextEntry,
	ContextHandler,
	ContextNamespaceController,
	ContextTypeValue,
	MessageContextHandler,
	SmartContextConfig,
	UserContextHandler,
	// Middleware
	Middleware,
	MiddlewareChainEntry,
	MiddlewareConfig,
	MiddlewareController,
	MiddlewareData,
	MiddlewareEntry,
	MiddlewareHandler,
	MiddlewareNamespaceController,
	MiddlewareResult,
	// Prefix commands
	PrefixCommand,
	PrefixCommandArg,
	PrefixCommandArgs,
	PrefixCommandConfig,
	PrefixCommandController,
	PrefixCommandHandler,
	PrefixCommandResult,
	PrefixCommandsNamespaceController,
	PrefixConfig,
	PrefixSageOptions
} from './types/index.js'

export { ContextType } from './types/index.js'

// Export intent utilities
export { checkIntents, checkPrefixIntents, inferIntents, getIntentNames, validateIntents, REQUIRED_INTENTS } from './core/intents.js'

// Export command utilities
export {
	buildSlashCommands,
	buildContextCommands,
	addOptionToCommandBuilder,
	findCommandDifferences,
	FLASHCORE_KEY_COMMAND_HASH_PREFIX,
	FLASHCORE_KEY_COMMAND_REGISTER_ERROR,
	getContextType,
	getIntegrationType,
	registerCommands,
	registerCommandsToDiscord
} from './core/commands.js'
export type { RegisterCommandsOptions, RetryEntry } from './core/commands.js'

// Export permission utilities
export {
	aggregateCommandPermissions,
	aggregateContextPermissions,
	combinePermissions,
	getEffectivePermissions,
	getMissingPermissions,
	getPermissionNames,
	hasRequiredPermissions,
	PERMISSION_FLAGS,
	setGuildPermissionOverride
} from './core/permissions.js'
export type { AggregatedPermissions } from './core/permissions.js'

// Export logger
export { discordLogger } from './core/logger.js'

// Export client utilities
export { getClient, hasClient } from './core/client.js'

// Export handler utilities
export { getSage, extractCommandOptions, getCommandKey } from './core/utils.js'

// Export config helpers
export { createCommandConfig, createContextConfig } from './core/config-helpers.js'

// Export handler execution (for advanced usage)
export { executeCommandHandler } from './core/handlers/command.js'
export { executeAutocompleteHandler } from './core/handlers/autocomplete.js'
export { executeContextHandler } from './core/handlers/context.js'
export { executeEventHandler } from './core/handlers/event.js'
export { executePrefixCommandHandler } from './core/handlers/prefix-command.js'
export { handleInteraction } from './core/interactions.js'

// Export namespace controller factories
export {
	createCommandsNamespaceController,
	createContextNamespaceController,
	createEventsNamespaceController,
	createMiddlewareNamespaceController,
	createPrefixCommandsNamespaceController
} from './core/namespace-controllers.js'

// Export pre-instantiated namespace controllers for convenience
import {
	createCommandsNamespaceController,
	createContextNamespaceController,
	createEventsNamespaceController,
	createMiddlewareNamespaceController,
	createPrefixCommandsNamespaceController
} from './core/namespace-controllers.js'

/** Namespace controller for commands - access all commands, execute programmatically */
export const commands = createCommandsNamespaceController()
/** Namespace controller for events - access all events, emit programmatically */
export const events = createEventsNamespaceController()
/** Namespace controller for context menus - access all context menus */
export const context = createContextNamespaceController()
/** Namespace controller for middleware - access middleware chain */
export const middleware = createMiddlewareNamespaceController()
/** Namespace controller for prefix commands - access all prefix commands, execute programmatically */
export const prefixCommands = createPrefixCommandsNamespaceController()
