/**
 * Type exports for @robojs/discordjs
 */

// Common types
export type { BaseConfig, DiscordConfig, PluginState, SageOptions } from './common.js'

// Command types
export type {
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
	CommandResult
} from './commands.js'

// Event types
export type {
	DiscordEventName,
	Event,
	EventConfig,
	EventController,
	EventEntry,
	EventHandler
} from './events.js'

// Context menu types
export type {
	Context,
	ContextConfig,
	ContextController,
	ContextEntry,
	ContextHandler,
	ContextTypeValue,
	MessageContextHandler,
	UserContextHandler
} from './context.js'
export { ContextType } from './context.js'

// Middleware types
export type {
	Middleware,
	MiddlewareConfig,
	MiddlewareController,
	MiddlewareData,
	MiddlewareEntry,
	MiddlewareHandler,
	MiddlewareResult
} from './middleware.js'
