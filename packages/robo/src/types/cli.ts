/**
 * CLI Extension Types
 *
 * Type definitions for plugin and project CLI commands and extensions.
 * Enables plugins to add new commands and extend existing ones with options.
 */

import type { Logger } from '../core/logger.js'

// =========================================================================
// Option Types
// =========================================================================

/**
 * Configuration for a CLI option (flag).
 */
export interface CliOptionConfig {
	/** Short flag (e.g., '-t') */
	alias: string
	/** Long flag (e.g., '--tunnel') */
	name: string
	/** Description shown in help text */
	description: string
	/** Type for validation and parsing */
	type?: 'boolean' | 'string' | 'number'
	/** Default value if not provided */
	default?: unknown
	/** Whether this option is required */
	required?: boolean
}

// =========================================================================
// Command Types
// =========================================================================

/**
 * Configuration for a CLI command.
 */
export interface CliCommandConfig {
	/** Command description shown in help text */
	description: string
	/** Options this command accepts */
	options?: readonly CliOptionConfig[]
	/** Whether this command accepts positional arguments */
	positionalArgs?: boolean
	/** Priority for conflict resolution (higher wins). Default: 0 */
	priority?: number
}

import type { CliOptionsFromConfig } from './cli-helpers.js'

/**
 * Context passed to CLI command handlers.
 * Pass your config type as the generic parameter to get typed options.
 *
 * @example
 * ```ts
 * import { createCliCommandConfig, type CliContext } from 'robo.js/cli.js'
 *
 * export const config = createCliCommandConfig({
 *   description: 'My command',
 *   options: [
 *     { alias: '-n', name: '--name', type: 'string', required: true }
 *   ]
 * } as const)
 *
 * export default function myCommand(ctx: CliContext<typeof config>) {
 *   ctx.options.name // TypeScript knows this is `string`
 * }
 * ```
 */
export interface CliContext<C extends CliCommandConfig | undefined = undefined> {
	/** Parsed positional arguments */
	args: string[]
	/** Parsed options (flag values) - typed when using createCliCommandConfig */
	options: C extends CliCommandConfig ? CliOptionsFromConfig<C> : Record<string, unknown>
	/** Logger instance (forked for plugins) */
	logger: Logger
	/** Project working directory */
	cwd: string
	/** Raw argv after command name */
	argv: string[]
	/** Result data from command handler (available to after hooks) */
	result?: unknown
}

/**
 * CLI command handler function signature.
 * Handlers can optionally return a value that will be available in after hooks via context.result.
 */
export type CliHandler = (context: CliContext) => unknown | Promise<unknown>

/**
 * Complete CLI command module exports.
 */
export interface CliCommandModule {
	/** Command configuration */
	config: CliCommandConfig
	/** The command handler */
	default: CliHandler
}

// =========================================================================
// Extension Types
// =========================================================================

/**
 * Configuration for extending an existing CLI command.
 */
export interface CliExtendConfig {
	/** Options to add to the existing command */
	options?: CliOptionConfig[]
	/** Priority for option conflicts (higher wins). Default: 0 */
	priority?: number
}

/**
 * Hook that runs before the original command handler.
 * Return false to abort the command execution.
 */
export type CliBeforeHook = (context: CliContext) => boolean | void | Promise<boolean | void>

/**
 * Hook that runs after the original command handler completes.
 */
export type CliAfterHook = (context: CliContext) => void | Promise<void>

/**
 * Complete CLI extension module exports.
 */
export interface CliExtendModule {
	/** Extension configuration */
	config: CliExtendConfig
	/** Hook that runs before the command */
	before?: CliBeforeHook
	/** Hook that runs after the command */
	after?: CliAfterHook
}

// =========================================================================
// Terminal Command Types
// =========================================================================

/**
 * Configuration for an interactive terminal command.
 * Terminal commands are `/`-prefixed commands in the interactive CLI (robo dev / robo start TTY).
 * Convention: src/robo/terminal/commands/ping.ts → /ping in the interactive terminal.
 */
export interface TerminalCommandConfig {
	/** Command description shown in help text */
	description: string
	/** Options this command accepts */
	options?: readonly CliOptionConfig[]
	/** Whether this command accepts positional arguments */
	positionalArgs?: boolean
	/** Priority for conflict resolution (higher wins). Default: 0 */
	priority?: number
}

import type { TerminalOptionsFromConfig } from './cli-helpers.js'

/**
 * Context passed to terminal command handlers.
 * Pass your config type as the generic parameter to get typed options.
 */
export interface TerminalContext<C extends TerminalCommandConfig | undefined = undefined> {
	/** Parsed positional arguments */
	args: string[]
	/** Parsed options (flag values) - typed when using createTerminalCommandConfig */
	options: C extends TerminalCommandConfig ? TerminalOptionsFromConfig<C> : Record<string, unknown>
	/** Project configuration */
	config: import('./config.js').Config
	/** Runtime provider for state/flashcore access */
	runtime?: import('../cli/utils/cli-runtime-provider.js').RuntimeProvider
	/** Write text to stdout */
	write: (text: string) => void
	/**
	 * Drawer API for displaying persistent content below the input prompt.
	 * Only available when the interactive CLI is active (TTY in dev mode).
	 */
	drawer?: {
		/** Show drawer with the given content lines below the input prompt */
		show: (lines: string[]) => void
		/** Hide the drawer and restore normal layout */
		hide: () => void
		/** Whether the drawer is currently visible */
		isOpen: () => boolean
	}
}

/**
 * Terminal command handler function signature.
 */
export type TerminalHandler = (context: TerminalContext) => unknown | Promise<unknown>

/**
 * Complete terminal command module exports.
 */
export interface TerminalCommandModule {
	/** Command configuration */
	config: TerminalCommandConfig
	/** The command handler */
	default: TerminalHandler
}

// =========================================================================
// Manifest Types
// =========================================================================

/**
 * Terminal command entry in the manifest.
 */
export interface TerminalCommandEntry {
	/** Handler file path (relative to build directory or node_modules) */
	path: string
	/** Plugin that provides this command (null for project) */
	plugin: string | null
	/** Command description */
	description: string
	/** Priority for conflict resolution */
	priority: number
	/** Options defined by this command */
	options?: CliOptionConfig[]
	/** Whether this command accepts positional arguments */
	positionalArgs?: boolean
	/** Subcommands (keys are subcommand names) */
	subcommands?: string[]
}

/**
 * CLI command entry in the manifest.
 */
export interface CliCommandEntry {
	/** Handler file path (relative to build directory or node_modules) */
	path: string
	/** Plugin that provides this command (null for project) */
	plugin: string | null
	/** Command description */
	description: string
	/** Priority for conflict resolution */
	priority: number
	/** Options defined by this command */
	options?: CliOptionConfig[]
	/** Whether this command accepts positional arguments */
	positionalArgs?: boolean
	/** Subcommands (keys are subcommand names) */
	subcommands?: string[]
}

/**
 * CLI extension entry in the manifest.
 */
export interface CliExtensionEntry {
	/** Extension file path */
	path: string
	/** Plugin that provides this extension (null for project) */
	plugin: string | null
	/** Priority for option conflicts */
	priority: number
	/** Options added by this extension */
	options?: CliOptionConfig[]
	/** Whether this extension has a before hook */
	hasBefore?: boolean
	/** Whether this extension has an after hook */
	hasAfter?: boolean
}

/**
 * CLI manifest structure.
 * Stored at .robo/manifest/cli/@.json (mode-agnostic)
 */
export interface CliManifest {
	/** New commands indexed by command path (e.g., 'tunnel start') */
	commands: Record<string, CliCommandEntry>
	/** Extensions indexed by target command name */
	extensions: Record<string, CliExtensionEntry[]>
	/** Interactive terminal commands indexed by command path (e.g., 'tunnel start') */
	terminal: Record<string, TerminalCommandEntry>
}

// =========================================================================
// Runtime Types
// =========================================================================

/**
 * Loaded CLI extension with resolved handlers.
 */
export interface LoadedCliExtension {
	/** Extension configuration */
	config: CliExtendConfig
	/** Plugin that provides this extension */
	plugin: string | null
	/** Before hook function */
	before?: CliBeforeHook
	/** After hook function */
	after?: CliAfterHook
}

/**
 * Loaded CLI command with resolved handler.
 */
export interface LoadedCliCommand {
	/** Command configuration */
	config: CliCommandConfig
	/** Plugin that provides this command */
	plugin: string | null
	/** Command handler function */
	handler: CliHandler
}

// =========================================================================
// Type-Safe Config Helpers
// =========================================================================

// Re-export type utilities from cli-helpers
export type {
	CliOptionsFromConfig,
	SmartCliCommandConfig,
	CliOptionTypeMap,
	ValueOfCliOption,
	ExtractOptionName,
	TerminalOptionsFromConfig,
	SmartTerminalCommandConfig
} from './cli-helpers.js'

export default {}
