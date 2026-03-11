/**
 * CLI Type Helper Utilities
 *
 * These utilities enable TypeScript to properly infer option types from CLI configs,
 * providing a better developer experience with full type safety.
 */

import type { CliCommandConfig, TerminalCommandConfig } from './cli.js'

// =========================================================================
// Type Mapping
// =========================================================================

/**
 * Maps CLI option type strings to their TypeScript types.
 */
export type CliOptionTypeMap = {
	string: string
	boolean: boolean
	number: number
}

// =========================================================================
// Option Type Extraction
// =========================================================================

/**
 * Gets the type name from an option, defaulting to 'string' if omitted.
 */
export type TypeNameOfCliOption<O> = O extends { type: infer T }
	? T extends keyof CliOptionTypeMap
		? T
		: 'string'
	: 'string'

/**
 * Maps a CLI option to its base TypeScript type.
 */
export type BaseValueOfCliOption<O> = CliOptionTypeMap[TypeNameOfCliOption<O>]

/**
 * Checks if an option has a defined default value.
 */
export type HasDefault<O> = O extends { default: unknown }
	? O['default'] extends undefined
		? false
		: true
	: false

/**
 * Checks if an option is explicitly required.
 */
export type IsRequired<O> = O extends { required: true } ? true : false

/**
 * Determines if an option should always have a value (never undefined).
 * True if required OR has a default value.
 */
export type IsDefinedOption<O> = IsRequired<O> extends true ? true : HasDefault<O> extends true ? true : false

/**
 * Computes the final value type for a CLI option:
 * - required: true     -> T (never undefined)
 * - has default value  -> T (never undefined)
 * - otherwise          -> T | undefined
 */
export type ValueOfCliOption<O> = IsDefinedOption<O> extends true
	? BaseValueOfCliOption<O>
	: BaseValueOfCliOption<O> | undefined

// =========================================================================
// Option Name Extraction
// =========================================================================

/**
 * Extracts the option name from the --name format.
 * Example: '--verbose' -> 'verbose', '--dry-run' -> 'dry-run'
 */
export type ExtractOptionName<N extends string> = N extends `--${infer Name}` ? Name : N

// =========================================================================
// Options Object Inference
// =========================================================================

/**
 * Infers the complete typed options object from a CLI command config.
 * Maps each option's 'name' literal to its resolved TypeScript type.
 *
 * @example
 * ```ts
 * const config = {
 *   options: [
 *     { name: '--port', type: 'number', required: true },
 *     { name: '--verbose', type: 'boolean', default: false },
 *     { name: '--host', type: 'string' }
 *   ]
 * } as const
 *
 * type Options = CliOptionsFromConfig<typeof config>
 * // Results in:
 * // {
 * //   port: number        // required
 * //   verbose: boolean    // has default
 * //   host: string | undefined  // optional
 * // }
 * ```
 */
export type CliOptionsFromConfig<C extends CliCommandConfig> = C extends { options: readonly (infer O)[] }
	? {
			[K in O as ExtractOptionName<K extends { name: infer N } ? (N extends string ? N : never) : never>]: ValueOfCliOption<K>
		}
	: Record<string, never>

// =========================================================================
// Config Validation
// =========================================================================

/**
 * Ensures the config only contains valid CliCommandConfig properties.
 */
export type ExactCliConfig<C extends CliCommandConfig> = {
	[K in keyof C]: K extends keyof CliCommandConfig ? C[K] : never
}

/**
 * Enforces that no extra properties exist beyond CliCommandConfig.
 */
export type EnforceCliConfig<C extends CliCommandConfig> = Exclude<keyof C, keyof CliCommandConfig> extends never
	? C
	: never

/**
 * Smart CLI command config for use with createCliCommandConfig().
 * Combines exact matching and enforcement to enable proper type inference.
 */
export type SmartCliCommandConfig<C extends CliCommandConfig> = ExactCliConfig<C> & EnforceCliConfig<C>

// =========================================================================
// Terminal Command Type Helpers
// =========================================================================

/**
 * Infers the complete typed options object from a terminal command config.
 * Terminal configs share the same CliOptionConfig[] shape, so the type inference is identical.
 */
export type TerminalOptionsFromConfig<C extends TerminalCommandConfig> = C extends { options: readonly (infer O)[] }
	? {
			[K in O as ExtractOptionName<K extends { name: infer N } ? (N extends string ? N : never) : never>]: ValueOfCliOption<K>
		}
	: Record<string, never>

/**
 * Ensures the config only contains valid TerminalCommandConfig properties.
 */
export type ExactTerminalConfig<C extends TerminalCommandConfig> = {
	[K in keyof C]: K extends keyof TerminalCommandConfig ? C[K] : never
}

/**
 * Enforces that no extra properties exist beyond TerminalCommandConfig.
 */
export type EnforceTerminalConfig<C extends TerminalCommandConfig> = Exclude<keyof C, keyof TerminalCommandConfig> extends never
	? C
	: never

/**
 * Smart terminal command config for use with createTerminalCommandConfig().
 * Combines exact matching and enforcement to enable proper type inference.
 */
export type SmartTerminalCommandConfig<C extends TerminalCommandConfig> = ExactTerminalConfig<C> & EnforceTerminalConfig<C>
