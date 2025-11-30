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
	DiscordConfig,
	PluginState,
	SageOptions,
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
	// Events
	DiscordEventName,
	Event,
	EventConfig,
	EventController,
	EventEntry,
	EventHandler,
	// Context menus
	Context,
	ContextConfig,
	ContextController,
	ContextEntry,
	ContextHandler,
	ContextTypeValue,
	MessageContextHandler,
	UserContextHandler,
	// Middleware
	Middleware,
	MiddlewareConfig,
	MiddlewareController,
	MiddlewareData,
	MiddlewareEntry,
	MiddlewareHandler,
	MiddlewareResult
} from './types/index.js'

export { ContextType } from './types/index.js'

// Export intent utilities
export { checkIntents, inferIntents, getIntentNames, validateIntents, REQUIRED_INTENTS } from './core/intents.js'

// Export command utilities
export {
	buildSlashCommands,
	buildContextCommands,
	addOptionToCommandBuilder,
	findCommandDifferences,
	getContextType,
	getIntegrationType
} from './core/commands.js'

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

// Export handler execution (for advanced usage)
export { executeCommandHandler } from './core/handlers/command.js'
export { executeAutocompleteHandler } from './core/handlers/autocomplete.js'
export { executeContextHandler } from './core/handlers/context.js'
export { executeEventHandler } from './core/handlers/event.js'
export { handleInteraction } from './core/interactions.js'
