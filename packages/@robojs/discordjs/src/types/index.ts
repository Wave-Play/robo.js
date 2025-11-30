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
	CommandResult,
	CommandsNamespaceController
} from './commands.js'

// Event types
export type {
	DiscordEventName,
	Event,
	EventConfig,
	EventController,
	EventEntry,
	EventHandler,
	EventsNamespaceController
} from './events.js'

// Context menu types
export type {
	Context,
	ContextConfig,
	ContextController,
	ContextEntry,
	ContextHandler,
	ContextNamespaceController,
	ContextTypeValue,
	MessageContextHandler,
	UserContextHandler
} from './context.js'
export { ContextType } from './context.js'

// Middleware types
export type {
	Middleware,
	MiddlewareChainEntry,
	MiddlewareConfig,
	MiddlewareController,
	MiddlewareData,
	MiddlewareEntry,
	MiddlewareHandler,
	MiddlewareNamespaceController,
	MiddlewareResult
} from './middleware.js'

// Portal type augmentation (enables IDE autocomplete for portal.discord.*)
export type { DiscordPortalNamespace } from './portal.js'
// Side-effect import to ensure module augmentation is applied
import './portal.js'
