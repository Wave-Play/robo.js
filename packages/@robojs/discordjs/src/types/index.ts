/**
 * Type exports for @robojs/discordjs
 */

// Common types
export type { BaseConfig, CommandDefaults, DiscordConfig, PrefixConfig, PluginState, SageOptions, TimeoutConfig } from './common.js'

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
	CommandsNamespaceController,
	SmartCommandConfig
} from './commands.js'

// Type helpers for config inference
export type {
	BaseValueOfOption,
	ChoiceUnionOfOption,
	ChoiceValueOf,
	EnforceConfig,
	EnforceContextConfig,
	ExactConfig,
	ExactContextConfig,
	TypeNameOfOption,
	ValueOfOption
} from './helpers.js'

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
	SmartContextConfig,
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

// Portal type augmentation (enables IDE autocomplete for portal.discordjs.*)
export type { DiscordPortalNamespace } from './portal.js'
// Side-effect import to ensure module augmentation is applied
import './portal.js'

// Prefix command types
export type {
	PrefixCommand,
	PrefixCommandArg,
	PrefixCommandArgs,
	PrefixCommandConfig,
	PrefixCommandController,
	PrefixCommandHandler,
	PrefixCommandResult,
	PrefixCommandsNamespaceController,
	PrefixSageOptions
} from './prefix-commands.js'

// Manifest metadata types
export type { DiscordjsAggregatedMetadata } from './manifest.js'
